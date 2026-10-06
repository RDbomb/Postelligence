import { createAdminClient } from "@/lib/supabase/admin";
import { getTokenExpiry, refreshYouTubeAccessToken } from "@/lib/integrations/youtube";
import { publishToDiscordWebhook } from "@/lib/integrations/discord";
import { publishToTelegram } from "@/lib/integrations/telegram";
import type { ScheduledPost } from "@/types";

type PublishPlatform = "linkedin" | "youtube" | "bluesky" | "instagram" | "facebook" | "threads" | "twitter" | "pinterest" | "reddit" | "discord" | "telegram";

type StoredAccount = {
  platform: PublishPlatform;
  account_id: string;
  account_name: string;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at?: string | null;
  metadata: Record<string, unknown> | null;
  // Present when this is a workspace-owned account (see publishOne / processPost).
  workspace_id?: string | null;
};

type PublishResult = {
  platform: string;
  status: "published" | "skipped" | "failed";
  message: string;
  id?: string;
};

// Minimal shapes for the third-party JSON responses this module reads.
// Only the fields actually consumed here are declared.
type MetaIdResponse = { id?: string };
type MetaContainerResponse = { id: string };
type ThreadsStatusResponse = { status?: string; error_message?: string };
type InstagramStatusResponse = { status_code?: string; status?: string };

const graphVersion = process.env.META_GRAPH_VERSION || "v23.0";
const linkedInVersion = process.env.LINKEDIN_API_VERSION || "202605";
const linkedInHeaders = {
  "LinkedIn-Version": linkedInVersion,
  "X-Restli-Protocol-Version": "2.0.0",
};
const blueskyPdsHost = process.env.BLUESKY_PDS_HOST || "bsky.social";
const blueskyVideoServiceUrl = "https://video.bsky.app";

async function readJson(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}

async function requireOk(response: Response, label: string) {
  const payload = await readJson(response);
  if (!response.ok) {
    const detail =
      payload?.error?.message ||
      payload?.error ||
      payload?.message ||
      payload?.raw ||
      response.statusText;
    throw new Error(`${label}: ${detail}`);
  }
  return payload;
}

function buildText(post: ScheduledPost) {
  return [post.title, post.description].filter(Boolean).join("\n\n").trim();
}

function fileNameFromUrl(url: string) {
  try {
    return decodeURIComponent(new URL(url).pathname.split("/").pop() || "scheduled-media");
  } catch {
    return "scheduled-media";
  }
}

function inferContentType(url: string, headerType: string | null) {
  if (headerType) return headerType.split(";")[0];
  const lower = url.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".avi")) return "video/x-msvideo";
  return "video/mp4";
}

async function fetchAttachment(mediaUrl: string) {
  const response = await fetch(mediaUrl);
  if (!response.ok) {
    throw new Error(`Scheduled media fetch failed: ${response.statusText}`);
  }

  const contentType = inferContentType(mediaUrl, response.headers.get("content-type"));
  return new File([await response.arrayBuffer()], fileNameFromUrl(mediaUrl), {
    type: contentType,
  });
}

// Fetches every media URL on the post (not just the first) so LinkedIn/Bluesky
// can upload all of them — this is what silently dropped images 2+ when a
// post with multiple images was scheduled instead of published immediately.
async function fetchAttachments(mediaUrls: string[]): Promise<File[]> {
  const urls = mediaUrls.filter(Boolean);
  if (urls.length === 0) return [];
  const files = await Promise.all(
    urls.map(async (url) => {
      try {
        return await fetchAttachment(url);
      } catch {
        return null;
      }
    })
  );
  return files.filter((f): f is File => f !== null);
}

async function uploadLinkedInImage(accessToken: string, personUrn: string, attachment: File) {
  const init = await requireOk(
    await fetch("https://api.linkedin.com/rest/images?action=initializeUpload", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...linkedInHeaders,
      },
      body: JSON.stringify({ initializeUploadRequest: { owner: personUrn } }),
    }),
    "LinkedIn image upload init"
  );

  const uploadUrl: string = init?.value?.uploadUrl;
  const imageUrn: string = init?.value?.image;
  if (!uploadUrl || !imageUrn) throw new Error("LinkedIn image upload init did not return an upload URL.");

  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": attachment.type },
    body: await attachment.arrayBuffer(),
  });
  if (!uploadRes.ok) {
    const detail = await uploadRes.text();
    throw new Error(`LinkedIn image upload failed: ${detail || uploadRes.statusText}`);
  }

  return imageUrn;
}

