import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createClient as createBaseClient } from "@supabase/supabase-js";
import { parseSearchParams } from "@/lib/validation/http";
import { uuid } from "@/lib/validation/schemas";
import { schedulePostWithInngest } from "@/lib/inngest/client";
import { createHash } from "crypto";
import { PLATFORM_COMPOSE_RULES, type ComposePlatformId, type PlatformComposeRule } from "@/lib/compose/platform-rules";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScheduledPost } from "@/types";
import { generateWithGeminiCascade } from "@/lib/gemini";

export const maxDuration = 60; // Allow execution to take up to 60 seconds

/**
 * Both params are optional: the global cron tick (pg_cron / a service-role
 * caller) sends neither, and the admin panel's manual trigger sends neither
 * either. Only the Automation page's "test run" sends both.
 *
 * `user_id` selects which account the run impersonates, so it must be a
 * well-formed ID before it reaches `getUserById` â€” note the handler only honours
 * it at all when the caller already presented the service-role key.
 * `test` keeps its strict "true" comparison rather than becoming a loose boolean,
 * so `?test=1` does not newly start bypassing the schedule-time check.
 */
const AutomationTriggerQuery = z.object({
  user_id: uuid.optional(),
  test: z.enum(["true", "false"]).optional(),
});
const POLLINATIONS_IMAGE_URL = "https://image.pollinations.ai/prompt/";

// Per-time-slot overrides stored on automation_settings.time_configs when
// use_same_settings is false.
interface AutomationTimeConfig {
  platforms?: string[] | null;
  categories?: string[] | null;
  keywords?: string[] | null;
}

// Row shape of the `automation_settings` table (only the columns read here).
interface AutomationSettings {
  user_id: string;
  mode: string;
  approval_email: string | null;
  is_enabled?: boolean;
  timezone?: string | null;
  schedule_type?: string | null;
  post_time?: string | null;
  post_times?: string[] | null;
  post_days?: string[] | null;
  post_day_of_month?: number | string | null;
  platforms?: string[] | null;
  categories?: string[] | null;
  keywords?: string[] | null;
  use_same_settings?: boolean | null;
  time_configs?: Record<string, AutomationTimeConfig> | null;
}

// Row shape of the `automation_logs` table (only the columns read here).
interface AutomationLogRow {
  id: string;
  user_id: string;
  trend_title: string;
  caption: string;
  media_url: string | null;
  mode: string;
  status: string;
  scheduled_post_id?: string | null;
  created_at?: string;
}

type AutomationRunResult =
  | { success: true; mode: "automatic"; log: AutomationLogRow; scheduledPost: ScheduledPost }
  | { success: true; mode: "manual"; log: AutomationLogRow; emailSent: boolean; emailError: string | null };

// One entry per (user, time slot) processed by the global cron tick.
interface GlobalTickResult {
  user_id: string;
  success: boolean;
  timeSlot: string;
  response?: AutomationRunResult;
  error?: string;
}

// Preserves the previous `err.message || fallback` behaviour while keeping the
// caught value typed as `unknown`: Supabase/Postgrest errors are plain objects
// carrying a `message`, not Error instances.
function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "object" && err !== null) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  if (typeof err === "string" && err) return err;
  return fallback;
}

function getNextPostTime(postTimeStr: string): Date {
  const [h, m, s] = postTimeStr.split(":").map(Number);
  const now = new Date();
  const target = new Date();
  target.setHours(h, m, s || 0, 0);

  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  return target;
}

function getNextPostTimeUTC(postTimeStr: string): Date {
  const [h, m, s] = postTimeStr.split(":").map(Number);
  const now = new Date();
  const target = new Date();
  target.setUTCHours(h, m, s || 0, 0);

  if (target.getTime() <= now.getTime()) {
    target.setUTCDate(target.getUTCDate() + 1);
  }
  return target;
}

