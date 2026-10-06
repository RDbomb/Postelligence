import type { ScheduledPost } from "@/types";
import { refreshYouTubeAccessToken } from "@/lib/integrations/youtube";
import { fetchDiscordWebhookInfo } from "@/lib/integrations/discord";
import { IS_PINTEREST_LOCKED } from "@/lib/integrations/pinterest";

export type AnalyticsAccount = {
  id: string;
  platform: string;
  account_id: string;
  account_name: string;
  account_avatar_url: string | null;
  status: string;
  scopes: string[] | null;
  metadata: Record<string, unknown> | null;
  connected_at: string | null;
  updated_at: string | null;
  access_token?: string | null;
  refresh_token?: string | null;
  token_expires_at?: string | null;
};

export type PlatformAnalytics = {
  platform: string;
  name: string;
  accountName: string;
  color: string;
  tone: string;
  connected: boolean;
  fetched: boolean;
  status: "synced" | "partial" | "unavailable" | "error";
  message: string;
  posts: number;
  published: number;
  queued: number;
  failed: number;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  reach: number | null;
  followers: number | null;
  engagementRate: number | null;
  recentPosts: AnalyticsPost[];
};

export type AnalyticsPost = {
  id: string;
  title: string;
  url?: string;
  createdAt?: string;
  platform: string;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  reach: number | null;
};

type PlatformPublishResult = {
  platform?: string;
  status?: "published" | "skipped" | "failed";
  message?: string;
  id?: string;
};

export type AnalyticsDashboardData = {
  generatedAt: string;
  totals: {
    postPerformance: number | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
    reach: number | null;
    followers: number | null;
    engagementRate: number | null;
  };
  platforms: PlatformAnalytics[];
};

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v23.0";
const LINKEDIN_VERSION = process.env.LINKEDIN_API_VERSION || "202605";

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function getNestedNumber(source: unknown, keys: string[]): number | null {
  if (!source || typeof source !== "object") return null;
  const record = source as Record<string, unknown>;

  for (const key of keys) {
    const value = asNumber(record[key]);
    if (value !== null) return value;
  }

  for (const value of Object.values(record)) {
    if (value && typeof value === "object") {
      const nested = getNestedNumber(value, keys);
      if (nested !== null) return nested;
    }
  }

  return null;
}

function getNestedString(source: unknown, keys: string[]): string | null {
  if (!source || typeof source !== "object") return null;
  const record = source as Record<string, unknown>;

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
  }

  for (const value of Object.values(record)) {
    if (value && typeof value === "object") {
      const nested = getNestedString(value, keys);
      if (nested) return nested;
    }
  }

  return null;
}

function addNullable(values: Array<number | null>) {
  const present = values.filter((value): value is number => value !== null);
  return present.length ? present.reduce((sum, value) => sum + value, 0) : null;
}

function engagementRate(likes: number | null, comments: number | null, shares: number | null, reach: number | null) {
  if (!reach || reach <= 0) return null;
  return (((likes || 0) + (comments || 0) + (shares || 0)) / reach) * 100;
}

function getPlatformResults(post: ScheduledPost): PlatformPublishResult[] {
  return Array.isArray(post.platform_results)
    ? post.platform_results.filter((result) => !!result && typeof result === "object")
    : [];
}

function getPlatformResult(post: ScheduledPost, platform: string) {
  return getPlatformResults(post).find((result) => result.platform === platform) || null;
}

export type ScheduledPostMatcher = { ids: Set<string>; fallbackTimestamps: number[] };
const MATCH_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function buildScheduledMatcher(platform: string, scheduledPosts: ScheduledPost[]): ScheduledPostMatcher {
  const ids = new Set<string>();
  const fallbackTimestamps: number[] = [];
  for (const post of scheduledPosts) {
    if (!includesPlatform(post, platform)) continue;
    if (platformPostStatus(post, platform) !== "published") continue;
    const result = getPlatformResult(post, platform);
    if (result?.id) {
      ids.add(String(result.id));
    } else {
      const raw = post.scheduled_time || post.updated_at || post.created_at;
      const t = raw ? new Date(raw).getTime() : NaN;
      if (!Number.isNaN(t)) fallbackTimestamps.push(t);
    }
  }
  return { ids, fallbackTimestamps };
}

function matchesScheduledPost(post: AnalyticsPost, matcher: ScheduledPostMatcher): boolean {
  if (matcher.ids.has(post.id)) return true;
  if (!post.createdAt) return false;
  const t = new Date(post.createdAt).getTime();
  if (Number.isNaN(t)) return false;
  return matcher.fallbackTimestamps.some((ft) => Math.abs(ft - t) <= MATCH_WINDOW_MS);
}

