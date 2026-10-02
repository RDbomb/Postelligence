import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { parseJsonBody } from "@/lib/validation/http";
import { generateWithGeminiCascade } from "@/lib/gemini";
import { getUserEntitlements, incrementUsage } from "@/lib/subscriptions/entitlements";

export const maxDuration = 60; // Allow up to 60 seconds execution time to prevent timeouts

export type AIGenerateMode =
  | "caption"
  | "hashtags"
  | "hooks"
  | "cta"
  | "content-ideas"
  | "content-calendar"
  | "rewrite"
  | "repurpose"
  | "trends-list"
  | "trends-post";

interface AIGenerateRequest {
  mode: AIGenerateMode;
  topic?: string;
  platform?: string;
  tone?: string;
  existingContent?: string;
  targetPlatforms?: string[];
  count?: number;
  keyword?: string;
  geo?: string;
  category?: string;
}

/**
 * `mode` selects a prompt template, so it is a closed set rather than a loose
 * string — `satisfies` keeps it locked to the `AIGenerateMode` union above.
 *
 * `geo` and `category` are the two values that are NOT passed through
 * `encodeURIComponent` before being interpolated into a Google News/Trends URL
 * (`?geo=${geo}`, `topic/${category.toUpperCase()}`), so both are enums of
 * exactly the options the Studio's dropdowns offer. Everything else reaches the
 * URL via `encodeURIComponent` or only ever lands inside the prompt text, so
 * those just need generous upper bounds — prompts here are long-form (a
 * `rewrite`/`repurpose` `existingContent` is a whole post), but unbounded input
 * would be forwarded verbatim to a third-party AI API.
 */
const aiGenerateMode = z.enum([
  "caption",
  "hashtags",
  "hooks",
  "cta",
  "content-ideas",
  "content-calendar",
  "rewrite",
  "repurpose",
  "trends-list",
  "trends-post",
]) satisfies z.ZodType<AIGenerateMode>;

const AIGenerateBody = z.object({
  mode: aiGenerateMode,
  topic: z.string().trim().max(2_000).optional(),
  platform: z.string().trim().max(50).optional(),
  tone: z.string().trim().max(100).optional(),
  existingContent: z.string().trim().max(20_000).optional(),
  targetPlatforms: z.array(z.string().trim().min(1).max(50)).max(15).optional(),
  count: z.number().int().min(1).max(50).optional(),
  keyword: z.string().trim().max(200).optional(),
  geo: z.enum(["GLOBAL", "US", "IN", "GB", "CA", "AU", "DE", "FR", "JP"]).optional(),
  category: z
    .enum(["WORLD", "TECHNOLOGY", "BUSINESS", "SPORTS", "ENTERTAINMENT", "HEALTH", "SCIENCE"])
    .optional(),
});

