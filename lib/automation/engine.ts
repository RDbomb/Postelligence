import { createClient as createBaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import { PLATFORM_COMPOSE_RULES, type ComposePlatformId, type PlatformComposeRule } from "@/lib/compose/platform-rules";
import { generateWithGeminiCascade } from "@/lib/gemini";
import { schedulePostWithInngest, sendAutomationLoopEvent, cancelAutomationLoop } from "@/lib/inngest/client";
import { calculateNextAutomationRun } from "@/lib/automation/schedule-calculator";
import type { ScheduledPost } from "@/types";

const POLLINATIONS_IMAGE_URL = "https://image.pollinations.ai/prompt/";

export interface AutomationTimeConfig {
  platforms?: string[] | null;
  categories?: string[] | null;
  keywords?: string[] | null;
}

export interface AutomationSettings {
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

export interface AutomationLogRow {
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

export type AutomationRunResult =
  | { success: true; mode: "automatic"; log: AutomationLogRow; scheduledPost: ScheduledPost }
  | { success: true; mode: "manual"; log: AutomationLogRow; emailSent: boolean; emailError: string | null };

function cleanCaption(text: string): string {
  if (!text) return "";
  let cleaned = text.replace(/(?:\r?\n)*---\s*\r?\n\*\*Support Pollinations\.AI\*\*[\s\S]*/gi, "");
  cleaned = cleaned.replace(/(?:\r?\n)*---\s*\r?\nSupport Pollinations\.AI[\s\S]*/gi, "");
  cleaned = cleaned.replace(/(?:\r?\n)*Powered by Pollinations\.AI[\s\S]*/gi, "");
  cleaned = cleaned.replace(/(?:\r?\n)*\*\*Support Pollinations\.AI\*\*[\s\S]*/gi, "");
  cleaned = cleaned.replace(/(?:\r?\n)*\uD83D\uDC9C,\s*\*\*Ad\*\*\s*\uD83D\uDC9C,[\s\S]*/gi, "");
  cleaned = cleaned.replace(/^["'`\s]+|["'`\s]+$/g, "").trim();
  return cleaned;
}

function getTargetCaptionBand(platforms: string[]): { min: number; max: number; hardCap: number; tightest: { name: string; limit: number } } {
  const limits = platforms
    .map((p) => PLATFORM_COMPOSE_RULES[p as ComposePlatformId])
    .filter((rule): rule is PlatformComposeRule => Boolean(rule));

  const tightestRule = limits.length
    ? limits.reduce((a, b) => (b.captionLimit < a.captionLimit ? b : a))
    : PLATFORM_COMPOSE_RULES.instagram;

  const hardCap = tightestRule.captionLimit;
  const max = Math.max(120, Math.min(hardCap - 10, 600));
  const min = Math.max(80, Math.floor(max * 0.7));
  return { min, max, hardCap, tightest: { name: tightestRule.name, limit: hardCap } };
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
  }

  cleaned = cleaned.replace(/^["'`\s]+|["'`\s]+$/g, "").trim();
  return cleaned;
}

async function scrapeRealWebImage(query: string): Promise<{ buffer: ArrayBuffer; contentType: string } | null> {
  const cleanQuery = query.replace(/[^\w\s]/gi, " ").trim();
  const userAgent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

  try {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(cleanQuery + " wallpaper news")}`;
    const ddgRes = await fetch(searchUrl, {
      headers: { "User-Agent": userAgent, Accept: "text/html" },
      signal: AbortSignal.timeout(6000),
    });

    if (ddgRes.ok) {
      const html = await ddgRes.text();
      const rawUrls: string[] = [];
      const duckDuckGoRegex = /\/\/external-content\.duckduckgo\.com\/iu\/\?u=([^&"]+)/gi;
      let match;
      while ((match = duckDuckGoRegex.exec(html)) !== null) {
        try {
          const actualUrl = decodeURIComponent(match[1]);
          if (actualUrl.startsWith("http") && !actualUrl.includes("logo") && !actualUrl.includes("icon")) {
            rawUrls.push(actualUrl);
          }
        } catch {}
      }

      for (const imgUrl of rawUrls.slice(0, 5)) {
        try {
          const imgFetch = await fetch(imgUrl, {
            headers: { "User-Agent": userAgent },
            signal: AbortSignal.timeout(4000),
          });
          const ct = imgFetch.headers.get("content-type") || "";
          if (imgFetch.ok && ct.startsWith("image/") && !ct.includes("svg") && !ct.includes("gif")) {
            const buf = await imgFetch.arrayBuffer();
            if (buf.byteLength > 20_000) {
              return { buffer: buf, contentType: ct };
            }
          }
        } catch {}
      }
    }
  } catch {}

  return null;
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

export async function runAutomationForUser(
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

      const unescape = (str: string) =>
        str
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

      if (!trendTitle) {
        trendTitle = fallbackTitle;
        trendExplanation = fallbackDesc;
      }
    }
  } catch (e) {
    console.error("RSS fetch failed, using fallback:", e);
  }

  if (!trendTitle) {
    trendTitle = "Breaking Industry Innovations and Global Trends";
    trendExplanation = "Recent developments driving forward community progress and industry insights.";
  }

  // 2. Generate Caption using Gemini Cascade
  const targetPlatforms = (platforms || []).join(", ");
  const targetBand = getTargetCaptionBand(platforms || []);

  const systemInstruction = `You are a social media copywriter. Write a post about the given topic for: ${targetPlatforms}.
RULES:
1. Output ONLY the raw caption text. No JSON, no markdown code blocks, no preamble.
2. Length MUST be between ${targetBand.min} and ${targetBand.max} characters. The hardest character limit among the target platforms is ${targetBand.hardCap} (${targetBand.tightest.name}). Do not exceed this limit under any circumstances.
3. Engaging, professional, punchy tone.
4. Include 2-3 relevant hashtags at the end.`;

  const userPrompt = `Topic: "${trendTitle}"
Context: "${trendExplanation}"
Platforms: ${targetPlatforms}

Write the post:`;

  let caption = "";
  try {
    caption = await generateWithGeminiCascade(userPrompt, systemInstruction);
    caption = cleanCaption(extractCleanText(caption));
  } catch (aiErr) {
    console.error("Gemini failed, using fallback caption:", aiErr);
    caption = `Exciting developments in "${trendTitle}". Stay tuned as this story unfolds!\n\n#Trending #Innovation`;
  }

  // 3. Obtain Visual Media
  let publicMediaUrl: string | null = null;
  let imageBuffer: ArrayBuffer | null = null;
  let fileExt = "jpg";
  let mimeType = "image/jpeg";

  try {
    const scraped = await scrapeRealWebImage(trendTitle);
    if (scraped && scraped.buffer.byteLength > 20_000) {
      imageBuffer = scraped.buffer;
      mimeType = scraped.contentType;
      fileExt = mimeType.includes("png") ? "png" : "jpg";
    }
  } catch {}

  if (!imageBuffer) {
    try {
      const randomSeed = Math.floor(Math.random() * 1_000_000);
      const aiImgUrl = `${POLLINATIONS_IMAGE_URL}${encodeURIComponent(trendTitle)}?width=1024&height=1024&nologo=true&seed=${randomSeed}`;
      const imgRes = await fetch(aiImgUrl, { signal: AbortSignal.timeout(10000) });
      if (imgRes.ok) {
        imageBuffer = await imgRes.arrayBuffer();
        mimeType = "image/jpeg";
        fileExt = "jpg";
      }
    } catch {}
  }

  // 4. Store Image in Supabase Storage
  if (imageBuffer) {
    const filePath = `auto-${userId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const { data: storageData, error: uploadErr } = await supabase.storage
      .from("media-library")
      .upload(filePath, imageBuffer, { contentType: mimeType, upsert: true });

    if (!uploadErr && storageData?.path) {
      const { data: { publicUrl } } = supabase.storage
        .from("media-library")
        .getPublicUrl(storageData.path);

      publicMediaUrl = publicUrl;

      await supabase.from("media_library").insert({
        user_id: userId,
        file_name: `auto-${Date.now()}.${fileExt}`,
        file_url: publicUrl,
        file_type: "image",
        file_size: imageBuffer.byteLength,
      });
    }
  }

  // 5. Automatic vs Manual Mode Dispatch
  if (mode === "automatic") {
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
    // Manual Approval Mode
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

    const resendApiKey = process.env.RESEND_API_KEY;
    let emailSent = false;
    let emailError: string | null = null;

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
          <div style="font-family: sans-serif; padding: 20px; background-color: #f6f7f1;">
            <h2>New Trend Draft Generated</h2>
            <p><strong>Topic:</strong> ${trendTitle}</p>
            <p style="white-space: pre-wrap; background: #fff; padding: 16px; border-radius: 8px;">${caption}</p>
            ${publicMediaUrl ? `<p><img src="${publicMediaUrl}" width="400" style="border-radius: 8px;" /></p>` : ""}
            <p>
              <a href="${scheduleUrl}" style="background: #2f7867; color: #fff; padding: 10px 16px; text-decoration: none; border-radius: 6px; margin-right: 8px;">Approve & Schedule</a>
              <a href="${publishUrl}" style="background: #1f2528; color: #fff; padding: 10px 16px; text-decoration: none; border-radius: 6px; margin-right: 8px;">Publish Now</a>
              <a href="${rejectUrl}" style="background: #d9534f; color: #fff; padding: 10px 16px; text-decoration: none; border-radius: 6px;">Reject</a>
            </p>
          </div>
        `;

        const recipientEmail = approval_email || userEmail;
        if (recipientEmail) {
          const resendRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${resendApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: "PostSync Automation <notifications@postsync.app>",
              to: [recipientEmail],
              subject: `Review Trend Draft: "${trendTitle.slice(0, 40)}..."`,
              html: emailHtml,
            }),
          });
          emailSent = resendRes.ok;
          if (!resendRes.ok) emailError = await resendRes.text();
        }
      } catch (e: unknown) {
        emailError = e instanceof Error ? e.message : String(e);
      }
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

/**
 * Executes a single user's automation run using service-role credentials.
 */
export async function executeAutomationForUser(
  userId: string,
  timeSlot?: string
): Promise<AutomationRunResult | { skipped: true; reason: string }> {
  const baseClient = createBaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data: settings, error: settingsErr } = await baseClient
    .from("automation_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (settingsErr || !settings) {
    return { skipped: true, reason: "Settings not found" };
  }

  if (settings.is_enabled === false) {
    return { skipped: true, reason: "Automation disabled by user" };
  }

  const { data: { user } } = await baseClient.auth.admin.getUserById(userId);
  const email = user?.email || "";
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000");

  return await runAutomationForUser(baseClient, userId, settings, email, origin, timeSlot);
}

/**
 * Calculates the next slot for a user and dispatches the self-chaining event to Inngest.
 */
export async function scheduleNextAutomationSlot(userId: string) {
  const baseClient = createBaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data: settings } = await baseClient
    .from("automation_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (!settings || settings.is_enabled === false) {
    console.log(`[Automation] User ${userId} has automation disabled. Cancelling any active Inngest loop.`);
    await cancelAutomationLoop(userId);
    return null;
  }

  const next = calculateNextAutomationRun(settings);
  if (!next) {
    console.log(`[Automation] No upcoming active slot found for user ${userId}.`);
    return null;
  }

  console.log(
    `[Automation] Scheduling Inngest loop for user ${userId} at ${next.runAt.toISOString()} (posting at ${next.postAt.toISOString()}, slot: ${next.timeSlot})`
  );

  await sendAutomationLoopEvent({
    userId,
    scheduledTime: next.runAt.toISOString(),
    timeSlot: next.timeSlot,
  });

  return next;
}