async function uploadLinkedInVideo(accessToken: string, personUrn: string, attachment: File) {
  const init = await requireOk(
    await fetch("https://api.linkedin.com/rest/videos?action=initializeUpload", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...linkedInHeaders,
      },
      body: JSON.stringify({
        initializeUploadRequest: {
          owner: personUrn,
          fileSizeBytes: attachment.size,
          uploadCaptions: false,
          uploadThumbnail: false,
        },
      }),
    }),
    "LinkedIn video upload init"
  );

  const videoUrn: string = init?.value?.video;
  const uploadInstructions: Array<{ uploadUrl: string; firstByte: number; lastByte: number }> =
    init?.value?.uploadInstructions ?? [];
  const uploadToken: string = init?.value?.uploadToken;
  if (!videoUrn || !uploadInstructions.length) throw new Error("LinkedIn video upload init did not return upload instructions.");

  const bytes = Buffer.from(await attachment.arrayBuffer());
  const eTags: string[] = [];
  for (const instruction of uploadInstructions) {
    const chunkRes = await fetch(instruction.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: bytes.slice(instruction.firstByte, instruction.lastByte + 1),
    });
    if (!chunkRes.ok) {
      const detail = await chunkRes.text();
      throw new Error(`LinkedIn video chunk upload failed: ${detail || chunkRes.statusText}`);
    }
    eTags.push(chunkRes.headers.get("ETag") || chunkRes.headers.get("etag") || "");
  }

  await requireOk(
    await fetch("https://api.linkedin.com/rest/videos?action=finalizeUpload", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...linkedInHeaders,
      },
      body: JSON.stringify({
        finalizeUploadRequest: {
          video: videoUrn,
          uploadToken,
          uploadedPartIds: eTags,
        },
      }),
    }),
    "LinkedIn video finalize"
  );

  return videoUrn;
}

async function publishLinkedIn(account: StoredAccount, post: ScheduledPost, attachment: File | null, attachments: File[]) {
  if (!account.access_token) throw new Error("LinkedIn account has no access token.");

  const text = buildText(post);
  const author = `urn:li:person:${account.account_id}`;
  const body: Record<string, unknown> = {
    author,
    lifecycleState: "PUBLISHED",
    visibility: "PUBLIC",
    commentary: text,
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
  };

  const imageAttachments = attachments.filter((f) => !f.type.startsWith("video/"));

  if (attachment?.type.startsWith("video/")) {
    const videoUrn = await uploadLinkedInVideo(account.access_token, author, attachment);
    body.content = { media: { title: post.title || attachment.name || "Postelligence video", id: videoUrn } };
  } else if (imageAttachments.length > 1) {
    const imageUrns = (await Promise.all(imageAttachments.map((file) => uploadLinkedInImage(account.access_token!, author, file))))
      .filter((id): id is string => Boolean(id));
    if (imageUrns.length > 0) {
      body.content = { multiImage: { images: imageUrns.map((id) => ({ id })) } };
    }
  } else if (attachment) {
    const imageUrn = await uploadLinkedInImage(account.access_token, author, attachment);
    body.content = { media: { id: imageUrn } };
  } else if (post.media_urls[0]) {
    body.content = { article: { source: post.media_urls[0], title: post.title || text.slice(0, 100) } };
  }

  const payload = await requireOk(
    await fetch("https://api.linkedin.com/rest/posts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${account.access_token}`,
        "Content-Type": "application/json",
        ...linkedInHeaders,
      },
      body: JSON.stringify(body),
    }),
    "LinkedIn publish failed"
  );

  return payload?.id as string | undefined;
}