function isScheduleActiveOnDay(
  targetTime: Date,
  settings: Pick<AutomationSettings, "timezone" | "schedule_type" | "post_days" | "post_day_of_month">
): boolean {
  const tz = settings.timezone || "UTC";
  const type = settings.schedule_type || "daily";

  if (type === "daily") return true;

  const dayOfWeek = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: tz,
  }).format(targetTime).toLowerCase();

  if (type === "weekdays") {
    return ["monday", "tuesday", "wednesday", "thursday", "friday"].includes(dayOfWeek);
  }

  if (type === "weekly") {
    const activeDays = settings.post_days || [];
    return activeDays.map((d: string) => d.toLowerCase()).includes(dayOfWeek);
  }

  if (type === "monthly") {
    const localDayOfMonth = Number(
      new Intl.DateTimeFormat("en-US", {
        day: "numeric",
        timeZone: tz,
      }).format(targetTime)
    );
    return localDayOfMonth === Number(settings.post_day_of_month || 1);
  }

  return false;
}

export async function GET(req: NextRequest) {
  return triggerAutomation(req);
}

export async function POST(req: NextRequest) {
  return triggerAutomation(req);
}

async function triggerAutomation(req: NextRequest) {
  const parsedQuery = parseSearchParams(req.nextUrl, AutomationTriggerQuery);
  if (!parsedQuery.success) return parsedQuery.response;
  const { user_id: queryUserId, test: testParam } = parsedQuery.data;

  const authHeader = req.headers.get("Authorization");
  const isServiceRole = authHeader === `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`;

  let supabase = await createClient();
  let user = null;

  // Global cron polling was replaced by Inngest event-driven loops.
  if (isServiceRole && !req.headers.get("X-User-Id") && !queryUserId) {
    return NextResponse.json({ message: "Global cron polling has been replaced by Inngest event-driven loops." });
  }

  // 2. Resolve Single User Context (Test run or targeted bypass calls)
  if (isServiceRole) {
    const targetUserId = req.headers.get("X-User-Id") || queryUserId;
    if (targetUserId) {
      const baseClient = createBaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } }
      );
      const { data: { user: foundUser } } = await baseClient.auth.admin.getUserById(targetUserId);
      user = foundUser;
      supabase = baseClient;
    }
  } else {
    const { data: { user: authedUser } } = await supabase.auth.getUser();
    user = authedUser;
  }

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = user.id;
  const isManualTest = testParam === "true";

  try {
    const { data: settings, error: settingsError } = await supabase
      .from("automation_settings")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (settingsError) throw settingsError;
    if (!settings) {
      return NextResponse.json({ error: "Automation settings not configured." }, { status: 400 });
    }

    // Time Check for single manual trigger runs (bypass if manual test)
    if (!isManualTest) {
      const times = settings.post_times || [settings.post_time || "09:00:00"];
      let matched = false;
      const evaluationTime = new Date();

      for (const timeStr of times) {
        const targetTime = getNextPostTimeUTC(timeStr);
        const triggerTime = new Date(targetTime.getTime() - 10 * 60000);
        
        const isSameMinute = 
          evaluationTime.getUTCFullYear() === triggerTime.getUTCFullYear() &&
          evaluationTime.getUTCMonth() === triggerTime.getUTCMonth() &&
          evaluationTime.getUTCDate() === triggerTime.getUTCDate() &&
          evaluationTime.getUTCHours() === triggerTime.getUTCHours() &&
          evaluationTime.getUTCMinutes() === triggerTime.getUTCMinutes();

        if (isSameMinute) {
          if (isScheduleActiveOnDay(targetTime, settings)) {
            matched = true;
            break;
          }
        }
      }

      if (!matched) {
        return NextResponse.json({
          message: `Not the scheduled run time (runs 10 minutes before posting).`,
        });
      }
    }

    const res = await runAutomationForUser(supabase, userId, settings, user.email || "", req.nextUrl.origin);
    return NextResponse.json(res);

  } catch (err: unknown) {
    console.error("Automation Single User Error:", err);
    return NextResponse.json({ error: errorMessage(err, "Failed during automation processing.") }, { status: 500 });
  }
}