function includesPlatform(post: ScheduledPost, platform: string) {
  const results = getPlatformResults(post);
  return results.length > 0
    ? results.some((result) => result.platform === platform)
    : (post.platforms || []).includes(platform);
}

function platformPostStatus(post: ScheduledPost, platform: string) {
  return getPlatformResult(post, platform)?.status || post.status;
}

function localAnalyticsPosts(platform: string, posts: ScheduledPost[]): AnalyticsPost[] {
  return posts
    .filter((post) => includesPlatform(post, platform) && platformPostStatus(post, platform) === "published")
    .map((post) => {
      const result = getPlatformResult(post, platform);
      const id = result?.id || post.id;
      return {
        id,
        title: post.title || post.description || `${platformLabel(platform)} post`,
        createdAt: post.scheduled_time || post.updated_at || post.created_at,
        platform,
        likes: null,
        comments: null,
        shares: null,
        reach: null,
      };
    });
}

function platformLabel(platform: string) {
  const labels: Record<string, string> = {
    instagram: "Instagram",
    facebook: "Facebook",
    linkedin: "LinkedIn",
    youtube: "YouTube",
    twitter: "X (Twitter)",
    threads: "Threads",
    bluesky: "Bluesky",
    pinterest: "Pinterest",
    reddit: "Reddit",
    telegram: "Telegram",
    discord: "Discord",
  };
  return labels[platform] || platform;
}

function platformStyle(platform: string) {
  const styles: Record<string, { color: string; tone: string }> = {
    instagram: { color: "#E1306C", tone: "bg-pink-50 text-pink-700 border-pink-100" },
    facebook: { color: "#1877F2", tone: "bg-blue-50 text-blue-700 border-blue-100" },
    linkedin: { color: "#0A66C2", tone: "bg-sky-50 text-sky-700 border-sky-100" },
    youtube: { color: "#FF0000", tone: "bg-red-50 text-red-700 border-red-100" },
    twitter: { color: "#111827", tone: "bg-slate-50 text-slate-700 border-slate-200" },
    threads: { color: "#111827", tone: "bg-zinc-50 text-zinc-700 border-zinc-200" },
    bluesky: { color: "#1185FE", tone: "bg-cyan-50 text-cyan-700 border-cyan-100" },
    pinterest: { color: "#E60023", tone: "bg-rose-50 text-rose-700 border-rose-100" },
    reddit: { color: "#FF4500", tone: "bg-orange-50 text-orange-700 border-orange-100" },
    telegram: { color: "#229ED9", tone: "bg-sky-50 text-sky-800 border-sky-100" },
    discord: { color: "#5865F2", tone: "bg-indigo-50 text-indigo-700 border-indigo-100" },
  };
  return styles[platform] || { color: "#2f7867", tone: "bg-emerald-50 text-emerald-700 border-emerald-100" };
}

function basePlatform(account: AnalyticsAccount, scheduledPosts: ScheduledPost[]): PlatformAnalytics {
  const platformPosts = scheduledPosts.filter((post) => includesPlatform(post, account.platform));
  const published = platformPosts.filter((post) => platformPostStatus(post, account.platform) === "published").length;
  const queued = platformPosts.filter((post) => {
    const status = platformPostStatus(post, account.platform);
    return status === "pending" || status === "publishing";
  }).length;
  const failed = platformPosts.filter((post) => platformPostStatus(post, account.platform) === "failed").length;
  const metadata = account.metadata || {};
  const likes = getNestedNumber(metadata, ["likes", "like_count", "likeCount"]);
  const comments = getNestedNumber(metadata, ["comments", "comment_count", "commentCount"]);
  const shares = getNestedNumber(metadata, ["shares", "share_count", "shareCount", "reposts"]);
  const reach = getNestedNumber(metadata, ["reach", "impressions", "views", "viewCount"]);
  const followers = getNestedNumber(metadata, ["followers", "followers_count", "follower_count", "subscriberCount"]);
  const style = platformStyle(account.platform);
  const recentPosts = localAnalyticsPosts(account.platform, platformPosts);

  return {
    platform: account.platform,
    name: platformLabel(account.platform),
    accountName: account.account_name,
    color: style.color,
    tone: style.tone,
    connected: account.status === "connected",
    fetched: false,
    status: account.status === "connected" ? "unavailable" : "error",
    message: recentPosts.length ? `Loaded ${recentPosts.length} locally published posts.` : account.status === "connected" ? "No live analytics fetched yet." : "Account is not connected.",
    posts: platformPosts.length,
    published,
    queued,
    failed,
    likes,
    comments,
    shares,
    reach,
    followers,
    engagementRate: engagementRate(likes, comments, shares, reach),
    recentPosts,
  };
}