async function refreshStoredYouTubeToken(account: StoredAccount, userId: string) {
  if (!account.refresh_token) throw new Error("YouTube session expired. Reconnect YouTube.");

  const refreshed = await refreshYouTubeAccessToken(account.refresh_token);
  const accessToken = refreshed.access_token;
  const refreshToken = refreshed.refresh_token || account.refresh_token;
  const tokenExpiresAt = getTokenExpiry(refreshed.expires_in);

  // Workspace-owned accounts are matched by workspace_id, not the acting
  // user's id, since the row isn't owned by any one member.
  let updateQuery = createAdminClient()
    .from("social_accounts")
    .update({
      access_token: accessToken,
      refresh_token: refreshToken,
      token_expires_at: tokenExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("platform", "youtube")
    .eq("account_id", account.account_id);
  updateQuery = account.workspace_id
    ? updateQuery.eq("workspace_id", account.workspace_id)
    : updateQuery.eq("user_id", userId).is("workspace_id", null);
  await updateQuery;

  account.access_token = accessToken;
  account.refresh_token = refreshToken;
  account.token_expires_at = tokenExpiresAt;
  return accessToken;
}

async function publishYouTube(account: StoredAccount, post: ScheduledPost) {
  // If video was pre-uploaded at schedule time, just flip it from private → public
  const preUploadedId = post.youtube_video_id ?? null;

  let accessToken = account.access_token || "";
  // Always refresh — token may have expired since the video was pre-uploaded
  try {
    accessToken = await refreshStoredYouTubeToken(account, post.user_id);
  } catch {
    if (!accessToken) throw new Error("YouTube token missing and refresh failed.");
  }

  if (preUploadedId) {
    const res = await fetch("https://www.googleapis.com/youtube/v3/videos?part=status", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        kind: "youtube#video",
        id: preUploadedId,
        status: { privacyStatus: "public", selfDeclaredMadeForKids: false },
      }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      throw new Error(`YouTube publish failed (make public): ${err}`);
    }
    const payload = await res.json().catch(() => ({}));
    return payload?.id as string | undefined;
  }

  // Fallback: no pre-uploaded video — should not normally happen
  throw new Error("No youtube_video_id found on scheduled post. Please delete and reschedule.");
}

async function refreshBlueskySession(refreshJwt: string, pdsUrl: string) {
  const res = await fetch(`${pdsUrl}/xrpc/com.atproto.server.refreshSession`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${refreshJwt}`,
    },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.accessJwt ?? null;
}

async function getBlueskyToken(account: StoredAccount, pdsUrl: string) {
  if (account.access_token) {
    const check = await fetch(
      `${pdsUrl}/xrpc/app.bsky.actor.getProfile?actor=${account.account_id}`,
      { headers: { Authorization: `Bearer ${account.access_token}` } }
    );
    if (check.ok) return account.access_token;
  }

  if (account.refresh_token) {
    return await refreshBlueskySession(account.refresh_token, pdsUrl);
  }

  return null;
}

async function uploadBlueskyBlob(accessToken: string, attachment: File, pdsUrl: string) {
  const payload = await requireOk(
    await fetch(`${pdsUrl}/xrpc/com.atproto.repo.uploadBlob`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": attachment.type || "application/octet-stream",
      },
      body: await attachment.arrayBuffer(),
    }),
    "Bluesky blob upload"
  );
  return payload?.blob || null;
}

async function getBlueskyVideoServiceToken(accessToken: string, pdsUrl: string, audience: string) {
  const url = new URL(`${pdsUrl}/xrpc/com.atproto.server.getServiceAuth`);
  url.searchParams.set("aud", audience);
  url.searchParams.set("lxm", "com.atproto.repo.uploadBlob");
  url.searchParams.set("exp", String(Math.floor(Date.now() / 1000) + 60 * 30));

  const payload = await requireOk(
    await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } }),
    "Bluesky video service auth failed"
  );
  if (!payload?.token) throw new Error("Bluesky video service did not return an upload token.");
  return payload.token as string;
}

async function uploadBlueskyVideo(accessToken: string, did: string, attachment: File, pdsUrl: string) {
  const serviceToken = await getBlueskyVideoServiceToken(accessToken, pdsUrl, `did:web:${blueskyPdsHost}`);
  const bytes = await attachment.arrayBuffer();
  const uploadUrl = new URL(`${blueskyVideoServiceUrl}/xrpc/app.bsky.video.uploadVideo`);
  uploadUrl.searchParams.set("did", did);
  uploadUrl.searchParams.set("name", attachment.name || "postelligence-video.mp4");

  const uploadPayload = await requireOk(
    await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceToken}`,
        "Content-Type": attachment.type || "video/mp4",
        "Content-Length": String(bytes.byteLength),
      },
      body: bytes,
    }),
    "Bluesky video upload failed"
  );

  let blob = uploadPayload.blob || uploadPayload.jobStatus?.blob;
  const jobId = uploadPayload.jobId || uploadPayload.jobStatus?.jobId;

  for (let attempt = 0; !blob && jobId && attempt < 90; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const statusUrl = new URL(`${blueskyVideoServiceUrl}/xrpc/app.bsky.video.getJobStatus`);
    statusUrl.searchParams.set("jobId", jobId);
    const statusPayload = await requireOk(await fetch(statusUrl), "Bluesky video processing failed");
    const jobStatus = statusPayload.jobStatus || statusPayload;
    blob = jobStatus?.blob;
    if (jobStatus?.state === "JOB_STATE_FAILED" || jobStatus?.state === "failed") {
      throw new Error(jobStatus?.error || "Bluesky video processing failed.");
    }
  }

  if (!blob) throw new Error("Bluesky video processing timed out.");
  return blob;
}

async function publishBluesky(account: StoredAccount, post: ScheduledPost, attachment: File | null, attachments: File[]) {
  const pdsUrl = `https://${blueskyPdsHost}`;
  const token = await getBlueskyToken(account, pdsUrl);
  if (!token) throw new Error("Bluesky session expired. Reconnect Bluesky.");

  const record: Record<string, unknown> = {
    $type: "app.bsky.feed.post",
    text: buildText(post).slice(0, 300),
    createdAt: new Date().toISOString(),
  };

  // Bluesky posts support up to 4 images per post.
  const imageAttachments = attachments.filter((f) => !f.type.startsWith("video/")).slice(0, 4);

  if (attachment?.type.startsWith("video/")) {
    record.embed = {
      $type: "app.bsky.embed.video",
      video: await uploadBlueskyVideo(token, account.account_id, attachment, pdsUrl),
      aspectRatio: { width: 16, height: 9 },
    };
  } else if (imageAttachments.length > 0) {
    const blobs = await Promise.all(imageAttachments.map((file) => uploadBlueskyBlob(token, file, pdsUrl)));
    const embedImages = blobs
      .filter((b): b is NonNullable<typeof b> => Boolean(b))
      .map((b) => ({ image: b, alt: "" }));
    if (embedImages.length > 0) {
      record.embed = { $type: "app.bsky.embed.images", images: embedImages };
    }
  }

  const payload = await requireOk(
    await fetch(`${pdsUrl}/xrpc/com.atproto.repo.createRecord`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        repo: account.account_id,
        collection: "app.bsky.feed.post",
        record,
      }),
    }),
    "Bluesky publish failed"
  );

  return payload?.uri as string | undefined;
}

async function requirePublishedId(res: Response, label: string) {
  if (!res.ok) throw new Error(`${label}: ${await res.text()}`);
  const payload: MetaIdResponse = await res.json().catch(() => ({}));
  const id = payload?.id;
  if (!id) {
    // A 200 with no id means Meta accepted the request but didn't actually
    // hand back a published media object — treating that as success is how
    // "published" posts end up invisible on the platform.
    throw new Error(`${label}: platform returned success with no media ID (${JSON.stringify(payload)}).`);
  }
  return id;
}