function buildPrompt(req: AIGenerateRequest): string {
  const { mode, topic, platform, tone, existingContent, targetPlatforms, count } = req;
  const toneStr = tone ? `Tone: ${tone}.` : "";
  const platformStr = platform ? `Platform: ${platform}.` : "";
  const countStr = count ? count : 5;

  switch (mode) {
    case "caption":
      return `You are a world-class social media copywriter. Generate ${countStr} engaging social media captions for the following topic.
Topic: "${topic}"
${platformStr} ${toneStr}
Requirements:
- Each caption should be unique with a different angle
- Include relevant emojis naturally
- Make them authentic, not salesy
- CRITICAL: Each caption MUST be strictly under 500 characters total to comply with platform limits (including emojis and hashtags).
- Each caption on a new line, numbered 1. 2. 3. etc.
Return ONLY the captions, no extra explanation.`;

    case "hashtags":
      return `You are a social media hashtag strategist. Generate ${countStr} high-performing hashtags for:
Topic: "${topic}"
${platformStr} ${toneStr}
Requirements:
- Mix of popular (1M+ posts), medium (100K-1M), and niche (<100K) hashtags
- Relevant and specific to the topic
- No banned or spammy hashtags
- Format each hashtag with # prefix
- Group them: Popular | Medium | Niche (3 groups)
Return ONLY the hashtag groups, no extra explanation.`;

    case "hooks":
      return `You are a viral content strategist. Generate ${countStr} scroll-stopping social media hooks for:
Topic: "${topic}"
${platformStr} ${toneStr}
Hook types to include: question hook, bold statement, curiosity gap, data/statistic, story opener, controversy.
Requirements:
- Each hook must make someone stop scrolling
- Under 20 words each
- Numbered list
Return ONLY the hooks, no extra explanation.`;

case "cta":
  return `You are an elite direct-response marketing copywriter.

Generate ${countStr} high-converting social media CTAs for:

Topic: "${topic}"

${platformStr}
${toneStr}

Requirements:
- Maximum 8-12 words each
- Action-oriented
- Natural and human sounding
- Avoid generic phrases
- Mix different CTA types:
  * Follow
  * Save
  * Comment
  * Share
  * Download
  * Sign Up
  * Free Trial
  * Visit Website
- Create curiosity, urgency, or value
- Suitable for social media posts
- Each CTA should feel different

Examples:
✓ Save this post for your next content sprint.
✓ Ready to grow faster? Start your free trial.
✓ Follow for weekly social media strategies.
✓ Comment "AI" and we'll send the guide.

Return ONLY a numbered list.`;

    case "content-ideas":
      return `You are a content strategist. Generate ${countStr} creative content ideas for:
Topic/Niche: "${topic}"
${platformStr} ${toneStr}
For each idea provide:
- Title (bold)
- Format (e.g., carousel, reel, static post, story)
- Brief description (1-2 sentences)
- Why it will perform well

Return a numbered list. Be specific and actionable.`;

    case "content-calendar":
      return `You are a social media manager. Create a 7-day content calendar for:
Niche/Brand: "${topic}"
${targetPlatforms ? `Platforms: ${targetPlatforms.join(", ")}.` : ""} ${toneStr}

For each day provide:
**Day X - [Day Name]**
- Post Type: (e.g., educational, promotional, engagement, behind-the-scenes)
- Platform: 
- Content Idea: (specific topic)
- Caption Hook: (opening line)
- Best Posting Time: (suggested)

Make it realistic, varied, and aligned with the niche. Return the full 7-day calendar.`;

    case "rewrite":
      return `You are a social media copywriter. Rewrite the following content to make it more engaging.
Original content: "${existingContent}"
${platformStr} ${toneStr}
Requirements:
- Preserve the core message
- Make it more compelling and authentic  
- Improve clarity and flow
- Add emojis if appropriate
- ${count ? `Provide ${count} different rewrites` : "Provide 3 different rewrites"}

Return numbered rewrites, no extra explanation.`;

    case "repurpose":
      return `You are a content repurposing expert. Take this content and repurpose it for multiple platforms.
Original content: "${existingContent}"
${targetPlatforms ? `Target platforms: ${targetPlatforms.join(", ")}.` : "Target all major platforms."} ${toneStr}

For each platform provide:
**[Platform Name]**
- Format recommendation
- Adapted content (platform-optimized)
- Platform-specific tips

Make each version feel native to that platform.`;

    case "trends-list":
      return `You are a social media trend forecasting analyst. Generate a list of 5 current, highly viral social media trends across tech, business, marketing, lifestyle, and design.
For each trend, provide:
1. Title: A short, catchy title of the trend (under 5 words).
2. Explanation: A brief 1-sentence description of what it is and why it's trending.
3. Category: e.g. Tech, Marketing, Business, Design, or Lifestyle.
4. Image Prompt: A detailed, creative prompt for an AI image generator to create a matching high-quality visual representation of this trend.
5. Caption Prompt: A specific prompt instruction to generate a good caption for this trend.

Return ONLY a valid JSON array of objects with the keys: "title", "explanation", "category", "imagePrompt", "captionPrompt". Do NOT wrap it in any Markdown formatting (no backticks), return ONLY the raw JSON string.`;

    case "trends-post":
      return `You are a viral social media strategist and content copywriter. Generate a comprehensive, detailed, and high-performing social media post caption about the following trend.

Trend: "${topic}"
Description: "${existingContent}"

Requirements:
- Target Length: Write a detailed, comprehensive, and high-quality caption of about 4-5 sentences.
- Uniqueness: Ensure this text is completely unique in style, vocabulary, and phrasing, separate from other generations on the same topic.
- Accuracy: Focus strictly on the factual details provided in the Description. Incorporate the specific pricing, locations, release info, or statistics mentioned in the description to make it highly accurate and informative.
- Structure:
  1. Start with an attention-grabbing hook in the first sentence.
  2. Provide a detailed breakdown, context, and rich description of the topic itself, elaborating on the factual details.
  3. Do NOT ask questions to the reader; focus entirely on delivering clear, informative description.
  4. End with a strong call-to-action and hashtags.
- Formatting: Use emojis naturally to break up text, and use clean paragraph spacing to make it readable.
- Hashtags: Add 3-4 highly relevant, specific hashtags at the very bottom (avoid generic or incorrect tags like #IndieGames for AAA games).

Format Constraint:
Return ONLY a valid JSON object with a single key "caption" containing your generated caption. Do not output any markdown code blocks, reasoning, thoughts, or extra explanations. Example: {"caption": "your generated text here"}`;

    default:
      return `Generate social media content for: "${topic}". ${platformStr} ${toneStr}`;
  }
}