async function readJson(url: string, init?: RequestInit, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;

  try {
    response = await fetch(url, { ...init, cache: "no-store", signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Analytics request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!response.ok) {
    const message = typeof json === "object" && json && "error" in json
      ? JSON.stringify((json as Record<string, unknown>).error)
      : text || response.statusText;
    throw new Error(message);
  }
  return json as Record<string, unknown>;
}

function summarizePosts(
  platform: string,
  posts: AnalyticsPost[],
  fallback: PlatformAnalytics,
  followers: number | null = fallback.followers,
  matcher?: ScheduledPostMatcher | null
): PlatformAnalytics {
  const scoped = matcher ? posts.filter((post) => matchesScheduledPost(post, matcher)) : posts;

  const likes = addNullable(scoped.map((post) => post.likes));
  const comments = addNullable(scoped.map((post) => post.comments));
  const shares = addNullable(scoped.map((post) => post.shares));
  const reach = addNullable(scoped.map((post) => post.reach));

  return {
    ...fallback,
    platform,
    fetched: true,
    status: "synced",
    message: matcher && posts.length > 0 && scoped.length === 0
      ? "Synced account, but none of its recent posts were published through this workspace yet."
      : scoped.length ? `Synced ${scoped.length} recent posts.` : "Synced account, no recent posts returned.",
    posts: Math.max(fallback.posts, scoped.length),
    likes,
    comments,
    shares,
    reach,
    followers,
    engagementRate: engagementRate(likes, comments, shares, reach),
    recentPosts: scoped,
  };
}

function graphInsightValue(insights: unknown, names: string[]) {
  const data = Array.isArray((insights as { data?: unknown[] })?.data) ? (insights as { data: unknown[] }).data : [];
  for (const item of data) {
    const record = item as Record<string, unknown>;
    if (!names.includes(String(record.name))) continue;
    const values = Array.isArray(record.values) ? record.values : [];
    const last = values[values.length - 1] as Record<string, unknown> | undefined;
    const value = asNumber(last?.value);
    if (value !== null) return value;
  }
  return null;
}

function isMetaPermissionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("(#10)") ||
    message.includes("(#100)") ||
    message.includes("OAuthException") ||
    message.includes("valid insights metric") ||
    message.includes("pages_read_user_content") ||
    message.includes("Page Public Content Access") ||
    message.includes("pages_read_engagement") ||
    message.includes("post_impressions")
  );
}

function isLinkedInPermissionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("ACCESS_DENIED") ||
    message.includes("r_member_social") ||
    message.includes("partnerApiPostsExternal.FINDER-author")
  );
}