import { IS_PINTEREST_LOCKED } from "@/lib/integrations/pinterest";

async function publishPinterest(account: StoredAccount, text: string, mediaUrl: string): Promise<string | undefined> {
  if (IS_PINTEREST_LOCKED) {
    throw new Error("Pinterest publishing is currently locked and coming soon.");
  }
  let boardId = (account.metadata?.board_id || account.metadata?.default_board_id) as string | undefined;
  if (!boardId) {
    try {
      const listRes = await fetch("https://api.pinterest.com/v5/boards?page_size=25", {
        headers: { Authorization: `Bearer ${account.access_token}` }
      });
      if (listRes.ok) {
        const data = await listRes.json();
        if (data.items?.length > 0 && data.items[0].id) boardId = data.items[0].id;
      }
    } catch {}
    if (!boardId) {
      const createRes = await fetch("https://api.pinterest.com/v5/boards", {
        method: "POST",
        headers: { Authorization: `Bearer ${account.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Postelligence Pins", description: "Created automatically by Postelligence for scheduled pins." })
      });
      if (createRes.ok) {
        const data = await createRes.json();
        boardId = data?.id;
      }
    }
  }
  if (!boardId) throw new Error("Pinterest requires a board to publish pins.");
  if (!mediaUrl) throw new Error("Pinterest requires a public image URL.");

  const response = await fetch("https://api.pinterest.com/v5/pins", {
    method: "POST",
    headers: { Authorization: `Bearer ${account.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      board_id: boardId,
      title: text.slice(0, 100) || "Postelligence Pin",
      description: text.slice(0, 800),
      media_source: { source_type: "image_url", url: mediaUrl },
    })
  });
  return await requirePublishedId(response, "Pinterest publish failed");
}

async function publishTelegramMessage(account: StoredAccount, text: string, mediaUrl: string, mediaUrls: string[] = []) {
  const botToken = account.access_token;
  const chatId = (account.metadata?.chatId as string) || account.account_id;
  if (!botToken || !chatId) throw new Error("Telegram bot token or Chat ID is missing.");
  return await publishToTelegram(botToken, chatId, text, mediaUrl, mediaUrls);
}

async function publishOne(account: StoredAccount, post: ScheduledPost, attachment: File | null, attachments: File[]): Promise<PublishResult> {
  try {
    // Facebook, Threads, and Instagram only have a single caption field with no separate
    // title shown to viewers — using buildText() (title + description) here would post the
    // "Untitled Post" default title above the real caption. Use description alone instead.
    const captionOnly = (post.description || post.title || "").trim();
    const mediaUrl = post.media_urls[0] || "";
    const mediaType = attachment?.type.startsWith("video/") ? "video"
      : attachment?.type.startsWith("image/") ? "image"
      : /\.(mp4|mov|webm|avi)(\?|$)/i.test(mediaUrl) ? "video"
      : "image";

    const id =
      account.platform === "linkedin"  ? await publishLinkedIn(account, post, attachment, attachments) :
      account.platform === "youtube"   ? await publishYouTube(account, post) :
      account.platform === "bluesky"   ? await publishBluesky(account, post, attachment, attachments) :
      account.platform === "facebook"  ? await publishFacebook(account, captionOnly, mediaUrl, mediaType, post.media_urls) :
      account.platform === "threads"   ? await publishThreads(account, captionOnly, mediaUrl, mediaType, post.media_urls) :
      account.platform === "instagram" ? await publishInstagram(account, captionOnly, mediaUrl, mediaType, post.media_urls) :
      account.platform === "pinterest" ? await publishPinterest(account, captionOnly, mediaUrl) :
      account.platform === "discord"   ? await publishDiscord(account, captionOnly, mediaUrl, attachment, attachments) :
      account.platform === "telegram"  ? await publishTelegramMessage(account, captionOnly, mediaUrl, post.media_urls) :
      undefined;

    return { platform: account.platform, status: "published", message: "Published successfully.", id };
  } catch (error) {
    return {
      platform: account.platform,
      status: "failed",
      message: error instanceof Error ? error.message : "Publishing failed.",
    };
  }
}

async function processPost(post: ScheduledPost) {
  const supabase = createAdminClient();

  // Claiming now happens atomically upstream, in claim_due_scheduled_posts()
  // (see migration 015), shared with the Supabase Edge Function scheduler.
  // That single DB-level "FOR UPDATE SKIP LOCKED" claim is what actually
  // prevents two schedulers/runs from grabbing the same row — this
  // function's job is just to publish a post it has already been handed.

  // A post can be handed to us here for a SECOND time if a previous run
  // claimed it, crashed/timed out mid-publish, and it got reclaimed after
  // the staleness window. `platform_results` from that earlier attempt may
  // already contain real successes — those must be skipped, not re-posted.
  const priorResults: PublishResult[] = Array.isArray(post.platform_results)
    ? post.platform_results
    : [];
  const alreadyPublished = new Set(
    priorResults.filter((r) => r.status === "published").map((r) => r.platform)
  );

  let attachment: File | null = null;
  let attachments: File[] = [];
  let attachmentError: string | null = null;
  const results: PublishResult[] = [];

  // LinkedIn, Bluesky, and Discord upload the raw file bytes. Discord uses an
  // attachment so its CDN never has to fetch a possibly private storage URL.
  // Facebook, Instagram, Threads, and YouTube either take a public URL or use the pre-uploaded
  // youtube_video_id, so we should never fetch the file just for those — large video files made
  // this fetch slow/likely to fail, and a failure here was wrongly blocking every platform below.
  const needsRawAttachment = post.platforms.some((p) => p === "linkedin" || p === "bluesky" || p === "discord");

  if (needsRawAttachment && post.media_urls[0]) {
    try {
      // Fetch every image (not just the first) so multi-image posts don't
      // silently lose images 2+ when they go out via the scheduler.
      attachments = await fetchAttachments(post.media_urls);
      attachment = attachments[0] || null;
      if (attachments.length === 0) {
        attachmentError = "Failed to download media for upload.";
      }
    } catch (error) {
      // Don't throw here — record it and let LinkedIn/Bluesky fail individually below,
      // while Facebook/Instagram/Threads/YouTube still get a chance to publish.
      attachmentError = error instanceof Error ? error.message : "Failed to download media for upload.";
    }
  }

  try {
    const platforms = post.platforms.filter((platform): platform is PublishPlatform =>
      platform === "linkedin" || platform === "youtube" || platform === "bluesky" ||
      platform === "facebook" || platform === "instagram" || platform === "threads" ||
      platform === "pinterest" || platform === "discord" || platform === "telegram"
    );

    // Workspace-scheduled posts must always publish through the workspace's
    // connected accounts, never the personal accounts of whoever happened to
    // schedule it — so resolve by workspace_id when present, exactly like
    // the immediate-publish route does.
    const accountQuery = supabase
      .from("social_accounts")
      .select("platform, account_id, account_name, access_token, refresh_token, token_expires_at, metadata, workspace_id")
      .eq("status", "connected")
      .in("platform", platforms);

    const { data: accounts, error } = platforms.length > 0
      ? post.workspace_id
        ? await accountQuery.eq("workspace_id", post.workspace_id)
        : await accountQuery.eq("user_id", post.user_id).is("workspace_id", null)
      : { data: [], error: null };

    if (error) throw new Error(error.message);

    for (const platform of post.platforms) {
      if (alreadyPublished.has(platform)) {
        results.push(priorResults.find((r) => r.platform === platform)!);
        continue;
      }

      if (
        platform !== "linkedin" && platform !== "youtube" && platform !== "bluesky" &&
        platform !== "facebook" && platform !== "instagram" && platform !== "threads" &&
        platform !== "discord" && platform !== "telegram"
      ) {
        results.push({ platform, status: "skipped", message: `${platform} scheduled publishing is not enabled.` });
        continue;
      }

      // LinkedIn/Bluesky need the raw file — if downloading it failed, fail just this platform
      if ((platform === "linkedin" || platform === "bluesky") && attachmentError) {
        results.push({ platform, status: "failed", message: attachmentError });
        continue;
      }

      const account = (accounts || []).find((item) => item.platform === platform) as StoredAccount | undefined;
      if (!account) {
        results.push({ platform, status: "skipped", message: "No connected account found." });
        continue;
      }

      results.push(await publishOne(account, post, attachment, attachments));
    }
  } catch (error) {
    results.push({
      platform: "scheduler",
      status: "failed",
      message: error instanceof Error ? error.message : "Scheduler failed.",
    });
  }

  const failed = results.filter((result) => result.status === "failed");
  // Only "published" if every requested platform actually succeeded —
  // matches the Supabase Edge Function scheduler's rule (see
  // supabase/functions/auto-publish/index.ts), so the same post can't be
  // considered "published" by one scheduler and "failed" by the other.
  const finalStatus = failed.length > 0 ? "failed" : "published";

  // These two updates are intentionally independent — a failure writing to
  // scheduled_posts must never prevent the workspace_drafts update below
  // (previously it did, via a thrown error, which could leave a draft
  // stuck on "scheduled" even after the real post had already gone out).
  try {
    const { error: updateError } = await supabase
      .from("scheduled_posts")
      .update({ status: finalStatus, platform_results: results, updated_at: new Date().toISOString() })
      .eq("id", post.id);

    if (updateError && updateError.message.includes("platform_results")) {
      const { error: fallbackError } = await supabase
        .from("scheduled_posts")
        .update({ status: finalStatus, updated_at: new Date().toISOString() })
        .eq("id", post.id);
      if (fallbackError) {
        console.error("[Scheduler] Failed to update scheduled_posts (fallback)", { postId: post.id, error: fallbackError.message });
      }
    } else if (updateError) {
      console.error("[Scheduler] Failed to update scheduled_posts", { postId: post.id, error: updateError.message });
    }
  } catch (e) {
    console.error("[Scheduler] Unexpected error updating scheduled_posts", { postId: post.id, error: e instanceof Error ? e.message : String(e) });
  }

  if (failed.length > 0) {
    console.error("[Scheduler] Some platforms failed", { postId: post.id, results });
  }

  // If this post originated from a Team Workspace draft, flip that draft's
  // status too — always attempted regardless of the outcome above, so the
  // draft never gets stuck on "scheduled" after the real post went out (or
  // failed) in the background.
  if (post.workspace_draft_id) {
    try {
      const { error: draftUpdateError } = await supabase
        .from("workspace_drafts")
        .update({
          status: finalStatus,
          rejection_reason: finalStatus === "published" ? null : (failed[0]?.message || "Scheduled publish failed."),
          updated_at: new Date().toISOString(),
        })
        .eq("id", post.workspace_draft_id);

      if (draftUpdateError) {
        console.error("[Scheduler] Failed to sync workspace_drafts status", { draftId: post.workspace_draft_id, error: draftUpdateError.message });
      }
    } catch (e) {
      console.error("[Scheduler] Unexpected error syncing workspace_drafts", { draftId: post.workspace_draft_id, error: e instanceof Error ? e.message : String(e) });
    }
  }
}

export async function runScheduler(): Promise<{ processed: number }> {
  const supabase = createAdminClient();

  // claim_due_scheduled_posts() atomically flips due posts from
  // "pending" to "publishing" using FOR UPDATE SKIP LOCKED (see migration
  // 015). This is the same function the Supabase Edge Function scheduler
  // uses, so no matter which one runs, or whether they overlap, a given
  // post can only ever be claimed and published once per attempt.
  const { data: duePosts, error } = await supabase.rpc("claim_due_scheduled_posts", {
    p_batch_size: 10,
  });

  if (error) {
    throw new Error(error.message);
  }

  const claimedPosts: ScheduledPost[] = duePosts || [];
  await Promise.allSettled(claimedPosts.map((post) => processPost(post)));
  return { processed: duePosts?.length || 0 };
}
async function publishFacebook(account: StoredAccount, text: string, mediaUrl: string, mediaType: string, mediaUrls: string[]) {
  const token = account.access_token || "";
  const base = `https://graph.facebook.com/${graphVersion}/${account.account_id}`;

  // Video: /videos endpoint + file_url param
  if (mediaUrl && mediaType === "video") {
    const params = new URLSearchParams({ access_token: token, file_url: mediaUrl });
    if (text) params.set("description", text);
    const res = await fetch(`${base}/videos`, { method: "POST", body: params });
    if (!res.ok) throw new Error(`Facebook publish failed: ${await res.text()}`);
    return ((await res.json()) as MetaIdResponse)?.id;
  }

  // Multiple images: upload each unpublished, then attach them all to one /feed post.
  const imageUrls = mediaType === "image" ? mediaUrls.filter(Boolean) : [];
  if (imageUrls.length > 1) {
    const photoIds = (await Promise.all(imageUrls.map(async (url) => {
      const params = new URLSearchParams({ access_token: token, url, published: "false" });
      const res = await fetch(`${base}/photos`, { method: "POST", body: params });
      if (!res.ok) return null;
      return ((await res.json()) as MetaIdResponse)?.id;
    }))).filter((id): id is string => Boolean(id));

    if (photoIds.length > 1) {
      const feedParams = new URLSearchParams({ access_token: token });
      if (text) feedParams.set("message", text);
      photoIds.forEach((id, i) => feedParams.set(`attached_media[${i}]`, JSON.stringify({ media_fbid: id })));
      const res = await fetch(`${base}/feed`, { method: "POST", body: feedParams });
      if (!res.ok) throw new Error(`Facebook publish failed: ${await res.text()}`);
      return ((await res.json()) as MetaIdResponse)?.id;
    }
  }

  // Image: /photos endpoint + url param
  if (mediaUrl) {
    const params = new URLSearchParams({ access_token: token, url: mediaUrl });
    if (text) params.set("caption", text);
    const res = await fetch(`${base}/photos`, { method: "POST", body: params });
    if (!res.ok) throw new Error(`Facebook publish failed: ${await res.text()}`);
    return ((await res.json()) as MetaIdResponse)?.id;
  }

  // Text only: /feed
  const params = new URLSearchParams({ access_token: token, message: text });
  const res = await fetch(`${base}/feed`, { method: "POST", body: params });
  if (!res.ok) throw new Error(`Facebook publish failed: ${await res.text()}`);
  return ((await res.json()) as MetaIdResponse)?.id;
}

async function publishThreads(account: StoredAccount, text: string, mediaUrl: string, mediaType: string, mediaUrls: string[]) {
  const token = account.access_token || "";
  const userId = account.account_id;
  const statusParams = new URLSearchParams({ access_token: token, fields: "status,error_message" });

  async function waitForThreadsContainer(containerId: string): Promise<void> {
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        const statusRes = await fetch(`https://graph.threads.net/${containerId}?${statusParams}`);
        const status = await statusRes.json() as ThreadsStatusResponse;
        if (status.status === "FINISHED") return;
        if (status.status === "ERROR") throw new Error(`Threads media processing failed: ${status.error_message || "unknown"}`);
      } catch (e) {
        if (e instanceof Error && e.message.startsWith("Threads media processing failed")) throw e;
      }
    }
    throw new Error("Threads media did not finish processing in time.");
  }

  // Threads carousel: 2-20 images posted together as one swipeable post.
  const imageUrls = mediaType === "image" ? mediaUrls.filter(Boolean) : [];
  if (imageUrls.length > 1) {
    const carouselUrls = imageUrls.slice(0, 20);
    const childIds = (await Promise.all(carouselUrls.map(async (url) => {
      const params = new URLSearchParams({
        access_token: token,
        is_carousel_item: "true",
        media_type: "IMAGE",
        image_url: url,
      });
      const res = await fetch(`https://graph.threads.net/${userId}/threads`, { method: "POST", body: params });
      if (!res.ok) return undefined;
      const child = await res.json() as MetaIdResponse;
      return child?.id;
    }))).filter((id): id is string => Boolean(id));

    if (childIds.length > 1) {
      // Wait for each child container to finish processing before creating parent CAROUSEL container
      for (const childId of childIds) {
        await waitForThreadsContainer(childId);
      }

      const carouselParams = new URLSearchParams({
        access_token: token,
        media_type: "CAROUSEL",
        children: childIds.join(","),
        text,
      });
      const containerRes = await fetch(`https://graph.threads.net/${userId}/threads`, { method: "POST", body: carouselParams });
      if (!containerRes.ok) throw new Error(`Threads carousel container failed: ${await containerRes.text()}`);
      const container = await containerRes.json() as MetaContainerResponse;
      await waitForThreadsContainer(container.id);
      const publishRes = await fetch(`https://graph.threads.net/${userId}/threads_publish`, {
        method: "POST",
        body: new URLSearchParams({ access_token: token, creation_id: container.id }),
      });
      return await requirePublishedId(publishRes, "Threads publish failed");
    }
  }

  const createParams = new URLSearchParams({ access_token: token, text });
  if (mediaUrl) {
    createParams.set("media_type", mediaType === "video" ? "VIDEO" : "IMAGE");
    createParams.set(mediaType === "video" ? "video_url" : "image_url", mediaUrl);
  } else {
    createParams.set("media_type", "TEXT");
  }
  const containerRes = await fetch(`https://graph.threads.net/${userId}/threads`, { method: "POST", body: createParams });
  if (!containerRes.ok) throw new Error(`Threads container failed: ${await containerRes.text()}`);
  const container = await containerRes.json() as MetaContainerResponse;

  const publishParams = new URLSearchParams({ access_token: token, creation_id: container.id });

  if (mediaType !== "video") {
    // Images/text: poll until FINISHED before publishing. A flat delay isn't enough —
    // when Meta's servers are slow to fetch/process the image_url, publishing before the
    // container is ready either gets rejected or silently produces nothing visible, and
    // either way looks "random" (sometimes published, sometimes failed) from the outside.
    let imageFinished = !mediaUrl; // pure text posts have no container to wait on
    for (let i = 0; i < 10 && !imageFinished; i++) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        const statusRes = await fetch(`https://graph.threads.net/${container.id}?${statusParams}`);
        const status = await statusRes.json() as ThreadsStatusResponse;
        if (status.status === "FINISHED") { imageFinished = true; break; }
        if (status.status === "ERROR") throw new Error(`Threads media processing failed: ${status.error_message || "unknown"}`);
      } catch (e) {
        if (e instanceof Error && e.message.startsWith("Threads media processing failed")) throw e;
        // transient fetch error — keep polling
      }
    }
    if (!imageFinished) throw new Error("Threads media did not finish processing in time.");

    const publishRes = await fetch(`https://graph.threads.net/${userId}/threads_publish`, { method: "POST", body: publishParams });
    return await requirePublishedId(publishRes, "Threads publish failed");
  }

  // Video: Meta needs time to transcode — poll the container status until FINISHED before publishing.
  // Publishing before transcoding completes is the main reason scheduled video posts were failing.
  let finished = false;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 5000));
    try {
      const statusRes = await fetch(`https://graph.threads.net/${container.id}?${statusParams}`);
      const status = await statusRes.json() as ThreadsStatusResponse;
      if (status.status === "FINISHED") { finished = true; break; }
      if (status.status === "ERROR") throw new Error(`Threads video processing failed: ${status.error_message || "unknown"}`);
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("Threads video processing failed")) throw e;
      // transient fetch error — keep polling
    }
  }
  if (!finished) throw new Error("Threads video did not finish processing in time.");

  const publishRes = await fetch(`https://graph.threads.net/${userId}/threads_publish`, { method: "POST", body: publishParams });
  return await requirePublishedId(publishRes, "Threads publish failed");
}