function ensureCharacterLimit(text: string): string {
  let cleaned = text.trim();
  
  if (cleaned.length >= 450 && cleaned.length <= 499) {
    return cleaned;
  }

  if (cleaned.length < 450) {
    const extraCTAs = [
      " Let us know your thoughts in the comments below! We would love to hear your perspective on this exciting development.",
      " What is your take on this change? Drop a comment below and share your views with the community!",
      " How do you think this will impact the industry moving forward? Let's discuss in the comment section below!",
      " Let's get the conversation started. What are your initial impressions about this? Share in the comments!"
    ];
    let paddingIndex = 0;
    while (cleaned.length < 450 && paddingIndex < extraCTAs.length) {
      cleaned += extraCTAs[paddingIndex];
      paddingIndex++;
    }

    const hashtags = ["#trends", "#news", "#innovation", "#future", "#growth", "#viral"];
    let hashIndex = 0;
    while (cleaned.length < 450 && hashIndex < hashtags.length) {
      cleaned += ` ${hashtags[hashIndex]}`;
      hashIndex++;
    }

    while (cleaned.length < 450) {
      cleaned += ".";
    }
  }

  if (cleaned.length > 499) {
    let cutIndex = 495;
    for (let i = 495; i >= 300; i--) {
      const char = cleaned[i];
      if (char === "." || char === "!" || char === "?") {
        cutIndex = i + 1;
        break;
      }
    }
    cleaned = cleaned.slice(0, cutIndex).trim();

    if (cleaned.length < 450) {
      const hashtags = ["#trends", "#news", "#innovation", "#future", "#growth", "#viral"];
      let hashIndex = 0;
      while (cleaned.length < 450 && hashIndex < hashtags.length) {
        if (cleaned.length + hashtags[hashIndex].length + 2 <= 499) {
          cleaned += ` ${hashtags[hashIndex]}`;
        }
        hashIndex++;
      }
    }
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

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Enforce AI Studio access and monthly words quota
    const { entitlements, usage } = await getUserEntitlements(user.id);
    if (!entitlements.canAccessAiStudio) {
      return NextResponse.json(
        {
          error: "AI Studio requires a Pro or Plus subscription. Please upgrade your account to generate AI content.",
          code: "FEATURE_LOCKED",
          feature: "canAccessAiStudio",
        },
        { status: 403 }
      );
    }

    if (usage.ai_words_generated >= entitlements.maxAiWordsPerMonth) {
      return NextResponse.json(
        {
          error: `Monthly quota of ${entitlements.maxAiWordsPerMonth.toLocaleString()} AI words reached for ${entitlements.name} plan. Please upgrade to generate more.`,
          code: "QUOTA_EXCEEDED",
          metric: "ai_words",
          limit: entitlements.maxAiWordsPerMonth,
          current: usage.ai_words_generated,
        },
        { status: 403 }
      );
    }

    const parsed = await parseJsonBody(req, AIGenerateBody);
    if (!parsed.success) return parsed.response;
    const body: AIGenerateRequest = parsed.data;
    const { mode } = body;

    // `mode` is already validated as a required enum by AIGenerateBody above,
    // so main's manual `if (!mode)` guard is redundant and has been dropped.
    let prompt = "";

    if (mode === "trends-list") {
      try {
        const keyword = body.keyword;
        const geo = body.geo;
        const isGlobal = !geo || geo === "GLOBAL";
        const category = body.category || "WORLD";
        const geoNames: Record<string, string> = {
          US: "United States",
          IN: "India",
          GB: "United Kingdom",
          CA: "Canada",
          AU: "Australia",
          DE: "Germany",
          FR: "France",
          JP: "Japan"
        };
        const countrySuffix = (!isGlobal && geoNames[geo]) ? ` ${geoNames[geo]}` : "";
        const finalQuery = keyword ? `${keyword}${countrySuffix}` : "";

        const items: { title: string; approxTraffic: string; newsTitle: string; explanation: string }[] = [];
        try {
          let url = "";
          if (keyword) {
            url = isGlobal
              ? `https://news.google.com/rss/search?q=${encodeURIComponent(finalQuery)}&hl=en-US`
              : `https://news.google.com/rss/search?q=${encodeURIComponent(finalQuery)}&hl=en-US&gl=${geo}&ceid=${geo}:en`;
          } else if (category === "WORLD") {
            url = isGlobal
              ? "https://news.google.com/rss?hl=en-US"
              : `https://trends.google.com/trending/rss?geo=${geo}`;
          } else {
            url = isGlobal
              ? `https://news.google.com/rss/headlines/section/topic/${category.toUpperCase()}?hl=en-US`
              : `https://news.google.com/rss/headlines/section/topic/${category.toUpperCase()}?hl=en-US&gl=${geo}&ceid=${geo}:en`;
          }

          const trendsRes = await fetch(url);
          if (trendsRes.ok) {
            const xml = await trendsRes.text();
            const itemRegex = /<item>([\s\S]*?)<\/item>/g;
            let match;
            while ((match = itemRegex.exec(xml)) !== null) {
              const content = match[1];
              const titleRaw = content.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "";
              const approxTrafficRaw = content.match(/<ht:approx_traffic>([\s\S]*?)<\/ht:approx_traffic>/)?.[1] || "";
              const newsTitleRaw = content.match(/<ht:news_item_title>([\s\S]*?)<\/ht:news_item_title>/)?.[1] || "";
              const descRaw = content.match(/<description>([\s\S]*?)<\/description>/)?.[1] || "";

              const newsTitles: string[] = [];
              const newsTitleRegex = /<ht:news_item_title>([\s\S]*?)<\/ht:news_item_title>/g;
              let ntMatch;
              while ((ntMatch = newsTitleRegex.exec(content)) !== null) {
                newsTitles.push(ntMatch[1]);
              }

              const unescape = (str: string) => str
                .replace(/&amp;/g, "&")
                .replace(/&lt;/g, "<")
                .replace(/&gt;/g, ">")
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'")
                .replace(/&apos;/g, "'");

              let cleanTitle = unescape(titleRaw);
              if (keyword || category !== "WORLD" || isGlobal) {
                cleanTitle = cleanTitle.replace(/\s+-\s+[^-]+$/, "");
              }

              // Extract clean related headlines as a snippet summary, filtering out title duplicates
              const getSnippet = (descRawHtml: string, trendsTitles: string[], mainTitle: string, defaultSnippet: string): string => {
                try {
                  const desc = unescape(descRawHtml);
                  const linkTexts: string[] = [];
                  const linkRegex = /<a[^>]*>([\s\S]*?)<\/a>/g;
                  let m;

                  const normalizedMain = mainTitle.toLowerCase().replace(/[^a-z0-9]/g, "");

                  while ((m = linkRegex.exec(desc)) !== null) {
                    const text = m[1].replace(/<[^>]*>/g, "").trim();
                    if (text && !text.toLowerCase().includes("see more") && !text.toLowerCase().includes("google news")) {
                      const cleaned = unescape(text).replace(/\s+-\s+[^-]+$/, "").trim();
                      const normalizedText = cleaned.toLowerCase().replace(/[^a-z0-9]/g, "");
                      if (normalizedText !== normalizedMain && !linkTexts.includes(cleaned)) {
                        linkTexts.push(cleaned);
                      }
                    }
                  }

                  if (linkTexts.length > 0) {
                    return linkTexts.slice(0, 2).join(". ");
                  }

                  const filteredTrends = trendsTitles
                    .map(t => unescape(t).trim())
                    .filter(t => t.toLowerCase().replace(/[^a-z0-9]/g, "") !== normalizedMain);

                  if (filteredTrends.length > 0) {
                    const uniqueTrends = filteredTrends.filter((v, i, a) => a.indexOf(v) === i);
                    return uniqueTrends.slice(0, 2).join(". ");
                  }
                } catch {
                  console.error("Failed to parse description snippet");
                }
                return defaultSnippet || `Latest updates and reports regarding: ${mainTitle}.`;
              };

              const parsedDescription = getSnippet(descRaw, newsTitles, cleanTitle, "No additional description available.");

              items.push({
                title: cleanTitle,
                approxTraffic: unescape(approxTrafficRaw),
                newsTitle: (keyword || category !== "WORLD" || isGlobal) ? cleanTitle : unescape(newsTitleRaw),
                explanation: parsedDescription
              });
            }
          }
        } catch (fetchErr) {
          console.error("Failed to fetch Google Trends RSS:", fetchErr);
        }

        const getCategory = (title: string, headline: string): string => {
          const text = (title + " " + headline).toLowerCase();
          if (text.includes("trump") || text.includes("biden") || text.includes("election") || text.includes("gov") || text.includes("senate") || text.includes("policy") || text.includes("court") || text.includes("usaid")) {
            return "Politics";
          }
          if (text.includes("stocks") || text.includes("market") || text.includes("finance") || text.includes("economy") || text.includes("crypto") || text.includes("doge") || text.includes("bitcoin") || text.includes("business") || text.includes("company")) {
            return "Business";
          }
          if (text.includes("sports") || text.includes("cup") || text.includes("game") || text.includes("player") || text.includes("olympics") || text.includes("gymnastics") || text.includes("nhl") || text.includes("nba") || text.includes("football") || text.includes("soccer") || text.includes("baseball")) {
            return "Sports";
          }
          if (text.includes("movie") || text.includes("star wars") || text.includes("mandalorian") || text.includes("music") || text.includes("actor") || text.includes("goldberg") || text.includes("celebrity") || text.includes("show") || text.includes("entertainment")) {
            return "Entertainment";
          }
          if (text.includes("tech") || text.includes("ai") || text.includes("software") || text.includes("app") || text.includes("google") || text.includes("apple") || text.includes("microsoft") || text.includes("phone")) {
            return "Tech";
          }
          return "Lifestyle";
        };

        let parsed = [];
        if (items.length > 0) {
          const topTrends = items.slice(0, 5);

          // Batch generate real-world descriptions for each trend headline using exactly 1 API call
          let llmDescriptions: string[] = [];
          try {
            const headlines = topTrends.map(t => t.title);
            const prompt = `For each of the following news headlines, write a concise 1-sentence explanation that describes what the event is about:
${headlines.map((h, i) => `${i + 1}. ${h}`).join("\n")}

Return ONLY a valid JSON array of ${headlines.length} strings (the explanations), no extra text or markdown formatting. E.g.:
["explanation 1", "explanation 2", "explanation 3", "explanation 4", "explanation 5"]`;

            const cacheBuster = `\n\n[Request ID: ${Date.now()}-${Math.random().toString(36).substring(2)}]`;
            const finalPrompt = prompt + cacheBuster;

            const text = await generateWithGeminiCascade(
              finalPrompt,
              "You are a concise helper that outputs raw JSON arrays of strings. No markdown, no backticks, no explanations."
            );

            const cleanText = text.trim().replace(/^```json|```$/g, "").trim();
            const array = JSON.parse(cleanText);
            if (Array.isArray(array) && array.length === topTrends.length) {
              llmDescriptions = array.map(item => String(item).trim());
            }
          } catch (llmErr) {
            console.error("Batch description generation failed, falling back to RSS headlines:", llmErr);
          }

          parsed = topTrends.map((t, idx) => {
            const itemCategory = category !== "WORLD" ? category : getCategory(t.title, t.newsTitle);
            const cleanTitle = t.title
              .split(" ")
              .map(w => w.charAt(0).toUpperCase() + w.slice(1))
              .join(" ");

            const displayTitle = (keyword || category !== "WORLD" || isGlobal)
              ? t.title
              : `${cleanTitle}: ${t.newsTitle || "Trending Search"}`;

            const finalExplanation = llmDescriptions[idx] || t.explanation;

            return {
              title: displayTitle,
              explanation: finalExplanation,
              category: itemCategory.charAt(0).toUpperCase() + itemCategory.slice(1).toLowerCase(),
              imagePrompt: `A photorealistic cinematic visual representing ${t.title}, high quality, editorial style`,
              captionPrompt: `Write an engaging, trending social media caption about ${t.title}`
            };
          });
        } else {
          // Robust static fallbacks if RSS is entirely down/rate-limited
          parsed = [
            {
              title: "AI Agents Rise: Autonomy in the Workplace",
              explanation: "Businesses are adopting AI agents to automate daily workflows, transforming productivity metrics across industries.",
              category: "Tech",
              imagePrompt: "A sleek modern office workspace with translucent holographic displays showing AI node connections and charts, warm sunset lighting, highly detailed",
              captionPrompt: "Create an insightful caption about the impact of AI agent automation on corporate productivity."
            },
            {
              title: "Sustainable Travel: Eco-Tourism Trends",
              explanation: "Travelers are actively choosing carbon-neutral destinations and green lodges, driving hospitality industry adaptations.",
              category: "Lifestyle",
              imagePrompt: "A luxury eco-friendly resort built into a luxury green mountainside, glowing lights at dusk, professional architecture photography",
              captionPrompt: "Write an inspiring post about the shift towards mindful and sustainable travel choices."
            },
            {
              title: "Remote Teamwork: The Hybrid Future",
              explanation: "Organizations are shifting permanent investments into hybrid collaboration tools as team distribution increases.",
              category: "Business",
              imagePrompt: "A dynamic flat design illustration of diverse remote team members collaborating via video chat, colorful overlays, modern aesthetic",
              captionPrompt: "Generate a practical tip post on improving communication in hybrid workforces."
            }
          ];
        }

        // Increment approximate words for batch trends generation
        await incrementUsage(user.id, "ai_words", 150);

        return NextResponse.json({ result: parsed, mode });
      } catch (err) {
        console.error("Trends list builder error:", err);
        return NextResponse.json({ error: "Failed to construct trends data" }, { status: 500 });
      }
    }

    if (!prompt) {
      prompt = buildPrompt(body);
    }

    const finalPrompt = `${prompt}\n\n[Request ID: ${Date.now()}-${Math.random().toString(36).substring(2)}]`;

    const text = await generateWithGeminiCascade(finalPrompt);

    if (!text) {
      return NextResponse.json({ error: "No content generated" }, { status: 500 });
    }

    let resultText = extractCleanText(text);
    if (mode === "trends-post") {
      resultText = ensureCharacterLimit(resultText);
    }

    // Increment generated words in user usage
    const words = resultText.trim().split(/\s+/).filter(Boolean).length;
    await incrementUsage(user.id, "ai_words", Math.max(1, words));

    return NextResponse.json({ result: resultText, mode });
  } catch (err) {
    console.error("AI generate error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}