async function fetchYouTube(account: AnalyticsAccount, fallback: PlatformAnalytics, matcher?: ScheduledPostMatcher | null): Promise<PlatformAnalytics> {
  let accessToken = account.access_token || (account.metadata?.access_token as string) || "";
  if ((!accessToken || (account.token_expires_at && new Date(account.token_expires_at) <= new Date())) && account.refresh_token) {
    try {
      const refreshed = await refreshYouTubeAccessToken(account.refresh_token);
      accessToken = refreshed.access_token;
    } catch {
      // Best effort refresh
    }
  }

  if (!accessToken) return { ...fallback, message: "YouTube needs a valid access token.", status: "error" };

  const headers = { Authorization: `Bearer ${accessToken}` };
  let channelJson: Record<string, unknown> | null = null;

  try {
    const channelUrl = new URL("https://www.googleapis.com/youtube/v3/channels");
    channelUrl.searchParams.set("part", "statistics,contentDetails");
    channelUrl.searchParams.set("id", account.account_id);
    channelJson = await readJson(channelUrl.toString(), { headers });

    if (!Array.isArray(channelJson.items) || channelJson.items.length === 0) {
      const mineUrl = new URL("https://www.googleapis.com/youtube/v3/channels");
      mineUrl.searchParams.set("part", "statistics,contentDetails");
      mineUrl.searchParams.set("mine", "true");
      channelJson = await readJson(mineUrl.toString(), { headers });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("quota") || msg.includes("403")) {
      return {
        ...fallback,
        fetched: true,
        status: fallback.recentPosts.length ? "partial" : "error",
        message: fallback.recentPosts.length
          ? `Loaded ${fallback.recentPosts.length} locally published YouTube videos. YouTube Data API quota limit reached.`
          : "YouTube Data API quota limit reached. Live stats will refresh once quota resets.",
      };
    }
    throw err;
  }

  const channel = ((channelJson.items as unknown[]) || [])[0] as Record<string, unknown> | undefined;
  const stats = (channel?.statistics || {}) as Record<string, unknown>;
  const followers = asNumber(stats.subscriberCount) ?? fallback.followers;
  const uploads = ((channel?.contentDetails as Record<string, unknown> | undefined)?.relatedPlaylists as Record<string, unknown> | undefined)?.uploads;

  let videoIds: string[] = [];
  if (typeof uploads === "string") {
    const playlistUrl = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
    playlistUrl.searchParams.set("part", "contentDetails");
    playlistUrl.searchParams.set("playlistId", uploads);
    playlistUrl.searchParams.set("maxResults", "25");
    const playlistJson = await readJson(playlistUrl.toString(), { headers });
    videoIds = ((playlistJson.items as unknown[]) || [])
      .map((item) => (((item as Record<string, unknown>).contentDetails as Record<string, unknown> | undefined)?.videoId))
      .filter((id): id is string => typeof id === "string");
  }

  if (!videoIds.length) {
    return {
      ...fallback,
      fetched: true,
      status: "partial",
      message: "Synced channel stats, no videos returned.",
      reach: asNumber(stats.viewCount),
      followers,
      engagementRate: null,
    };
  }

  const videosUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
  videosUrl.searchParams.set("part", "snippet,statistics");
  videosUrl.searchParams.set("id", videoIds.join(","));
  const videosJson = await readJson(videosUrl.toString(), { headers });
  const posts = ((videosJson.items as unknown[]) || []).map((item) => {
    const record = item as Record<string, unknown>;
    const snippet = (record.snippet || {}) as Record<string, unknown>;
    const videoStats = (record.statistics || {}) as Record<string, unknown>;
    const id = String(record.id || "");
    return {
      id,
      title: String(snippet.title || "YouTube video"),
      url: id ? `https://www.youtube.com/watch?v=${id}` : undefined,
      createdAt: typeof snippet.publishedAt === "string" ? snippet.publishedAt : undefined,
      platform: "youtube",
      likes: asNumber(videoStats.likeCount),
      comments: asNumber(videoStats.commentCount),
      shares: null,
      reach: asNumber(videoStats.viewCount),
    };
  });

  return summarizePosts("youtube", posts, fallback, followers, matcher);
}