function cleanCaption(text: string): string {
  if (!text) return "";
  
  // 1. Remove the standard Pollinations support block
  let cleaned = text.replace(/(?:\r?\n)*---\s*\r?\n\*\*Support Pollinations\.AI\*\*[\s\S]*/gi, "");
  cleaned = cleaned.replace(/(?:\r?\n)*---\s*\r?\nSupport Pollinations\.AI[\s\S]*/gi, "");
  
  // 2. Remove any other mentions of Powered by Pollinations or Ad footers
  cleaned = cleaned.replace(/(?:\r?\n)*Powered by Pollinations\.AI[\s\S]*/gi, "");
  cleaned = cleaned.replace(/(?:\r?\n)*\*\*Support Pollinations\.AI\*\*[\s\S]*/gi, "");
  cleaned = cleaned.replace(/(?:\r?\n)*ðŸŒ¸\s*\*\*Ad\*\*\s*ðŸŒ¸[\s\S]*/gi, "");
  
  // 3. Remove trailing/leading quotes or markdown code blocks if the LLM returned them
  cleaned = cleaned.replace(/^["'`\s]+|["'`\s]+$/g, "").trim();
  
  return cleaned;
}

// Same idea as Compose's per-platform character limits (lib/compose/platform-rules.ts)
// but applied here to a single shared caption: works out the tightest limit
// among this automation run's target platforms, and a safe target band
// under it, so a Bluesky-included run doesn't get padded past 300 chars
// while a LinkedIn/Facebook-only run isn't needlessly capped short.
function getTargetCaptionBand(platforms: string[]): { min: number; max: number; hardCap: number; tightest: { name: string; limit: number } } {
  const limits = platforms
    .map((p) => PLATFORM_COMPOSE_RULES[p as ComposePlatformId])
    .filter((rule): rule is PlatformComposeRule => Boolean(rule));

  // Fall back to Instagram's limit if none of the selected platforms have a
  // known rule (shouldn't normally happen â€” automation's platform picker
  // only offers platforms that exist in PLATFORM_COMPOSE_RULES).
  const tightestRule = limits.length
    ? limits.reduce((a, b) => (b.captionLimit < a.captionLimit ? b : a))
    : PLATFORM_COMPOSE_RULES.instagram;

  const hardCap = tightestRule.captionLimit;
  // Aim for a normal-length social caption that comfortably fits â€” never
  // stretch all the way to the limit just because a generous platform
  // (Facebook, YouTube) is also selected.
  const max = Math.max(120, Math.min(hardCap - 10, 600));
  const min = Math.max(80, Math.floor(max * 0.7));
  return { min, max, hardCap, tightest: { name: tightestRule.name, limit: hardCap } };
}

function ensureCharacterLimit(text: string, band: { min: number; max: number; hardCap: number }): string {
  let cleaned = text.trim();
  const { min, max, hardCap } = band;

  if (cleaned.length >= min && cleaned.length <= max) {
    return cleaned;
  }

  if (cleaned.length < min) {
    const extraCTAs = [
      " Let us know your thoughts in the comments below! We would love to hear your perspective on this exciting development.",
      " What is your take on this change? Drop a comment below and share your views with the community!",
      " How do you think this will impact the industry moving forward? Let's discuss in the comment section below!",
      " Let's get the conversation started. What are your initial impressions about this? Share in the comments!"
    ];
    let paddingIndex = 0;
    while (cleaned.length < min && paddingIndex < extraCTAs.length) {
      // Never pad past the hard cap even while reaching for the minimum â€”
      // a short Bluesky-safe caption should stay short, not get pushed
      // over 300 chars trying to hit a generic minimum.
      if (cleaned.length + extraCTAs[paddingIndex].length > hardCap) break;
      cleaned += extraCTAs[paddingIndex];
      paddingIndex++;
    }

    const hashtags = ["#trends", "#news", "#innovation", "#future", "#growth", "#viral"];
    let hashIndex = 0;
    while (cleaned.length < min && hashIndex < hashtags.length) {
      if (cleaned.length + hashtags[hashIndex].length + 1 > hardCap) break;
      cleaned += ` ${hashtags[hashIndex]}`;
      hashIndex++;
    }

    while (cleaned.length < min && cleaned.length < hardCap) {
      cleaned += ".";
    }
  }

  if (cleaned.length > max) {
    let cutIndex = max;
    const searchFloor = Math.max(0, Math.floor(max * 0.6));
    for (let i = max; i >= searchFloor; i--) {
      const char = cleaned[i];
      if (char === "." || char === "!" || char === "?") {
        cutIndex = i + 1;
        break;
      }
    }
    cleaned = cleaned.slice(0, cutIndex).trim();
  }

  // Absolute safety net regardless of the above â€” never exceed the
  // tightest selected platform's real hard limit.
  if (cleaned.length > hardCap) {
    cleaned = cleaned.slice(0, hardCap).trim();
  }

  return cleaned;
}

function extractCleanText(text: string): string {
  let cleaned = text.trim();
  
  if (cleaned.startsWith('{"role":') || cleaned.includes('"reasoning":') || cleaned.includes('"caption"')) {
    try {
      const parsed = JSON.parse(cleaned);
      if (parsed.caption) return parsed.caption;
      if (parsed.content) return parsed.content;
      if (parsed.choices?.[0]?.message?.content) return parsed.choices[0].message.content;
      if (parsed.result) return parsed.result;
    } catch {}

    const captionRegex = /"caption"\s*:\s*\\?"([^"]+)\\?"/i;
    let match = cleaned.match(captionRegex);
    if (!match) {
      const escapedCaptionRegex = /\\"caption\\"\s*:\s*\\"([^\\"]+)\\"/i;
      match = cleaned.match(escapedCaptionRegex);
    }
    if (match && match[1]) {
      let content = match[1].trim();
      content = content.replace(/\\n/g, "\n");
      return content;
    }

    const markers = ["Write content:", "Draft:", "Caption:", "content:", "Drafts:"];
    for (const marker of markers) {
      const idx = cleaned.toLowerCase().indexOf(marker.toLowerCase());
      if (idx !== -1) {
        let afterMarker = cleaned.slice(idx + marker.length).trim();
        afterMarker = afterMarker.replace(/^[:\s\\"']+/g, "");
        const endQuoteIdx = afterMarker.indexOf('\\"');
        if (endQuoteIdx !== -1) {
          afterMarker = afterMarker.slice(0, endQuoteIdx);
        }
        afterMarker = afterMarker.replace(/["'\}]+$/, "").trim();
        afterMarker = afterMarker.replace(/\\n/g, "\n");
        if (afterMarker.length > 30) {
          return afterMarker;
        }
      }
    }

    const lastQuoteIndex = cleaned.lastIndexOf('\\"');
    if (lastQuoteIndex !== -1) {
      let contentPart = cleaned.slice(lastQuoteIndex + 2);
      contentPart = contentPart.replace(/["'\}]+$/, "").trim();
      contentPart = contentPart.replace(/\\n/g, "\n");
      if (contentPart.length > 30) {
        return contentPart;
      }
    }
  }

  cleaned = cleaned.replace(/^["'`\s]+|["'`\s]+$/g, "").trim();
  return cleaned;
}

async function scrapeRealWebImage(query: string): Promise<{ buffer: ArrayBuffer; contentType: string } | null> {
  const cleanQuery = query.replace(/[^\w\s]/gi, " ").trim();
  const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

  // Strategy 1: Bing Image Search HTML Scrape
  try {
    const bingUrl = `https://www.bing.com/images/search?q=${encodeURIComponent(cleanQuery)}&form=HDRSC2`;
    const res = await fetch(bingUrl, {
      headers: {
        "User-Agent": userAgent,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      }
    });
    if (res.ok) {
      const html = await res.text();
      const murlMatches = html.match(/murl&quot;:&quot;(https?:\/\/[^&"]+)&quot;/g);
      if (murlMatches && murlMatches.length > 0) {
        for (let i = 0; i < Math.min(murlMatches.length, 8); i++) {
          const rawMatch = murlMatches[i];
          const urlMatch = rawMatch.match(/https?:\/\/[^&"]+/);
          if (urlMatch && urlMatch[0]) {
            const imgUrl = urlMatch[0];
            try {
              const imgRes = await fetch(imgUrl, {
                headers: { "User-Agent": userAgent }
              });
              if (imgRes.ok && imgRes.headers.get("content-type")?.startsWith("image/")) {
                const buffer = await imgRes.arrayBuffer();
                if (buffer.byteLength > 5000) {
                  return { buffer, contentType: imgRes.headers.get("content-type") || "image/jpeg" };
                }
              }
            } catch {}
          }
        }
      }
    }
  } catch (err) {
    console.warn("Bing image scrape failed:", err);
  }

  // Strategy 2: DuckDuckGo HTML Scrape
  try {
    const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(cleanQuery)}`;
    const res = await fetch(ddgUrl, {
      headers: {
        "User-Agent": userAgent,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      }
    });
    if (res.ok) {
      const html = await res.text();
      const imgMatches = html.match(/\/\/external-content\.duckduckgo\.com\/iu\/\?u=([^&"']+)/g);
      if (imgMatches && imgMatches.length > 0) {
        for (let i = 0; i < Math.min(imgMatches.length, 5); i++) {
          const rawUrl = imgMatches[i].replace(/^\/\//, "https://");
          const targetUrl = decodeURIComponent(rawUrl.split("u=")[1] || rawUrl);
          try {
            const imgRes = await fetch(targetUrl, {
              headers: { "User-Agent": userAgent }
            });
            if (imgRes.ok && imgRes.headers.get("content-type")?.startsWith("image/")) {
              const buffer = await imgRes.arrayBuffer();
              if (buffer.byteLength > 5000) {
                return { buffer, contentType: imgRes.headers.get("content-type") || "image/jpeg" };
              }
            }
          } catch {}
        }
      }
    }
  } catch (err) {
    console.warn("DuckDuckGo image scrape failed:", err);
  }

  return null;
}

// core automation script
async function runAutomationForUser(
  supabase: SupabaseClient,
  userId: string,
  settings: AutomationSettings,
  userEmail: string,
  origin: string,
  activePostTime?: string
): Promise<AutomationRunResult> {
  const { mode, approval_email } = settings;
  const post_time = activePostTime || settings.post_time || "09:00:00";

  let platforms = settings.platforms;
  let categories = settings.categories;
  let keywords = settings.keywords;

  if (settings.use_same_settings === false && settings.time_configs) {
    const customConfig = settings.time_configs[post_time];
    if (customConfig) {
      if (customConfig.platforms) platforms = customConfig.platforms;
      if (customConfig.categories) categories = customConfig.categories;
      if (customConfig.keywords) keywords = customConfig.keywords;
    }
  }

  if (!platforms || platforms.length === 0) {
    throw new Error("No target platforms configured for automation.");
  }

  // 1. Fetch News / Trend Topic
  let trendTitle = "";
  let trendExplanation = "";

  try {
    // Query recently used titles for this user to avoid duplicates
    const { data: recentLogs } = await supabase
      .from("automation_logs")
      .select("trend_title")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30);
    const usedTitles = new Set(
      ((recentLogs || []) as Array<Pick<AutomationLogRow, "trend_title">>).map((l) =>
        l.trend_title.toLowerCase().trim()
      )
    );

    let rssUrl = "";
    if (keywords && keywords.length > 0) {
      const query = keywords.join(" ");
      rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
    } else {
      const cat = (categories && categories[0]) || "WORLD";
      rssUrl = `https://news.google.com/rss/headlines/section/topic/${cat.toUpperCase()}?hl=en-US&gl=US&ceid=US:en`;
    }

    const feedRes = await fetch(rssUrl);
    if (feedRes.ok) {
      const xml = await feedRes.text();
      const itemRegex = /<item>([\s\S]*?)<\/item>/g;
      
      const unescape = (str: string) => str
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/<[^>]*>/g, "");

      let match;
      let fallbackTitle = "";
      let fallbackDesc = "";

      while ((match = itemRegex.exec(xml)) !== null) {
        const content = match[1];
        const rawTitle = content.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "";
        const rawDesc = content.match(/<description>([\s\S]*?)<\/description>/)?.[1] || "";

        const candidateTitle = unescape(rawTitle).replace(/\s+-\s+[^-]+$/, "").trim();
        const candidateDesc = unescape(rawDesc).trim();

        if (candidateTitle) {
          if (!fallbackTitle) {
            fallbackTitle = candidateTitle;
            fallbackDesc = candidateDesc;
          }

          if (!usedTitles.has(candidateTitle.toLowerCase().trim())) {
            trendTitle = candidateTitle;
            trendExplanation = candidateDesc;
            break;
          }
        }
      }

      // If all parsed items are already used, fallback to the top headline
      if (!trendTitle) {
        trendTitle = fallbackTitle;
        trendExplanation = fallbackDesc;
      }
    }
  } catch (e) {
    console.error("RSS fetch failed, using fallback:", e);
  }

  // Fallback
  if (!trendTitle) {
    trendTitle = "AI Agents Transform Office Productivity";
    trendExplanation = "Businesses are deploying autonomous AI agents to automate workflows, boosting operational efficiency by 40%.";
  }

  const variationSeed = `${userId}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  // Platform-aware target: same rules Compose uses (lib/compose/platform-rules.ts),
  // applied to whichever platforms this automation run actually targets â€”
  // so a run that includes Bluesky writes short, and a LinkedIn/Facebook-only
  // run isn't needlessly capped down to Bluesky-length.
  const captionBand = getTargetCaptionBand(platforms);
  const targetPlatformNames = platforms
    .map((p: string) => PLATFORM_COMPOSE_RULES[p as ComposePlatformId]?.name)
    .filter(Boolean)
    .join(", ") || platforms.join(", ");

  const systemPrompt = `You are a viral social media strategist and content copywriter. Generate a comprehensive, detailed, and high-performing social media post caption about the following trend.

Trend: "${trendTitle}"
Description: "${trendExplanation}"

Requirements:
- Target Length: Write a caption of roughly ${captionBand.min}-${captionBand.max} characters. This post will be published as-is to: ${targetPlatformNames}. The tightest of these is ${captionBand.tightest.name} at ${captionBand.tightest.limit} characters, so the caption must NEVER exceed ${captionBand.hardCap} characters no matter what.
- Uniqueness: Ensure this text is completely unique in style, vocabulary, phrasing, and tone from other generations on the same topic (Variation Seed: ${variationSeed}).
- Do NOT include any reasoning, planning, or character counting calculations in your response. 
- Do NOT say "Let's count using approximate" or output any breakdown of characters or words.
- Format structure: Start with an attention-grabbing hook, provide a detailed breakdown and rich description of the topic itself (do NOT ask questions to the reader), and end with a strong CTA and 2-3 hashtags.
- Use emojis naturally.

Format Constraint:
Return ONLY a valid JSON object with a single key "caption" containing your generated caption. Do not output any markdown code blocks, reasoning, thoughts, or extra explanations. Example: {"caption": "your generated text here"}`;

  const rawCaptionText = await generateWithGeminiCascade(systemPrompt);
  const caption = ensureCharacterLimit(cleanCaption(extractCleanText(rawCaptionText)), captionBand);

  // 3. Scrape Web Image or Generate Image
  let imageBuffer: ArrayBuffer | null = null;
  let contentType = "image/jpeg";

  try {
    const webImg = await scrapeRealWebImage(trendTitle);
    if (webImg) {
      imageBuffer = webImg.buffer;
      contentType = webImg.contentType;
    }
  } catch (err) {
    console.error("Web visual search failed, falling back to AI generation:", err);
  }

  // Fallback Image
  if (!imageBuffer) {
    try {
      const styles = [
        "cinematic lighting, photorealistic, highly detailed, 8k",
        "modern flat vector illustration style, vibrant corporate palette",
        "minimalist modern technology design theme, studio backdrop",
        "futuristic synthwave render, cyberpunk neon aesthetic",
        "professional clean 3d render, soft shadow octane render"
      ];
      const randomStyle = styles[Math.floor(Math.random() * styles.length)];
      const imageSeed = Math.floor(Math.random() * 10000000);
      const aiImgUrl = `${POLLINATIONS_IMAGE_URL}${encodeURIComponent(trendTitle + ", " + randomStyle)}?width=1024&height=1024&nologo=true&seed=${imageSeed}`;
      const aiImgRes = await fetch(aiImgUrl);
      if (aiImgRes.ok) {
        imageBuffer = await aiImgRes.arrayBuffer();
        contentType = "image/png";
      }
    } catch (err) {
      console.error("Pollinations AI image generation failed:", err);
    }
  }

  // 4. Upload Visual to Supabase Storage
  let publicMediaUrl = "";

  if (imageBuffer) {
    const fileExt = contentType.includes("png") ? "png" : "jpeg";
    const storagePath = `${userId}/auto-${Date.now()}.${fileExt}`;

    const { data: storageData, error: storageError } = await supabase.storage
      .from("media-library")
      .upload(storagePath, imageBuffer, {
        cacheControl: "3600",
        contentType: contentType,
        upsert: false,
      });

    if (!storageError && storageData) {
      const { data: { publicUrl } } = supabase.storage
        .from("media-library")
        .getPublicUrl(storageData.path);

      publicMediaUrl = publicUrl;

      await supabase
        .from("media_library")
        .insert({
          user_id: userId,
          file_name: `auto-${Date.now()}.${fileExt}`,
          file_url: publicUrl,
          file_type: "image",
          file_size: imageBuffer.byteLength,
        });
    }
  }

  // 5. Execute Mode Actions
  if (mode === "automatic") {
    // Automatic Mode: Insert directly into scheduled_posts
    const targetTime = getNextPostTime(post_time);

    const { data: post, error: postErr } = await supabase
      .from("scheduled_posts")
      .insert({
        user_id: userId,
        title: trendTitle,
        description: caption,
        media_urls: publicMediaUrl ? [publicMediaUrl] : [],
        platforms: platforms || [],
        scheduled_time: targetTime.toISOString(),
        status: "pending",
      })
      .select()
      .single();

    if (postErr) throw postErr;

    // Send event to Inngest to sleep until scheduledTime and publish automatically
    await schedulePostWithInngest({ postId: post.id, scheduledTime: targetTime.toISOString() });

    const { data: logEntry } = await supabase
      .from("automation_logs")
      .insert({
        user_id: userId,
        trend_title: trendTitle,
        caption: caption,
        media_url: publicMediaUrl,
        mode: "automatic",
        status: "approved",
        scheduled_post_id: post.id,
      })
      .select()
      .single();

    return {
      success: true,
      mode: "automatic",
      log: logEntry,
      scheduledPost: post,
    };

  } else {
    // Manual Approval Mode: Save draft to database as pending
    const { data: logEntry, error: logErr } = await supabase
      .from("automation_logs")
      .insert({
        user_id: userId,
        trend_title: trendTitle,
        caption: caption,
        media_url: publicMediaUrl,
        mode: "manual",
        status: "pending",
      })
      .select()
      .single();

    if (logErr) throw logErr;

    // Send Resend Email Notification
    const resendApiKey = process.env.RESEND_API_KEY;
    let emailSent = false;
    let emailError = null;

    if (resendApiKey) {
      try {
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
        const token = createHash("sha256")
          .update(logEntry.id + userId + serviceRoleKey)
          .digest("hex");

        const scheduleUrl = `${origin}/api/automation/external-approve?logId=${logEntry.id}&action=schedule&token=${token}`;
        const publishUrl = `${origin}/api/automation/external-approve?logId=${logEntry.id}&action=publish&token=${token}`;
        const rejectUrl = `${origin}/api/automation/external-approve?logId=${logEntry.id}&action=reject&token=${token}`;

        const emailHtml = `
          <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f6f7f1; padding: 24px 0;">
            <tr>
              <td align="center">
                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 580px; background-color: #ffffff; border: 1px solid #e1e3de; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(31,37,40,0.03);">
                  <tr>
                    <td style="padding: 32px;">
                      <!-- Header -->
                      <table border="0" cellpadding="0" cellspacing="0" width="100%">
                        <tr>
                          <td>
                            <p style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: #2f7867; margin: 0 0 6px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;">Postelligence Engine</p>
                            <h2 style="font-size: 22px; font-weight: 900; color: #1f2528; margin: 0 0 20px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; letter-spacing: -0.5px;">New Trend Draft Generated</h2>
                          </td>
                        </tr>
                      </table>

                      <!-- Trend Information & Caption -->
                      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #fcfdfb; border: 1px solid #eef0eb; border-radius: 12px; margin-bottom: 24px;">
                        <tr>
                          <td style="padding: 20px;">
                            <h4 style="font-size: 14px; font-weight: 800; color: #1f2528; margin: 0 0 10px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;">Topic: ${trendTitle}</h4>
                            <p style="font-size: 13px; color: #2b3338; line-height: 1.6; margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; white-space: pre-wrap;">${caption}</p>
                          </td>
                        </tr>
                      </table>

                      <!-- Media Attachment -->
                      ${publicMediaUrl ? `
                      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 24px;">
                        <tr>
                          <td>
                            <img src="${publicMediaUrl}" alt="Trend Visual" width="100%" style="width: 100%; max-width: 100%; height: auto; display: block; border-radius: 12px; border: 1px solid #eaeaea;" />
                          </td>
                        </tr>
                      </table>
                      ` : ""}

                      <!-- Directions Text -->
                      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 24px;">
                        <tr>
                          <td>
                            <p style="font-size: 13px; color: #5a656c; line-height: 1.6; margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;">
                              This post was generated exactly 10 minutes before your target posting time (${post_time.slice(0, 5)}). Please review the options below to approve or discard it:
                            </p>
                          </td>
                        </tr>
                      </table>

                      <!-- CTA Actions -->
                      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 20px;">
                        <tr>
                          <td>
                            <a href="${scheduleUrl}" style="display: inline-block; background-color: #2f7867; color: #ffffff; font-size: 13px; font-weight: 750; padding: 12px 20px; text-decoration: none; border-radius: 10px; margin-right: 8px; margin-bottom: 8px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; text-align: center;">Approve & Schedule</a>
                            <a href="${publishUrl}" style="display: inline-block; background-color: #f3f6f1; color: #2f7867; font-size: 13px; font-weight: 750; padding: 12px 20px; text-decoration: none; border-radius: 10px; border: 1px solid rgba(47, 120, 103, 0.15); margin-right: 8px; margin-bottom: 8px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; text-align: center;">Publish Now</a>
                            <a href="${rejectUrl}" style="display: inline-block; background-color: #ffffff; color: #e11d48; font-size: 13px; font-weight: 750; padding: 12px 20px; text-decoration: none; border-radius: 10px; border: 1px solid #fecdd3; margin-bottom: 8px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; text-align: center;">Reject</a>
                          </td>
                        </tr>
                      </table>

                      <!-- Divider & Footer -->
                      <table border="0" cellpadding="0" cellspacing="0" width="100%">
                        <tr>
                          <td style="border-top: 1px solid #eef0eb; padding-top: 24px; text-align: center;">
                            <p style="font-size: 11px; color: #a1a59b; margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-weight: 600; letter-spacing: 0.5px;">Postelligence &middot; Autonomous Campaigns</p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        `;

        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Postelligence <onboarding@resend.dev>",
            to: [approval_email || userEmail],
            subject: `Approval Required: ${trendTitle.slice(0, 45)}`,
            html: emailHtml,
          }),
        });

        const emailData = await emailRes.json();
        if (emailRes.ok) {
          emailSent = true;
        } else {
          emailError = emailData.message || "Failed to deliver email through Resend API";
        }
      } catch (e: unknown) {
        console.error("Resend email post failed:", e);
        emailError = errorMessage(e, String(e));
      }
    } else {
      emailError = "Resend API key is missing. Add RESEND_API_KEY to your environment variables.";
    }

    return {
      success: true,
      mode: "manual",
      log: logEntry,
      emailSent,
      emailError,
    };
  }
}