async function publishInstagram(account: StoredAccount, text: string, mediaUrl: string, mediaType: string, mediaUrls: string[]) {
  const token = account.access_token || "";
  const userId = account.account_id;
  const isDirectLogin = account.metadata?.login_type === "instagram";
  const base = isDirectLogin ? `https://graph.instagram.com/${graphVersion}` : `https://graph.facebook.com/${graphVersion}`;
  const statusParams = new URLSearchParams({ access_token: token, fields: "status_code,status" });

  async function waitForContainer(containerId: string): Promise<void> {
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const statusRes = await fetch(`${base}/${containerId}?${statusParams}`);
      const status = await statusRes.json() as InstagramStatusResponse;
      if (status.status_code === "FINISHED") return;
      if (status.status_code === "ERROR") throw new Error(`Instagram media processing failed: ${status.status || "unknown"}`);
    }
    throw new Error("Instagram media did not finish processing in time.");
  }

  // Carousel: 2-10 images posted together as one swipeable post.
  const imageUrls = mediaType === "image" ? mediaUrls.filter(Boolean) : [];
  if (imageUrls.length > 1) {
    const carouselUrls = imageUrls.slice(0, 10);
    const childIds = (await Promise.all(carouselUrls.map(async (url) => {
      const params = new URLSearchParams({ access_token: token, image_url: url, is_carousel_item: "true" });
      const res = await fetch(`${base}/${userId}/media`, { method: "POST", body: params });
      if (!res.ok) return undefined;
      const child = await res.json() as MetaIdResponse;
      return child?.id;
    }))).filter((id): id is string => Boolean(id));

    if (childIds.length > 1) {
      // Wait for each child container to finish processing before creating parent CAROUSEL container
      for (const childId of childIds) {
        await waitForContainer(childId);
      }

      const carouselParams = new URLSearchParams({ access_token: token, media_type: "CAROUSEL", caption: text });
      childIds.forEach((id, i) => carouselParams.set(`children[${i}]`, id));
      const containerRes = await fetch(`${base}/${userId}/media`, { method: "POST", body: carouselParams });
      if (!containerRes.ok) throw new Error(`Instagram carousel failed: ${await containerRes.text()}`);
      const container = await containerRes.json() as MetaContainerResponse;
      await waitForContainer(container.id);
      const publishRes = await fetch(`${base}/${userId}/media_publish`, {
        method: "POST",
        body: new URLSearchParams({ access_token: token, creation_id: container.id }),
      });
      return await requirePublishedId(publishRes, "Instagram publish failed");
    }
  }

  if (!mediaUrl) throw new Error("Instagram requires a media URL.");

  const createParams = new URLSearchParams({ access_token: token, caption: text });
  if (mediaType === "video") {
    createParams.set("media_type", "REELS");
    createParams.set("video_url", mediaUrl);
    // Without this, a Reel only shows in the Reels tab — not the main profile
    // grid/feed, which is usually where people look first and conclude
    // "it never posted."
    createParams.set("share_to_feed", "true");
  } else {
    createParams.set("image_url", mediaUrl);
  }
  let containerRes = await fetch(`${base}/${userId}/media`, { method: "POST", body: createParams });
  if (!containerRes.ok) {
    const errText = await containerRes.text();
    if (mediaType === "video" && (errText.includes("2207009") || errText.includes("aspect ratio"))) {
      console.warn("Instagram Reel share_to_feed rejected due to aspect ratio, retrying as standard Reel...");
      createParams.delete("share_to_feed");
      containerRes = await fetch(`${base}/${userId}/media`, { method: "POST", body: createParams });
    }
    if (!containerRes.ok) {
      const finalErrText = await containerRes.text().catch(() => errText);
      if (finalErrText.includes("2207009") || finalErrText.includes("aspect ratio")) {
        throw new Error("Instagram image aspect ratio is not supported (error 2207009). Instagram requires feed images to be between 4:5 (0.8) and 1.91:1 aspect ratio. Please crop your image.");
      }
      throw new Error(`Instagram container failed: ${finalErrText}`);
    }
  }
  const container = await containerRes.json() as MetaContainerResponse;

  const publishParams = new URLSearchParams({ access_token: token, creation_id: container.id });

  if (mediaType !== "video") {
    // Images: poll until FINISHED, 2s intervals, max 20s total. Must gate on the result —
    // calling media_publish while the container is still IN_PROGRESS either gets rejected
    // or returns a success-looking response for a container that never finishes, which is
    // why this looked "random" (sometimes published, sometimes failed, never actually visible).
    let imageFinished = false;
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const statusRes = await fetch(`${base}/${container.id}?${statusParams}`);
      const status = await statusRes.json() as InstagramStatusResponse;
      if (status.status_code === "FINISHED") { imageFinished = true; break; }
      if (status.status_code === "ERROR") throw new Error(`Instagram media processing failed: ${status.status || "unknown"}`);
    }
    if (!imageFinished) throw new Error("Instagram media did not finish processing in time.");

    const publishRes = await fetch(`${base}/${userId}/media_publish`, { method: "POST", body: publishParams });
    return await requirePublishedId(publishRes, "Instagram publish failed");
  }

  // Video (Reels): Meta takes 30-120s to transcode — poll for FINISHED before publishing.
  // Publishing too early (the old fixed 3s wait) is the main reason scheduled video posts were failing.
  let finished = false;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const statusRes = await fetch(`${base}/${container.id}?${statusParams}`);
    const status = await statusRes.json() as InstagramStatusResponse;
    if (status.status_code === "FINISHED") { finished = true; break; }
    if (status.status_code === "ERROR") throw new Error(`Instagram media processing failed: ${status.status || "unknown"}`);
  }
  if (!finished) throw new Error("Instagram video did not finish processing in time.");

  const publishRes = await fetch(`${base}/${userId}/media_publish`, { method: "POST", body: publishParams });
  return await requirePublishedId(publishRes, "Instagram publish failed");
}

async function publishDiscord(account: StoredAccount, text: string, mediaUrl: string, attachment: File | null, attachments: File[]) {
  if (!account.access_token) throw new Error("Discord webhook URL is missing.");
  return await publishToDiscordWebhook(account.access_token, text, mediaUrl || null, attachment, attachments);
}
