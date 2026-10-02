import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { parseJsonBody } from "@/lib/validation/http";
import { createHash } from "crypto";
import { getUserEntitlements, incrementUsage } from "@/lib/subscriptions/entitlements";

export const maxDuration = 60; // Allow up to 60 seconds execution time to prevent timeouts on cold GPU starts

// Uses Hugging Face's current Inference Providers router (zero cost on free tier)
// The old "api-inference.huggingface.co/models/..." endpoint is legacy and
// no longer reliably serves GPU diffusion models like SDXL - it now throws
// connection-level errors for most users instead of a clean HTTP error.
// FLUX.1-schnell is fast, free-tier friendly, and actively served via hf-inference.
// Uses Pollinations AI for unlimited free generation with the highly detailed Flux model
const POLLINATIONS_IMAGE_URL = "https://image.pollinations.ai/prompt/";

/**
 * `prompt` is the only required field — the Studio's manual image generator
 * omits `usePinterest`/`pinterestIndex` entirely, so those stay optional.
 *
 * The bound on `prompt` is generous (image prompts are descriptive) but real:
 * the value is `encodeURIComponent`-ed into a Pollinations URL and also sent to
 * DuckDuckGo, and an unbounded prompt would produce an unbounded outbound URL.
 * `style` and `aspectRatio` select a fixed modifier string and a fixed
 * width/height pair respectively, so both are enums of exactly the options the
 * UI offers, with the same defaults the handler used to apply inline.
 */
const ImageGenerateBody = z.object({
  prompt: z.string().trim().min(3, "Prompt is required").max(2_000, "Prompt is too long."),
  style: z
    .enum(["photorealistic", "illustration", "minimalist", "3d", "watercolor", "cinematic"])
    .default("photorealistic"),
  aspectRatio: z.enum(["square", "portrait", "landscape"]).default("square"),
  usePinterest: z.boolean().optional(),
  pinterestIndex: z.number().int().min(0).max(10_000).default(0),
});

const STYLE_MODIFIERS: Record<string, string> = {
  photorealistic: "photorealistic, 8k, professional photography, sharp focus, detailed",
  illustration: "digital illustration, vector art style, vibrant colors, flat design",
  minimalist: "minimalist design, clean lines, simple shapes, modern aesthetic, white background",
  "3d": "3d render, octane render, volumetric lighting, cinematic, high quality",
  watercolor: "watercolor painting, soft edges, artistic, beautiful color wash",
  cinematic: "cinematic photography, movie poster style, dramatic lighting, epic composition",
};

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

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Enforce AI image generation entitlement and monthly quota
    const { entitlements, usage } = await getUserEntitlements(user.id);
    if (entitlements.maxAiImagesPerMonth <= 0) {
      return NextResponse.json(
        {
          error: "AI Image Generation is only available on Pro and Plus plans. Please upgrade your subscription to generate images.",
          code: "FEATURE_LOCKED",
          feature: "ai_images",
        },
        { status: 403 }
      );
    }
    if (usage.ai_images_generated >= entitlements.maxAiImagesPerMonth) {
      return NextResponse.json(
        {
          error: `Monthly quota of ${entitlements.maxAiImagesPerMonth} AI images reached for ${entitlements.name} plan. Please upgrade to generate more images.`,
          code: "QUOTA_EXCEEDED",
          metric: "ai_images",
          limit: entitlements.maxAiImagesPerMonth,
          current: usage.ai_images_generated,
        },
        { status: 403 }
      );
    }

    const parsed = await parseJsonBody(req, ImageGenerateBody, { message: "Prompt is required" });
    if (!parsed.success) return parsed.response;
    const { prompt, style, aspectRatio, usePinterest } = parsed.data;

    const apiKey = process.env.POLLINATIONS_API_KEY;
    const styleModifier = STYLE_MODIFIERS[style] || STYLE_MODIFIERS.photorealistic;
    const fullPrompt = `${prompt}, ${styleModifier}, social media content, high quality`;

    // Dimensions based on aspect ratio
    const dimensions =
      aspectRatio === "portrait"
        ? { width: 768, height: 1024 }
        : aspectRatio === "landscape"
        ? { width: 1024, height: 576 }
        : { width: 1024, height: 1024 }; // square

    let imageBuffer: ArrayBuffer | null = null;
    let contentType = "image/png";
    let isWebSearch = false;

    if (usePinterest) {
      const webImg = await scrapeRealWebImage(prompt);
      if (webImg) {
        imageBuffer = webImg.buffer;
        contentType = webImg.contentType;
        isWebSearch = true;
      }
    }

    if (!imageBuffer) {
      const randomSeed = Math.floor(Math.random() * 10000000);
      const encodedPrompt = encodeURIComponent(fullPrompt);
      let url = `${POLLINATIONS_IMAGE_URL}${encodedPrompt}?model=flux&width=${dimensions.width}&height=${dimensions.height}&seed=${randomSeed}&nologo=true`;
      if (apiKey) {
        url += `&key=${apiKey}`;
      }

      const res = await fetch(url, {
        method: "GET",
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "Unknown error");
        console.error("Pollinations AI error:", errText);
        return NextResponse.json(
          { error: "Image generation failed. Please try again." },
          { status: res.status }
        );
      }

      imageBuffer = await res.arrayBuffer();
      contentType = "image/png";
    }

    const base64Image = Buffer.from(imageBuffer).toString("base64");
    const dataUrl = `data:${contentType};base64,${base64Image}`;

    // --- Auto-save to Media Library ---
    let libraryItem = null;
    let saveError: string | null = null;

    try {
      const fileBytes = Buffer.from(imageBuffer);
      const hash = createHash("sha256").update(fileBytes).digest("hex");
      const fileExtension = contentType.split("/")[1] || "png";
      const fileName = isWebSearch
        ? `web-search-${Date.now()}.${fileExtension}`
        : `ai-generated-${Date.now()}.${fileExtension}`;
      const storagePath = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExtension}`;

      const { data: storageData, error: storageError } = await supabase.storage
        .from("media-library")
        .upload(storagePath, fileBytes, {
          cacheControl: "3600",
          contentType: contentType,
          upsert: false,
        });

      if (storageError) {
        saveError = storageError.message;
      } else {
        const { data: { publicUrl } } = supabase.storage
          .from("media-library")
          .getPublicUrl(storageData.path);

        const { data: mediaItem, error: dbError } = await supabase
          .from("media_library")
          .insert({
            user_id: user.id,
            file_name: fileName,
            file_url: publicUrl,
            file_type: "image",
            file_size: fileBytes.byteLength,
            content_hash: hash,
          })
          .select()
          .single();

        if (dbError) {
          await supabase.storage.from("media-library").remove([storageData.path]);
          saveError = dbError.message;
        } else {
          libraryItem = mediaItem;
        }
      }
    } catch (saveErr) {
      console.error("Auto-save to library error:", saveErr);
      saveError = saveErr instanceof Error ? saveErr.message : "Failed to save to library";
    }

    // Increment AI images usage counter
    await incrementUsage(user.id, "ai_images", 1);

    return NextResponse.json({
      imageUrl: dataUrl,
      prompt: fullPrompt,
      savedToLibrary: !!libraryItem,
      libraryItem,
      ...(saveError ? { libraryError: saveError } : {}),
    });
  } catch (err) {
    console.error("Image generate error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { error: `Image generation failed: ${message}` },
      { status: 500 }
    );
  }
}