async function fetchFacebook(account: AnalyticsAccount, fallback: PlatformAnalytics, matcher?: ScheduledPostMatcher | null): Promise<PlatformAnalytics> {
  const accessToken = account.access_token || (account.metadata?.access_token as string) || "";
  if (!accessToken) return { ...fallback, message: "Facebook needs a Page access token.", status: "error" };

  const pageUrl = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${account.account_id}`);
  pageUrl.searchParams.set("fields", "fan_count,followers_count");
  pageUrl.searchParams.set("access_token", accessToken);

  let followers = fallback.followers;
  try {
    const pageJson = await readJson(pageUrl.toString());
    followers = asNumber(pageJson.followers_count) ?? asNumber(pageJson.fan_count) ?? fallback.followers;
  } catch {
    followers = fallback.followers;
  }

  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${account.account_id}/published_posts`);
  url.searchParams.set("fields", "id,message,permalink_url,created_time,shares,comments.summary(true).limit(0),likes.summary(true).limit(0)");
  url.searchParams.set("limit", "25");
  url.searchParams.set("access_token", accessToken);

  let json: Record<string, unknown>;
  try {
    json = await readJson(url.toString());
  } catch (error) {
    if (isMetaPermissionError(error)) {
      return {
        ...fallback,
        fetched: true,
        status: "partial",
        message: fallback.recentPosts.length
          ? `Loaded ${fallback.recentPosts.length} locally published Facebook posts. Live post analytics require Meta approval for pages_read_user_content or Page Public Content Access.`
          : "Synced Page profile. Post analytics require Meta approval for pages_read_user_content or Page Public Content Access.",
        followers,
      };
    }
    throw error;
  }

  const posts = await Promise.all(((json.data as unknown[]) || []).map(async (item) => {
    const record = item as Record<string, unknown>;
    const postId = String(record.id || "");
    let reach: number | null = null;

    if (postId && accessToken) {
      try {
        const insightsUrl = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${postId}/insights`);
        insightsUrl.searchParams.set("metric", "post_impressions_unique");
        insightsUrl.searchParams.set("access_token", accessToken);
        const insightJson = await readJson(insightsUrl.toString());
        reach = graphInsightValue(insightJson, ["post_impressions_unique", "post_impressions"]);
      } catch {
        // Silent fallback
      }
    }

    return {
      id: postId,
      title: String(record.message || "Facebook post").slice(0, 90),
      url: typeof record.permalink_url === "string" ? record.permalink_url : undefined,
      createdAt: typeof record.created_time === "string" ? record.created_time : undefined,
      platform: "facebook",
      likes: getNestedNumber(record.likes, ["total_count"]),
      comments: getNestedNumber(record.comments, ["total_count"]),
      shares: getNestedNumber(record.shares, ["count"]),
      reach,
    };
  }));

  return summarizePosts("facebook", posts, fallback, followers, matcher);
}

async function fetchInstagram(account: AnalyticsAccount, fallback: PlatformAnalytics, matcher?: ScheduledPostMatcher | null): Promise<PlatformAnalytics> {
  const accessToken = account.access_token || (account.metadata?.access_token as string) || "";
  if (!accessToken) return { ...fallback, message: "Instagram needs a Page access token.", status: "error" };

  const isDirectLogin = account.metadata?.login_type === "instagram";
  const host = isDirectLogin ? "https://graph.instagram.com" : "https://graph.facebook.com";

  let followers: number | null = fallback.followers;
  try {
    const profileUrl = new URL(`${host}/${GRAPH_VERSION}/${account.account_id}`);
    profileUrl.searchParams.set("fields", "followers_count,follows_count,media_count,username");
    profileUrl.searchParams.set("access_token", accessToken);
    const profileJson = await readJson(profileUrl.toString());
    followers = asNumber(profileJson.followers_count) ?? fallback.followers;
  } catch {
    followers = fallback.followers;
  }

  const url = new URL(`${host}/${GRAPH_VERSION}/${account.account_id}/media`);
  url.searchParams.set("fields", "id,caption,permalink,timestamp,like_count,comments_count");
  url.searchParams.set("limit", "25");
  url.searchParams.set("access_token", accessToken);
  const json = await readJson(url.toString());
  const posts = await Promise.all(((json.data as unknown[]) || []).map(async (item) => {
    const record = item as Record<string, unknown>;
    let reach: number | null = null;
    let shares: number | null = null;

    try {
      const insightsUrl = new URL(`${host}/${GRAPH_VERSION}/${record.id}/insights`);
      insightsUrl.searchParams.set("metric", "reach,impressions,shares,total_interactions");
      insightsUrl.searchParams.set("access_token", accessToken);
      const insightJson = await readJson(insightsUrl.toString());
      reach = graphInsightValue(insightJson, ["reach", "impressions"]);
      shares = graphInsightValue(insightJson, ["shares"]);
    } catch {
      // Insights fallback
    }

    return {
      id: String(record.id || ""),
      title: String(record.caption || "Instagram media").slice(0, 90),
      url: typeof record.permalink === "string" ? record.permalink : undefined,
      createdAt: typeof record.timestamp === "string" ? record.timestamp : undefined,
      platform: "instagram",
      likes: asNumber(record.like_count),
      comments: asNumber(record.comments_count),
      shares,
      reach,
    };
  }));

  return summarizePosts("instagram", posts, fallback, followers, matcher);
}

async function fetchThreads(account: AnalyticsAccount, fallback: PlatformAnalytics, matcher?: ScheduledPostMatcher | null): Promise<PlatformAnalytics> {
  const accessToken = account.access_token || (account.metadata?.access_token as string) || "";
  if (!accessToken) return { ...fallback, message: "Threads needs an access token.", status: "error" };

  let followers: number | null = fallback.followers;
  try {
    const meUrl = new URL(`https://graph.threads.net/v1.0/me`);
    meUrl.searchParams.set("fields", "id,username,threads_profile_picture_url,followers_count");
    meUrl.searchParams.set("access_token", accessToken);
    const meJson = await readJson(meUrl.toString());
    followers = asNumber(meJson.followers_count) ?? fallback.followers;
  } catch {
    followers = fallback.followers;
  }

  const url = new URL(`https://graph.threads.net/v1.0/${account.account_id}/threads`);
  url.searchParams.set("fields", "id,text,timestamp,permalink,like_count,reply_count,repost_count,quote_count,views");
  url.searchParams.set("limit", "25");
  url.searchParams.set("access_token", accessToken);
  const json = await readJson(url.toString());
  const posts = ((json.data as unknown[]) || []).map((item) => {
    const record = item as Record<string, unknown>;
    return {
      id: String(record.id || ""),
      title: String(record.text || "Threads post").slice(0, 90),
      url: typeof record.permalink === "string" ? record.permalink : undefined,
      createdAt: typeof record.timestamp === "string" ? record.timestamp : undefined,
      platform: "threads",
      likes: asNumber(record.like_count),
      comments: asNumber(record.reply_count),
      shares: addNullable([asNumber(record.repost_count), asNumber(record.quote_count)]),
      reach: asNumber(record.views),
    };
  });

  return summarizePosts("threads", posts, fallback, followers, matcher);
}

async function fetchBluesky(account: AnalyticsAccount, fallback: PlatformAnalytics, matcher?: ScheduledPostMatcher | null): Promise<PlatformAnalytics> {
  const actor = String(account.metadata?.handle || account.account_name || account.account_id).replace(/^@/, "");
  const feedUrl = new URL("https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed");
  feedUrl.searchParams.set("actor", actor);
  feedUrl.searchParams.set("limit", "50");
  const feedJson = await readJson(feedUrl.toString());
  const profileUrl = new URL("https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile");
  profileUrl.searchParams.set("actor", actor);

  let followers: number | null = fallback.followers;
  try {
    const profileJson = await readJson(profileUrl.toString());
    followers = asNumber(profileJson.followersCount) ?? fallback.followers;
  } catch {
    followers = fallback.followers;
  }

  const posts = ((feedJson.feed as unknown[]) || []).map((item) => {
    const post = ((item as Record<string, unknown>).post || {}) as Record<string, unknown>;
    const record = (post.record || {}) as Record<string, unknown>;
    return {
      id: String(post.uri || post.cid || ""),
      title: String(record.text || "Bluesky post").slice(0, 90),
      url: typeof post.uri === "string" ? `https://bsky.app/profile/${actor}/post/${post.uri.split("/").pop()}` : undefined,
      createdAt: typeof record.createdAt === "string" ? record.createdAt : undefined,
      platform: "bluesky",
      likes: asNumber(post.likeCount),
      comments: asNumber(post.replyCount),
      shares: addNullable([asNumber(post.repostCount), asNumber(post.quoteCount)]),
      reach: null,
    };
  });

  return summarizePosts("bluesky", posts, fallback, followers, matcher);
}

async function fetchLinkedIn(account: AnalyticsAccount, fallback: PlatformAnalytics, matcher?: ScheduledPostMatcher | null): Promise<PlatformAnalytics> {
  const accessToken = account.access_token || (account.metadata?.access_token as string) || "";
  if (!accessToken) return { ...fallback, message: "LinkedIn needs an access token.", status: "error" };

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "LinkedIn-Version": LINKEDIN_VERSION,
    "X-Restli-Protocol-Version": "2.0.0",
  };

  let author = account.account_id;
  if (!author.startsWith("urn:li:")) {
    const isOrg = account.metadata?.is_organization || account.metadata?.organization_id;
    author = isOrg ? `urn:li:organization:${account.metadata?.organization_id || account.account_id}` : `urn:li:person:${account.account_id}`;
  }

  const url = new URL("https://api.linkedin.com/rest/posts");
  url.searchParams.set("q", "author");
  url.searchParams.set("author", author);
  url.searchParams.set("count", "20");
  const json = await readJson(url.toString(), { headers });
  const elements = ((json.elements as unknown[]) || []) as Record<string, unknown>[];

  const posts = await Promise.all(elements.map(async (post) => {
    const id = String(post.id || post.entity || "");
    let likes: number | null = null;
    let comments: number | null = null;
    try {
      const socialUrl = `https://api.linkedin.com/rest/socialActions/${encodeURIComponent(id)}`;
      const social = await readJson(socialUrl, { headers });
      likes = getNestedNumber(social, ["aggregatedTotalLikes", "totalLikes"]);
      comments = getNestedNumber(social, ["aggregatedTotalComments", "totalFirstLevelComments", "totalComments"]);
    } catch {
      // Social actions fallback
    }

    return {
      id,
      title: (getNestedString(post, ["text", "commentary"]) || "LinkedIn post").slice(0, 90),
      createdAt: undefined,
      platform: "linkedin",
      likes,
      comments,
      shares: null,
      reach: null,
    };
  }));

  return summarizePosts("linkedin", posts, fallback, fallback.followers, matcher);
}

async function fetchTwitter(account: AnalyticsAccount, fallback: PlatformAnalytics, matcher?: ScheduledPostMatcher | null): Promise<PlatformAnalytics> {
  const token = account.access_token || (account.metadata?.access_token as string) || "";
  let followers: number | null = fallback.followers;

  if (token) {
    try {
      const meUrl = new URL("https://api.twitter.com/2/users/me");
      meUrl.searchParams.set("user.fields", "public_metrics");
      const meJson = await readJson(meUrl.toString(), {
        headers: { Authorization: `Bearer ${token}` }
      });
      const metrics = (meJson.data as Record<string, unknown> | undefined)?.public_metrics as Record<string, unknown> | undefined;
      if (metrics) {
        followers = asNumber(metrics.followers_count) ?? fallback.followers;
      }
    } catch {
      // Twitter API fallback
    }
  }

  return summarizePosts("twitter", fallback.recentPosts, fallback, followers, matcher);
}

async function fetchPinterest(account: AnalyticsAccount, fallback: PlatformAnalytics, matcher?: ScheduledPostMatcher | null): Promise<PlatformAnalytics> {
  if (IS_PINTEREST_LOCKED) {
    return {
      ...fallback,
      status: "unavailable",
      fetched: true,
      message: "Pinterest integration is currently locked and coming soon.",
    };
  }

  const token = account.access_token || (account.metadata?.access_token as string) || "";
  if (!token) return summarizePosts("pinterest", fallback.recentPosts, fallback, fallback.followers, matcher);

  let followers: number | null = fallback.followers;
  let posts: AnalyticsPost[] = fallback.recentPosts;

  try {
    const userRes = await readJson("https://api.pinterest.com/v5/user_account", {
      headers: { Authorization: `Bearer ${token}` }
    });
    followers = asNumber(userRes.follower_count) ?? fallback.followers;
  } catch {
    // Pinterest account fallback
  }

  try {
    const pinsRes = await readJson("https://api.pinterest.com/v5/pins?bookmark=0&page_size=25", {
      headers: { Authorization: `Bearer ${token}` }
    });
    const items = Array.isArray(pinsRes.items) ? pinsRes.items : [];
    if (items.length > 0) {
      posts = items.map((item) => {
        const record = item as Record<string, unknown>;
        const pinMetrics = (record.pin_metrics || record.metrics || {}) as Record<string, unknown>;
        const id = String(record.id || "");
        return {
          id,
          title: String(record.title || record.description || "Pinterest Pin").slice(0, 90),
          url: id ? `https://www.pinterest.com/pin/${id}/` : undefined,
          createdAt: typeof record.created_at === "string" ? record.created_at : undefined,
          platform: "pinterest",
          likes: asNumber(pinMetrics.save_count) ?? asNumber(pinMetrics.saves),
          comments: asNumber(pinMetrics.comment_count) ?? asNumber(pinMetrics.comments),
          shares: null,
          reach: asNumber(pinMetrics.impression_count) ?? asNumber(pinMetrics.impressions),
        };
      });
    }
  } catch {
    // Pins fallback
  }

  return summarizePosts("pinterest", posts, fallback, followers, matcher);
}

async function fetchReddit(account: AnalyticsAccount, fallback: PlatformAnalytics, matcher?: ScheduledPostMatcher | null): Promise<PlatformAnalytics> {
  const token = account.access_token || (account.metadata?.access_token as string) || "";
  if (!token) return summarizePosts("reddit", fallback.recentPosts, fallback, fallback.followers, matcher);

  let karma: number | null = fallback.followers;
  let posts: AnalyticsPost[] = fallback.recentPosts;
  let username = account.account_name;

  try {
    const meJson = await readJson("https://oauth.reddit.com/api/v1/me", {
      headers: { Authorization: `Bearer ${token}`, "User-Agent": "Postelligence/1.0" }
    });
    karma = asNumber(meJson.total_karma) ?? asNumber(meJson.link_karma) ?? fallback.followers;
    if (typeof meJson.name === "string") username = meJson.name;
  } catch {
    // Reddit me fallback
  }

  if (username) {
    try {
      const submittedJson = await readJson(`https://oauth.reddit.com/user/${username}/submitted?limit=25`, {
        headers: { Authorization: `Bearer ${token}`, "User-Agent": "Postelligence/1.0" }
      });
      const children = Array.isArray((submittedJson.data as Record<string, unknown> | undefined)?.children)
        ? ((submittedJson.data as Record<string, unknown>).children as Record<string, unknown>[])
        : [];
      if (children.length > 0) {
        posts = children.map((c) => {
          const record = (c.data || {}) as Record<string, unknown>;
          const id = String(record.id || "");
          const permalink = typeof record.permalink === "string" ? `https://reddit.com${record.permalink}` : undefined;
          const createdUtc = typeof record.created_utc === "number" ? new Date(record.created_utc * 1000).toISOString() : undefined;
          return {
            id,
            title: String(record.title || "Reddit post").slice(0, 90),
            url: permalink,
            createdAt: createdUtc,
            platform: "reddit",
            likes: asNumber(record.score) ?? asNumber(record.ups),
            comments: asNumber(record.num_comments),
            shares: null,
            reach: asNumber(record.view_count),
          };
        });
      }
    } catch {
      // Submissions fallback
    }
  }

  return summarizePosts("reddit", posts, fallback, karma, matcher);
}

async function fetchTelegram(account: AnalyticsAccount, fallback: PlatformAnalytics, matcher?: ScheduledPostMatcher | null): Promise<PlatformAnalytics> {
  const botToken = account.access_token || (account.metadata?.bot_token as string) || (account.metadata?.access_token as string) || "";
  const chatId = account.account_id || (account.metadata?.chat_id as string) || "";
  let followers: number | null = fallback.followers;

  if (botToken && chatId) {
    try {
      const countRes = await readJson(`https://api.telegram.org/bot${botToken}/getChatMemberCount?chat_id=${encodeURIComponent(chatId)}`);
      if (countRes.ok && typeof countRes.result === "number") {
        followers = countRes.result;
      }
    } catch {
      // Telegram member count fallback
    }
  }

  return summarizePosts("telegram", fallback.recentPosts, fallback, followers, matcher);
}

async function fetchDiscord(account: AnalyticsAccount, fallback: PlatformAnalytics, matcher?: ScheduledPostMatcher | null): Promise<PlatformAnalytics> {
  const webhookUrl = (account.metadata?.webhook_url as string) || account.access_token || "";
  const followers: number | null = fallback.followers;

  if (webhookUrl && webhookUrl.startsWith("http")) {
    try {
      const info = await fetchDiscordWebhookInfo(webhookUrl);
      if (info.guildName) {
        fallback.accountName = `${info.guildName} #${info.channelName || "channel"}`;
      }
    } catch {
      // Discord info fallback
    }
  }

  return summarizePosts("discord", fallback.recentPosts, fallback, followers, matcher);
}

async function fetchPlatform(account: AnalyticsAccount, fallback: PlatformAnalytics, matcher?: ScheduledPostMatcher | null): Promise<PlatformAnalytics> {
  try {
    if (account.platform === "youtube") return await fetchYouTube(account, fallback, matcher);
    if (account.platform === "facebook") return await fetchFacebook(account, fallback, matcher);
    if (account.platform === "instagram") return await fetchInstagram(account, fallback, matcher);
    if (account.platform === "threads") return await fetchThreads(account, fallback, matcher);
    if (account.platform === "bluesky") return await fetchBluesky(account, fallback, matcher);
    if (account.platform === "linkedin") return await fetchLinkedIn(account, fallback, matcher);
    if (account.platform === "twitter") return await fetchTwitter(account, fallback, matcher);
    if (account.platform === "pinterest") return await fetchPinterest(account, fallback, matcher);
    if (account.platform === "reddit") return await fetchReddit(account, fallback, matcher);
    if (account.platform === "telegram") return await fetchTelegram(account, fallback, matcher);
    if (account.platform === "discord") return await fetchDiscord(account, fallback, matcher);
    return { ...fallback, message: `${fallback.name} analytics are not supported by this app yet.` };
  } catch (error) {
    if (account.platform === "linkedin" && isLinkedInPermissionError(error)) {
      return {
        ...fallback,
        fetched: true,
        status: fallback.recentPosts.length ? "partial" : "error",
        message: fallback.recentPosts.length
          ? `Loaded ${fallback.recentPosts.length} locally published LinkedIn posts. Live LinkedIn engagement requires r_member_social approval from LinkedIn.`
          : "LinkedIn blocks post analytics for this app. Request r_member_social approval in LinkedIn Developer Portal to sync live LinkedIn engagement.",
      };
    }

    return {
      ...fallback,
      status: fallback.likes !== null || fallback.comments !== null || fallback.reach !== null ? "partial" : "error",
      message: error instanceof Error ? error.message.slice(0, 180) : "Could not fetch analytics.",
    };
  }
}

export async function getAnalyticsDashboard(
  accounts: AnalyticsAccount[],
  scheduledPosts: ScheduledPost[],
  options: { restrictToScheduled?: boolean } = {}
): Promise<AnalyticsDashboardData> {
  const connected = accounts.filter((account) => account.status === "connected");
  const platforms = await Promise.all(
    connected.map((account) => {
      const matcher = options.restrictToScheduled ? buildScheduledMatcher(account.platform, scheduledPosts) : null;
      return fetchPlatform(account, basePlatform(account, scheduledPosts), matcher);
    })
  );

  const totalScheduled = scheduledPosts.length;
  const totalPublished = scheduledPosts.filter((post) => post.status === "published").length;
  const likes = addNullable(platforms.map((platform) => platform.likes));
  const comments = addNullable(platforms.map((platform) => platform.comments));
  const shares = addNullable(platforms.map((platform) => platform.shares));
  const reach = addNullable(platforms.map((platform) => platform.reach));
  const followers = addNullable(platforms.map((platform) => platform.followers));

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      postPerformance: totalScheduled > 0 ? (totalPublished / totalScheduled) * 100 : null,
      likes,
      comments,
      shares,
      reach,
      followers,
      engagementRate: engagementRate(likes, comments, shares, reach),
    },
    platforms,
  };
}
