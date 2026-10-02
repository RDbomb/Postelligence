import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { parseJsonBody } from "@/lib/validation/http";
import { emailAddress, httpUrl, platformId } from "@/lib/validation/schemas";
import { scheduleNextAutomationSlot } from "@/lib/automation/engine";
import { cancelAutomationLoop } from "@/lib/inngest/client";

/**
 * Every field is optional because the handler applies its own `|| default` for
 * each one and the row has a DB default for every column â€” an absent field means
 * "use the default", exactly as before.
 *
 * `categories` is an enum rather than a bounded string: `automation/trigger`
 * interpolates it into a Google News URL *path*
 * (`headlines/section/topic/${cat.toUpperCase()}`) without encoding, so a free
 * string there is a path-injection foothold. The seven values are precisely
 * those the automation UI offers. `keywords` reach the same URL but via
 * `encodeURIComponent`, so they only need bounding.
 *
 * `timezone` is fed to `Intl.DateTimeFormat`, and `post_time`/`post_times` land
 * in a Postgres `time` column, so both are shape-checked.
 */
const timeOfDay = z
  .string()
  .trim()
  .max(8)
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Must be a HH:MM or HH:MM:SS time.");

const automationCategory = z.enum([
  "world",
  "technology",
  "business",
  "sports",
  "entertainment",
  "science",
  "health",
]);

const automationKeywords = z.array(z.string().trim().min(1).max(100)).max(50);
const automationPlatforms = z.array(platformId).max(20);
const automationCategories = z.array(automationCategory).max(20);

/** Per-time-slot overrides, keyed by a UTC "HH:MM:SS" slot. */
const automationTimeConfig = z.object({
  platforms: automationPlatforms.optional(),
  categories: automationCategories.optional(),
  keywords: automationKeywords.optional(),
});

const AutomationSettingsBody = z.object({
  is_enabled: z.boolean().optional(),
  post_time: timeOfDay.optional(),
  mode: z.enum(["manual", "automatic"]).optional(),
  platforms: automationPlatforms.optional(),
  categories: automationCategories.optional(),
  keywords: automationKeywords.optional(),
  // "" is meaningful: it means "fall back to my account email", which is what
  // `approval_email || user.email` already did.
  approval_email: z.union([z.literal(""), emailAddress.max(320)]).optional(),
  timezone: z
    .string()
    .trim()
    .max(64)
    .regex(/^[A-Za-z0-9_+\-/]+$/, "Must be a valid IANA time zone.")
    .optional(),
  schedule_type: z.enum(["daily", "weekdays", "weekly", "monthly"]).optional(),
  // Not `.min(1)`: the UI lets you delete the last time slot, and the handler
  // already falls back to "09:00:00" for an empty array.
  post_times: z.array(timeOfDay).max(24).optional(),
  post_days: z
    .array(
      z.enum([
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
      ]),
    )
    .max(7)
    .optional(),
  post_day_of_month: z.number().int().min(1).max(31).optional(),
  frontend_url: z.string().trim().max(2_048).pipe(httpUrl).optional(),
  use_same_settings: z.boolean().optional(),
  time_configs: z.record(timeOfDay, automationTimeConfig).optional(),
});

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("automation_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // If no settings exist, return default settings structure
  if (!data) {
    return NextResponse.json({
      settings: {
        is_enabled: true,
        post_time: "09:00:00",
        mode: "manual",
        platforms: [],
        categories: [],
        keywords: [],
        approval_email: user.email || "",
      }
    });
  }

  return NextResponse.json({ settings: data });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = await parseJsonBody(req, AutomationSettingsBody);
  if (!parsed.success) return parsed.response;
  const {
    is_enabled,
    post_time,
    mode,
    platforms,
    categories,
    keywords,
    approval_email,
    timezone,
    schedule_type,
    post_times,
    post_days,
    post_day_of_month,
    frontend_url,
    use_same_settings,
    time_configs,
  } = parsed.data;

  try {
    const { data, error } = await supabase
      .from("automation_settings")
      .upsert({
        user_id: user.id,
        is_enabled: is_enabled !== undefined ? !!is_enabled : true,
        post_time: (post_times && post_times[0]) || post_time || "09:00:00",
        mode: mode || "manual",
        platforms: platforms || [],
        categories: categories || [],
        keywords: keywords || [],
        approval_email: approval_email || user.email || "",
        timezone: timezone || "UTC",
        schedule_type: schedule_type || "daily",
        post_times: post_times || ["09:00:00"],
        post_days: post_days || ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"],
        post_day_of_month: post_day_of_month !== undefined ? Number(post_day_of_month) : 1,
        frontend_url: frontend_url || "http://localhost:3000",
        use_same_settings: use_same_settings !== undefined ? !!use_same_settings : true,
        time_configs: time_configs || {},
      }, { onConflict: "user_id" })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ settings: data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "";
    return NextResponse.json({ error: message || "Invalid payload" }, { status: 400 });
  }
}
