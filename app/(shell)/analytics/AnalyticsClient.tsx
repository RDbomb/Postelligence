"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, TooltipContentProps,
} from "recharts";
import {
  Activity, BarChart3, CheckCircle2, Eye, Heart, MessageCircle,
  PieChart as PieIcon, RadioTower, Lock, RefreshCw, Share2, Trophy,
  TrendingUp, Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { SocialAccount } from "@/lib/integrations/social-accounts";
import type { AnalyticsDashboardData } from "@/lib/analytics/social-analytics";
import type { ScheduledPost, WorkspaceRole } from "@/types";
import { canViewTeamAnalytics, canViewReportsSection } from "@/lib/workspace/permissions";
import TeamAnalyticsDashboard from "@/components/workspace/TeamAnalyticsDashboard";
import ReportsPanel from "@/components/workspace/ReportsPanel";

// ── Animation ─────────────────────────────────────────────────────────────────
const fadeUp = { hidden: { opacity: 0, y: 18 }, visible: { opacity: 1, y: 0 } };

// ── Formatters ────────────────────────────────────────────────────────────────
function formatCompact(value: number | null | undefined) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatPercent(value: number | null) {
  if (value === null) return "—";
  return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}

function connectedOnly(accounts: SocialAccount[]) {
  return accounts.filter((a) => a.status === "connected");
}

// ── Custom Tooltip ────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: Partial<TooltipContentProps<number, string>>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-[#1f2528]/10 bg-white px-4 py-3 shadow-[0_8px_30px_rgba(31,37,40,0.12)]">
      {label && <p className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">{label}</p>}
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 text-sm">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="font-medium text-[#1f2528]">{entry.name}:</span>
          <span className="font-black text-[#1f2528]">{formatCompact(entry.value as number)}</span>
        </div>
      ))}
    </div>
  );
}

function PieTooltip({ active, payload }: Partial<TooltipContentProps<number, string>>) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  return (
    <div className="rounded-xl border border-[#1f2528]/10 bg-white px-4 py-3 shadow-[0_8px_30px_rgba(31,37,40,0.12)]">
      <div className="flex items-center gap-2 text-sm">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.payload?.color }} />
        <span className="font-bold text-[#1f2528]">{entry.name}</span>
        <span className="font-black text-[#1f2528]">{entry.value} posts</span>
      </div>
    </div>
  );
}

function LineChartTooltip({ active, payload, label }: Partial<TooltipContentProps<number, string>>) {
  if (!active || !payload?.length) return null;
  const meta = payload[0]?.payload as { title?: string; platform?: string; platformColor?: string; url?: string } | undefined;
  const lines = [
    { name: "Likes", color: "#f43f5e", dash: false }, { name: "Comments", color: "#f59e0b", dash: false },
    { name: "Shares", color: "#8b5cf6", dash: false }, { name: "Views", color: "#06b6d4", dash: true },
  ];
  return (
    <div className="rounded-xl border border-[#1f2528]/10 bg-white shadow-[0_8px_30px_rgba(31,37,40,0.14)]" style={{ minWidth: 220 }}>
      <div className="border-b border-[#1f2528]/8 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-black text-white" style={{ backgroundColor: meta?.platformColor ?? "#2f7867" }}>{label}</span>
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: meta?.platformColor ?? "#2f7867" }}>{meta?.platform ?? ""}</span>
        </div>
        <p className="mt-1.5 text-sm font-black leading-snug text-[#1f2528]">{meta?.title ?? ""}</p>
      </div>
      <div className="px-4 py-3 space-y-1.5">
        {payload.map((entry) => {
          const line = lines.find((l) => l.name === entry.name);
          return (
            <div key={entry.name} className="flex items-center justify-between gap-6 text-sm">
              <span className="flex items-center gap-2 text-slate-500">
                <span className="inline-block h-[2px] w-4 rounded" style={{ background: line?.dash ? `repeating-linear-gradient(90deg, ${line.color} 0 3px, transparent 3px 6px)` : (line?.color ?? entry.color) }} />
                {entry.name}
              </span>
              <span className="font-black text-[#1f2528]">{formatCompact(entry.value as number)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Permission issue detector ─────────────────────────────────────────────────
type PlatformRow = { platform: string; status: string; message: string; name: string };

const PERMISSION_ISSUES: Record<string, { title: string; explanation: string; action: string | null; docsUrl: string | null }> = {
  linkedin: { title: "LinkedIn analytics restricted", explanation: "LinkedIn has closed the r_member_social permission to new apps, so third-party tools cannot read member post engagement via API. Publishing and post counts work normally.", action: null, docsUrl: null },
  facebook: { title: "Meta analytics permissions required", explanation: "Reading post engagement on Facebook requires the pages_read_user_content permission, which needs Meta's business verification and app review.", action: "Start Meta app review", docsUrl: "https://developers.facebook.com/docs/permissions/reference/pages_read_user_content" },
  instagram: { title: "Meta analytics permissions required", explanation: "Instagram post insights require pages_read_user_content and a Business or Creator account. Personal accounts cannot access reach or engagement data via the API.", action: "Start Meta app review", docsUrl: "https://developers.facebook.com/docs/permissions/reference/pages_read_user_content" },
  twitter: { title: "X (Twitter) API access level", explanation: "Twitter API v2 metrics require authorized OAuth user permissions or elevated API access. Published post history is safely tracked.", action: "View X Developer Portal", docsUrl: "https://developer.x.com" },
  pinterest: { title: "Pinterest Trial Access", explanation: "Pinterest trial access tokens restrict direct profile metrics API calls. Published pin metrics are synced.", action: "View Pinterest Portal", docsUrl: "https://developers.pinterest.com" },
  reddit: { title: "Reddit API identity access", explanation: "Reddit OAuth requires identity scope approval to fetch live account karma and submitted post metrics.", action: null, docsUrl: null },
};

function PlatformMessage({ row }: { row: PlatformRow }) {
  const isPermissionIssue = row.message.includes("r_member_social") || row.message.includes("pages_read_user_content") || row.message.includes("Page Public Content Access") || row.message.includes("requires Meta approval") || row.message.includes("approval from LinkedIn");
  const permConfig = PERMISSION_ISSUES[row.platform];

  if (isPermissionIssue && permConfig && (row.status === "partial" || row.status === "error")) {
    return (
      <div className="mt-3 overflow-hidden rounded-xl border border-amber-200 bg-amber-50">
        <div className="flex items-start gap-3 px-4 py-3">
          <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-amber-100"><Lock className="h-3.5 w-3.5 text-amber-600" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black text-amber-800">{permConfig.title}</p>
            <p className="mt-1 text-xs leading-5 text-amber-700">{permConfig.explanation}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a href="/integrations" className="inline-flex items-center gap-1.5 rounded-lg bg-amber-100 px-3 py-1.5 text-[11px] font-bold text-amber-800 transition hover:bg-amber-200">Reconnect {row.name} →</a>
              {permConfig.action && permConfig.docsUrl && (<a href={permConfig.docsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-[11px] font-bold text-amber-700 transition hover:bg-amber-50">{permConfig.action} ↗</a>)}
            </div>
          </div>
        </div>
        {row.status === "partial" && (<div className="border-t border-amber-200 bg-amber-50/60 px-4 py-2"><p className="text-[10px] leading-4 text-amber-600">✓ Post count and publishing still works. Only live engagement metrics (likes, comments, reach) are unavailable until permissions are approved.</p></div>)}
      </div>
    );
  }
  if (row.status === "error") {
    return (
      <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
        <div className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-rose-100"><Lock className="h-3 w-3 text-rose-500" /></div>
        <div className="flex-1">
          <p className="text-xs font-bold text-rose-700">{row.message}</p>
          <a href="/integrations" className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 hover:underline">Go to Integrations →</a>
        </div>
      </div>
    );
  }
  return <p className="mt-3 rounded-lg bg-white px-3 py-2 text-xs leading-5 text-slate-500">{row.message}</p>;
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function AnalyticsClient({
  socialAccounts, posts, analytics, servedFromCache = false, cacheStale = false,
  isInWorkspace = false, workspaceId, currentRole,
}: {
  socialAccounts: SocialAccount[];
  posts: ScheduledPost[];
  analytics: AnalyticsDashboardData;
  servedFromCache?: boolean;
  cacheStale?: boolean;
  isInWorkspace?: boolean;
  workspaceId?: string;
  currentRole?: WorkspaceRole | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [lastRefreshed, setLastRefreshed] = useState<Date>(() => new Date(analytics.generatedAt));
  const [cacheStatus, setCacheStatus] = useState<"fresh" | "stale" | "refreshing" | "live">(servedFromCache ? (cacheStale ? "stale" : "fresh") : "live");
  const [refreshError, setRefreshError] = useState(false);

  // ── Active top-level tab ───────────────────────────────────────────────────
  const showTeamTab = isInWorkspace && workspaceId && currentRole && canViewTeamAnalytics(currentRole);
  const showReportsTab = isInWorkspace && workspaceId && currentRole && canViewReportsSection(currentRole);
  const [mainTab, setMainTab] = useState<"personal" | "team" | "reports">("personal");
  const searchParams = useSearchParams();

  // Sync the active tab with the "?tab=" URL param. Adjusting state during
  // render (rather than in an effect) avoids the extra pass that would render
  // the personal tab first and immediately swap it out.
  const tabParam = searchParams.get("tab");
  const [appliedTabParam, setAppliedTabParam] = useState<string | null>(null);
  if (tabParam !== appliedTabParam) {
    setAppliedTabParam(tabParam);
    if (tabParam === "reports" && showReportsTab) {
      setMainTab("reports");
    } else if (tabParam === "team" && showTeamTab) {
      setMainTab("team");
    }
  }

  const triggerBackgroundRefresh = useCallback(async () => {
    if (cacheStatus !== "stale") return;
    setCacheStatus("refreshing");
    try {
      await fetch("/api/analytics/refresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ force: false }) });
      startTransition(() => { router.refresh(); });
      setCacheStatus("live");
      setLastRefreshed(new Date());
    } catch { setCacheStatus("stale"); }
  }, [cacheStatus, router, startTransition]);

  useEffect(() => {
    if (cacheStale) {
      const timer = setTimeout(() => void triggerBackgroundRefresh(), 800);
      return () => clearTimeout(timer);
    }
  }, [cacheStale, triggerBackgroundRefresh]);

  type TrendRange = "7D" | "1M" | "3M" | "1Y" | "All";
  type PostsFilter = "all" | "bluesky" | "youtube" | "linkedin" | "instagram" | "facebook" | "threads" | "twitter" | "pinterest" | "reddit" | "telegram" | "discord";
  type PostsPeriod = "recent" | "1D" | "1W" | "1M" | "1Y";

  const [trendRange, setTrendRange] = useState<TrendRange>("All");
  const [postsFilter, setPostsFilter] = useState<PostsFilter>("all");
  const [postsPeriod, setPostsPeriod] = useState<PostsPeriod>("recent");

  async function handleRefresh() {
    setCacheStatus("refreshing");
    setRefreshError(false);
    try {
      const res = await fetch("/api/analytics/refresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ force: true }) });
      if (!res.ok) throw new Error("refresh failed");
      startTransition(() => { router.refresh(); setLastRefreshed(new Date()); });
      setCacheStatus("live");
    } catch {
      setCacheStatus("stale");
      setRefreshError(true);
      setTimeout(() => setRefreshError(false), 4000);
    }
  }

  const connectedAccounts = connectedOnly(socialAccounts);
  const rows = analytics.platforms;
  const publishedPosts = posts.filter((p) => p.status === "published").length;
  const totalPosts = posts.length;
  const syncedPlatforms = rows.filter((r) => r.fetched).length;
  const totalRecentPosts = rows.reduce((s, r) => s + r.recentPosts.length, 0);
  const [nowTimestamp] = useState(() => Date.now());
  const postPerformance = analytics.totals.postPerformance;
  const maxPosts = Math.max(1, ...rows.map((r) => r.posts));
  const allRecentPosts = rows.flatMap((r) => r.recentPosts);
  const bestPost = allRecentPosts.length > 0 ? allRecentPosts.reduce((best, post) => { const score = (post.likes ?? 0) + (post.comments ?? 0) + (post.shares ?? 0); const bestScore = (best.likes ?? 0) + (best.comments ?? 0) + (best.shares ?? 0); return score > bestScore ? post : best; }) : null;
  const bestPostHasData = bestPost !== null && (bestPost.likes !== null || bestPost.comments !== null || bestPost.shares !== null);
  const bestPostPlatformRow = bestPost ? rows.find((r) => r.platform === bestPost.platform) : null;

  const barData = rows.filter((r) => r.likes !== null || r.comments !== null || r.shares !== null || r.reach !== null).map((r) => ({ name: r.name, color: r.color, Likes: r.likes ?? 0, Comments: r.comments ?? 0, Shares: r.shares ?? 0, Views: r.reach ?? 0 }));
  const pieData = rows.filter((r) => r.posts > 0).map((r) => ({ name: r.name, value: r.posts, color: r.color }));
  const trendRangeDays: Record<string, number | null> = { "7D": 7, "1M": 30, "3M": 90, "1Y": 365, "All": null };
  const allRecentPostsSorted = [...allRecentPosts].sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
  const filteredLineData = (() => {
    const days = trendRangeDays[trendRange];
    const postsToDisplay = days
      ? allRecentPostsSorted.filter((post) => !post.createdAt || new Date(post.createdAt).getTime() >= (nowTimestamp - days * 86400000))
      : allRecentPostsSorted;
    return postsToDisplay.slice(-25).map((post, i) => {
      const platformRow = rows.find((r) => r.platform === post.platform);
      return {
        name: `#${i + 1}`,
        title: post.title.slice(0, 38) + (post.title.length > 38 ? "…" : ""),
        platform: platformRow?.name ?? post.platform,
        platformColor: platformRow?.color ?? "#2f7867",
        Likes: post.likes ?? 0,
        Comments: post.comments ?? 0,
        Shares: post.shares ?? 0,
        Views: post.reach ?? 0,
        url: post.url,
      };
    });
  })();
  const postsPeriodDays: Record<string, number | null> = { "recent": null, "1D": 1, "1W": 7, "1M": 30, "1Y": 365 };
  const periodFilteredPosts = (() => { const days = postsPeriodDays[postsPeriod]; if (!days) return allRecentPosts; const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days); return allRecentPosts.filter((p) => !p.createdAt || new Date(p.createdAt) >= cutoff); })();
  const filteredRecentPosts = (postsFilter === "all" ? periodFilteredPosts : periodFilteredPosts.filter((p) => p.platform === postsFilter)).sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()).slice(0, 20);
  const PLATFORM_COLORS: Record<string, string> = { instagram: "#E1306C", facebook: "#1877F2", linkedin: "#0A66C2", youtube: "#FF0000", twitter: "#111827", threads: "#111827", bluesky: "#1185FE", pinterest: "#E60023", reddit: "#FF4500", telegram: "#229ED9", discord: "#5865F2" };
  const postPlatformOptions = [{ value: "all" as PostsFilter, label: "All", color: undefined as string | undefined }, ...connectedAccounts.map((acc) => { const row = rows.find((r) => r.platform === acc.platform); return { value: acc.platform as PostsFilter, label: row?.name ?? acc.platform, color: row?.color ?? PLATFORM_COLORS[acc.platform] }; })];
  const metricCards = [
    { label: "Post Performance", value: formatPercent(postPerformance), sub: `${publishedPosts}/${totalPosts} posts published`, icon: BarChart3, tone: "bg-emerald-50 text-emerald-700", hasData: postPerformance !== null },
    { label: "Likes", value: formatCompact(analytics.totals.likes), sub: "Live reactions from synced posts", icon: Heart, tone: "bg-rose-50 text-rose-700", hasData: analytics.totals.likes !== null },
    { label: "Comments", value: formatCompact(analytics.totals.comments), sub: "Live replies and comments", icon: MessageCircle, tone: "bg-amber-50 text-amber-700", hasData: analytics.totals.comments !== null },
    { label: "Shares", value: formatCompact(analytics.totals.shares), sub: "Reposts, shares, quotes", icon: Share2, tone: "bg-violet-50 text-violet-700", hasData: analytics.totals.shares !== null },
    { label: "Views", value: formatCompact(analytics.totals.reach), sub: "Total views and impressions", icon: Eye, tone: "bg-cyan-50 text-cyan-700", hasData: analytics.totals.reach !== null },
    { label: "Engagement Rate", value: formatPercent(analytics.totals.engagementRate), sub: "Likes + comments + shares / views", icon: Activity, tone: "bg-teal-50 text-teal-700", hasData: analytics.totals.engagementRate !== null },
    { label: "Total Followers", value: formatCompact(analytics.totals.followers), sub: "Combined audience across platforms", icon: TrendingUp, tone: "bg-blue-50 text-blue-700", hasData: analytics.totals.followers !== null },
  ];
  const hasBarData = barData.length > 0;
  const hasPieData = pieData.length > 0;

  return (
    <>
      <motion.div initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: 0.06 } } }} className="space-y-5">

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <motion.section variants={fadeUp} className="rounded-xl border border-[#1f2528]/10 bg-white p-5 shadow-[0_14px_45px_rgba(31,37,40,0.08)] md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Badge variant="outline" className="mb-3 border-[#2f7867]/20 bg-[#eaf7ef] text-[#2f7867]"><RadioTower className="h-3.5 w-3.5" />Unified analytics</Badge>
              <h1 className="text-3xl font-black tracking-tight text-[#1f2528] md:text-4xl">Analytics Dashboard</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Live metrics from connected platforms, combined with Postelligence publishing history.</p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button onClick={() => void handleRefresh()} disabled={isPending || cacheStatus === "refreshing"} className="flex items-center gap-2 rounded-xl border border-[#1f2528]/10 bg-[#f9faf7] px-4 py-2 text-sm font-bold text-[#1f2528] transition hover:bg-[#eaf3ed] hover:text-[#2f7867] disabled:opacity-60 disabled:cursor-not-allowed">
                  <RefreshCw className={cn("h-3.5 w-3.5", (isPending || cacheStatus === "refreshing") && "animate-spin")} />
                  {cacheStatus === "refreshing" ? "Syncing…" : "Refresh"}
                </button>
                <div className="flex items-center gap-2">
                  {cacheStatus === "fresh" && <span className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Cached</span>}
                  {cacheStatus === "stale" && <span className="flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700"><span className="h-1.5 w-1.5 rounded-full bg-amber-400" />Stale — refreshing…</span>}
                  {cacheStatus === "refreshing" && <span className="flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-700"><RefreshCw className="h-2.5 w-2.5 animate-spin" />Refreshing…</span>}
                  {cacheStatus === "live" && <span className="flex items-center gap-1.5 rounded-full border border-[#2f7867]/20 bg-[#eaf3ed] px-2.5 py-1 text-[10px] font-bold text-[#2f7867]"><span className="h-1.5 w-1.5 rounded-full bg-[#2f7867]" />Live</span>}
                  <span className="text-xs text-slate-400">Last synced {(() => { const h = lastRefreshed.getHours(); const m = lastRefreshed.getMinutes().toString().padStart(2, "0"); return `${h % 12 || 12}:${m} ${h >= 12 ? "PM" : "AM"}`; })()}</span>
                </div>
              </div>
            </div>
            <div className="grid min-w-[320px] grid-cols-3 gap-3 rounded-xl border border-[#1f2528]/10 bg-[#f9faf7] p-3">
              <div><p className="text-xs font-bold uppercase tracking-widest text-slate-400">Connected</p><p className="mt-1 text-2xl font-black text-[#1f2528]">{connectedAccounts.length}</p></div>
              <div><p className="text-xs font-bold uppercase tracking-widest text-slate-400">Synced</p><p className="mt-1 text-2xl font-black text-[#1f2528]">{syncedPlatforms}</p></div>
              <div><p className="text-xs font-bold uppercase tracking-widest text-slate-400">Recent posts</p><p className="mt-1 text-2xl font-black text-[#1f2528]">{totalRecentPosts}</p></div>
            </div>
          </div>
        </motion.section>

        {/* ── Main Tabs (Personal / Team / Reports) ────────────────────────────── */}
        {(showTeamTab || showReportsTab) && (
          <motion.div variants={fadeUp} className="flex gap-1 rounded-xl bg-gray-100 p-1">
            {([
              { key: "personal" as const, label: "My Analytics", show: true },
              { key: "team" as const, label: "Team Performance", show: showTeamTab },
              { key: "reports" as const, label: "Reports", show: showReportsTab },
            ]).filter((t) => t.show).map(({ key, label }) => (
              <button key={key} onClick={() => setMainTab(key)}
                className={cn("flex-1 py-2.5 text-sm font-bold rounded-lg transition-all", mainTab === key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700")}>
                {label}
              </button>
            ))}
          </motion.div>
        )}

        {/* ── Team Analytics Dashboard ─────────────────────────────────────────── */}
        {showTeamTab && mainTab === "team" && workspaceId && (
          <motion.div variants={fadeUp}>
            <TeamAnalyticsDashboard workspaceId={workspaceId} currentRole={currentRole!} />
          </motion.div>
        )}

        {/* ── Reports section ──────────────────────────────────────────────────── */}
        {showReportsTab && mainTab === "reports" && workspaceId && (
          <motion.div variants={fadeUp}>
            <ReportsPanel workspaceId={workspaceId} currentRole={currentRole!} />
          </motion.div>
        )}

        {/* ── Personal Analytics (existing, unchanged) ────────────────────────── */}
        {mainTab === "personal" && (
          <>
            {/* Metric Cards */}
            <motion.section variants={fadeUp} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {metricCards.map((metric) => { const Icon = metric.icon; return (
                <div key={metric.label} className="rounded-xl border border-[#1f2528]/10 bg-white p-4 shadow-[0_10px_32px_rgba(31,37,40,0.06)]">
                  <div className="flex items-start justify-between gap-3">
                    <div className={cn("grid h-10 w-10 place-items-center rounded-xl", metric.tone)}><Icon className="h-5 w-5" /></div>
                    {metric.hasData ? <CheckCircle2 className="h-4 w-4 text-[#2f7867]" /> : <PieIcon className="h-4 w-4 text-slate-300" />}
                  </div>
                  <p className="mt-4 text-xs font-bold uppercase tracking-widest text-slate-400">{metric.label}</p>
                  <p className="mt-1 text-2xl font-black tracking-tight text-[#1f2528]">{metric.value}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{metric.sub}</p>
                </div>
              ); })}
            </motion.section>

            {/* Bar + Pie */}
            <div className="grid gap-5 xl:grid-cols-[1.4fr_0.6fr]">
              <motion.section variants={fadeUp} className="rounded-xl border border-[#1f2528]/10 bg-white p-5 shadow-[0_14px_45px_rgba(31,37,40,0.08)]">
                <div className="mb-5"><p className="text-xs font-bold uppercase tracking-widest text-slate-400">Engagement breakdown</p><h2 className="mt-1 text-xl font-black text-[#1f2528]">Likes · Comments · Shares by platform</h2></div>
                {hasBarData ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={barData} barCategoryGap="28%" barGap={3}>
                      <CartesianGrid vertical={false} stroke="rgba(31,37,40,0.06)" />
                      <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#65727a", fontWeight: 600 }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={(v) => formatCompact(v)} tick={{ fontSize: 11, fill: "#65727a" }} axisLine={false} tickLine={false} width={44} />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(47,120,103,0.05)", radius: 6 }} />
                      <Bar dataKey="Likes" fill="#f43f5e" radius={[4, 4, 0, 0]} maxBarSize={32} />
                      <Bar dataKey="Comments" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={32} />
                      <Bar dataKey="Shares" fill="#8b5cf6" radius={[4, 4, 0, 0]} maxBarSize={32} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <EmptyChart message="No engagement data yet. Publish posts to connected platforms to start seeing numbers here." />}
                <div className="mt-4 flex flex-wrap gap-4">
                  {[{ label: "Likes", color: "#f43f5e" }, { label: "Comments", color: "#f59e0b" }, { label: "Shares", color: "#8b5cf6" }].map((item) => (
                    <span key={item.label} className="flex items-center gap-1.5 text-xs font-medium text-slate-500"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: item.color }} />{item.label}</span>
                  ))}
                </div>
              </motion.section>

              <motion.section variants={fadeUp} className="rounded-xl border border-[#1f2528]/10 bg-white p-5 shadow-[0_14px_45px_rgba(31,37,40,0.08)]">
                <div className="mb-4"><p className="text-xs font-bold uppercase tracking-widest text-slate-400">Content split</p><h2 className="mt-1 text-xl font-black text-[#1f2528]">Posts by platform</h2></div>
                {hasPieData ? (
                  <>
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={52} outerRadius={84} paddingAngle={3} dataKey="value">
                          {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} stroke="white" strokeWidth={2} />)}
                        </Pie>
                        <Tooltip content={<PieTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="mt-3 space-y-2">
                      {pieData.map((entry) => (
                        <div key={entry.name} className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-2 font-medium text-slate-600"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />{entry.name}</span>
                          <span className="font-black text-[#1f2528]">{entry.value}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : <EmptyChart message="Schedule and publish posts to see how your content is distributed across platforms." height={200} />}
              </motion.section>
            </div>

            {/* Line chart */}
            <motion.section variants={fadeUp} className="rounded-xl border border-[#1f2528]/10 bg-white p-5 shadow-[0_14px_45px_rgba(31,37,40,0.08)]">
              <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Post-by-post trend</p>
                  <h2 className="mt-1 text-xl font-black text-[#1f2528]">Engagement across recent posts</h2>
                  <p className="mt-1 text-sm text-slate-500">Each point is one recent post — oldest left, newest right.</p>
                </div>
                <div className="flex gap-1 rounded-xl border border-[#1f2528]/10 bg-white/70 p-1 shadow-sm backdrop-blur-sm">
                  {(["7D", "1M", "3M", "1Y", "All"] as const).map((range) => (
                    <button key={range} onClick={() => setTrendRange(range)} className={cn("relative min-w-[36px] rounded-lg px-3 py-1.5 text-xs font-bold capitalize transition-colors duration-200", trendRange === range ? "text-[#1a4a3a]" : "text-slate-500 hover:text-[#1f2528]")}>
                      {trendRange === range && <motion.span layoutId="trend-range-pill" transition={{ type: "spring", stiffness: 380, damping: 30 }} style={{ position: "absolute", inset: 0, borderRadius: "8px", background: "linear-gradient(135deg, rgba(47,120,103,0.20) 0%, rgba(100,190,160,0.25) 50%, rgba(47,120,103,0.16) 100%)", border: "1px solid rgba(47,120,103,0.30)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }} />}
                      <span className="relative z-10">{range}</span>
                    </button>
                  ))}
                </div>
              </div>
              {filteredLineData.length >= 2 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={filteredLineData}>
                    <CartesianGrid vertical={false} stroke="rgba(31,37,40,0.06)" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#65727a", fontWeight: 600 }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(v) => formatCompact(v)} tick={{ fontSize: 11, fill: "#65727a" }} axisLine={false} tickLine={false} width={44} />
                    <Tooltip content={<LineChartTooltip />} />
                    <Line type="monotone" dataKey="Likes" stroke="#f43f5e" strokeWidth={2.5} dot={{ r: 4, fill: "#f43f5e", stroke: "white", strokeWidth: 2 }} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="Comments" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 4, fill: "#f59e0b", stroke: "white", strokeWidth: 2 }} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="Shares" stroke="#8b5cf6" strokeWidth={2.5} dot={{ r: 4, fill: "#8b5cf6", stroke: "white", strokeWidth: 2 }} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="Views" stroke="#06b6d4" strokeWidth={2} strokeDasharray="5 3" dot={false} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : <EmptyChart message={trendRange === "All" ? "Need at least 2 recent posts with live data to draw the trend line." : `No posts found in the last ${trendRange} window. Try a wider range.`} />}
            </motion.section>

            {/* Platform table + recent posts */}
            <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
              <motion.section variants={fadeUp} className="rounded-xl border border-[#1f2528]/10 bg-white p-5 shadow-[0_14px_45px_rgba(31,37,40,0.08)]">
                <div className="mb-5 flex items-center justify-between gap-3">
                  <div><p className="text-xs font-bold uppercase tracking-widest text-slate-400">Post Performance</p><h2 className="mt-1 text-xl font-black text-[#1f2528]">Publishing by platform</h2></div>
                  <Badge>{publishedPosts} published</Badge>
                </div>
                <div className="space-y-4">
                  {rows.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[#1f2528]/14 bg-[#f9faf7] p-6 text-sm text-slate-500">Connect a platform or schedule posts to start building unified analytics.</div>
                  ) : rows.map((row) => (
                    <div key={row.platform} className="rounded-xl border border-[#1f2528]/10 bg-[#fbfcf8] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.color }} /><p className="font-black text-[#1f2528]">{row.name}</p></div>
                          <p className="mt-1 text-xs text-slate-500">{row.accountName}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline" className={cn(row.status === "synced" && "border-emerald-200 bg-emerald-50 text-emerald-700", row.status === "partial" && "border-amber-200 bg-amber-50 text-amber-700", row.status === "error" && "border-rose-200 bg-rose-50 text-rose-700", row.status === "unavailable" && "border-slate-200 bg-slate-50 text-slate-500")}>{row.status}</Badge>
                          <Badge variant="outline" className={row.tone}>{row.published} published</Badge>
                          <Badge>{row.queued} queued</Badge>
                          {row.failed > 0 && <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">{row.failed} failed</Badge>}
                        </div>
                      </div>
                      <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-[#f0f1eb]">
                        <motion.div initial={{ width: 0 }} animate={{ width: `${Math.max(4, (row.posts / maxPosts) * 100)}%` }} transition={{ duration: 0.8, ease: "easeOut" }} className="h-full rounded-full" style={{ backgroundColor: row.color }} />
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-500">
                        <span>{row.posts} total posts</span>
                        <span>{formatCompact(row.reach)} views</span>
                        <span>{formatPercent(row.engagementRate)} engagement</span>
                      </div>
                      <PlatformMessage row={row} />
                    </div>
                  ))}
                </div>
              </motion.section>

              <div className="flex flex-col gap-5">
                <motion.section variants={fadeUp} className="rounded-xl border border-[#1f2528]/10 bg-white p-5 shadow-[0_14px_45px_rgba(31,37,40,0.08)]">
                  <div className="mb-4"><p className="text-xs font-bold uppercase tracking-widest text-slate-400">Audience</p><h2 className="mt-1 text-xl font-black text-[#1f2528]">Followers by platform</h2></div>
                  {rows.some((r) => r.followers !== null) ? (
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={rows.filter((r) => r.followers !== null).map((r) => ({ name: r.name, Followers: r.followers ?? 0, color: r.color }))} barCategoryGap="30%">
                        <CartesianGrid vertical={false} stroke="rgba(31,37,40,0.06)" />
                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#65727a", fontWeight: 600 }} axisLine={false} tickLine={false} />
                        <YAxis tickFormatter={(v) => formatCompact(v)} tick={{ fontSize: 10, fill: "#65727a" }} axisLine={false} tickLine={false} width={36} />
                        <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(47,120,103,0.05)", radius: 4 }} />
                        <Bar dataKey="Followers" radius={[4, 4, 0, 0]} maxBarSize={28}>
                          {rows.filter((r) => r.followers !== null).map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="space-y-3">
                      {rows.map((row) => (
                        <div key={row.platform} className="grid grid-cols-[1fr_auto] gap-3 rounded-xl border border-[#1f2528]/10 bg-[#fbfcf8] px-4 py-3">
                          <div className="min-w-0"><p className="truncate font-bold text-[#1f2528]">{row.name}</p><p className="truncate text-xs text-slate-500">{row.accountName}</p></div>
                          <div className="text-right"><p className="text-sm font-black text-[#1f2528]">{formatCompact(row.followers)}</p><p className="text-xs text-slate-500">followers</p></div>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.section>

                <motion.section variants={fadeUp} className="rounded-xl border border-[#1f2528]/10 bg-white p-5 shadow-[0_14px_45px_rgba(31,37,40,0.08)]">
                  <div className="mb-3">
                    <div className="flex items-center justify-between gap-3"><p className="text-sm font-black text-[#1f2528]">Recent post metrics</p><Badge>{filteredRecentPosts.length} shown</Badge></div>
                    <div className="mt-2.5 flex gap-1 rounded-xl border border-[#1f2528]/10 bg-white/70 p-1 shadow-sm backdrop-blur-sm">
                      {([{ value: "recent", label: "Recent" }, { value: "1D", label: "1D" }, { value: "1W", label: "1W" }, { value: "1M", label: "1M" }, { value: "1Y", label: "1Y" }] as { value: PostsPeriod; label: string }[]).map((opt) => (
                        <button key={opt.value} onClick={() => setPostsPeriod(opt.value)} className={cn("relative min-w-[42px] flex-1 rounded-lg py-1.5 text-[11px] font-bold capitalize transition-colors duration-200", postsPeriod === opt.value ? "text-[#1a4a3a]" : "text-slate-500 hover:text-[#1f2528]")}>
                          {postsPeriod === opt.value && <motion.span layoutId="posts-period-pill" transition={{ type: "spring", stiffness: 380, damping: 30 }} style={{ position: "absolute", inset: 0, borderRadius: "8px", background: "linear-gradient(135deg, rgba(47,120,103,0.20) 0%, rgba(100,190,160,0.25) 50%, rgba(47,120,103,0.16) 100%)", border: "1px solid rgba(47,120,103,0.30)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }} />}
                          <span className="relative z-10">{opt.label}</span>
                        </button>
                      ))}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {postPlatformOptions.map((opt) => (
                        <button key={opt.value} onClick={() => setPostsFilter(opt.value)} className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold transition", postsFilter === opt.value ? opt.color ? "border-transparent text-white" : "border-[#2f7867]/30 bg-[#eaf3ed] text-[#1a4a3a]" : "border-[#1f2528]/12 bg-[#f9faf7] text-slate-600 hover:border-[#1f2528]/30 hover:text-[#1f2528]")} style={postsFilter === opt.value && opt.color ? { backgroundColor: opt.color, borderColor: opt.color } : {}}>
                          {opt.color && <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: postsFilter === opt.value ? "rgba(255,255,255,0.85)" : opt.color }} />}
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {bestPostHasData && bestPost && (
                    <a href={bestPost.url || "#"} target={bestPost.url ? "_blank" : undefined} rel="noreferrer" className="mb-3 flex items-start gap-3 rounded-xl border p-4 transition hover:opacity-90" style={{ borderColor: bestPostPlatformRow?.color ? `${bestPostPlatformRow.color}30` : "rgba(31,37,40,0.1)", backgroundColor: bestPostPlatformRow?.color ? `${bestPostPlatformRow.color}08` : "#f9faf7" }}>
                      <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ backgroundColor: bestPostPlatformRow?.color ? `${bestPostPlatformRow.color}18` : "#eaf3ed" }}><Trophy className="h-4 w-4" style={{ color: bestPostPlatformRow?.color ?? "#2f7867" }} /></div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: bestPostPlatformRow?.color ?? "#2f7867" }}>Top post · {bestPostPlatformRow?.name ?? bestPost.platform}</p>
                        <p className="mt-0.5 truncate text-sm font-black text-[#1f2528]">{bestPost.title}</p>
                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                          {bestPost.likes !== null && <span><strong className="text-[#1f2528]">{formatCompact(bestPost.likes)}</strong> likes</span>}
                          {bestPost.comments !== null && <span><strong className="text-[#1f2528]">{formatCompact(bestPost.comments)}</strong> comments</span>}
                          {bestPost.shares !== null && <span><strong className="text-[#1f2528]">{formatCompact(bestPost.shares)}</strong> shares</span>}
                          {bestPost.reach !== null && <span><strong className="text-[#1f2528]">{formatCompact(bestPost.reach)}</strong> views</span>}
                        </div>
                      </div>
                    </a>
                  )}

                  <div className="overflow-hidden rounded-xl border border-[#1f2528]/10">
                    {filteredRecentPosts.length === 0 ? (
                      <div className="bg-[#f9faf7] p-4 text-xs leading-5 text-slate-500">{(() => { const platformName = postPlatformOptions.find((o) => o.value === postsFilter)?.label ?? postsFilter; const platformHasAnyPosts = allRecentPosts.some((p) => p.platform === postsFilter); if (postsFilter !== "all" && !platformHasAnyPosts) return `No posts fetched from ${platformName} yet.`; if (postsFilter !== "all") return `No ${platformName} posts in this time period.`; if (postsPeriod !== "recent") return `No posts found in the last ${postsPeriod}.`; return "No recent platform posts yet."; })()}</div>
                    ) : (
                      <div className="divide-y divide-[#1f2528]/8 bg-white">
                        {filteredRecentPosts.map((post) => (
                          <a key={`${post.platform}-${post.id}`} href={post.url || "#"} target={post.url ? "_blank" : undefined} rel="noreferrer" className="grid gap-3 p-3 transition hover:bg-[#f9faf7] sm:grid-cols-[1fr_auto]">
                            <div className="min-w-0"><p className="truncate text-sm font-bold text-[#1f2528]">{post.title}</p><p className="mt-1 text-xs capitalize text-slate-500">{post.platform}</p></div>
                            <div className="grid grid-cols-4 gap-3 text-right text-xs">
                              <span><strong className="block text-[#1f2528]">{formatCompact(post.likes)}</strong>likes</span>
                              <span><strong className="block text-[#1f2528]">{formatCompact(post.comments)}</strong>comments</span>
                              <span><strong className="block text-[#1f2528]">{formatCompact(post.shares)}</strong>shares</span>
                              <span><strong className="block text-[#1f2528]">{formatCompact(post.reach)}</strong>views</span>
                            </div>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="mt-4 rounded-xl border border-[#1f2528]/10 bg-[#f9faf7] p-4">
                    <div className="flex items-start gap-3"><Zap className="mt-0.5 h-4 w-4 text-[#2f7867]" /><p className="text-xs leading-5 text-slate-500">Analytics are fetched live on page load with stored account tokens. Some providers only expose reach or engagement after business verification or specific read/insights permissions.</p></div>
                  </div>
                </motion.section>
              </div>
            </div>
          </>
        )}
      </motion.div>

      {refreshError && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-white px-5 py-3.5 shadow-[0_8px_32px_rgba(31,37,40,0.18)]">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-rose-100"><RefreshCw className="h-3.5 w-3.5 text-rose-500" /></span>
            <p className="text-sm font-bold text-[#1f2528]">Couldn&apos;t refresh analytics. <span className="font-medium text-slate-500">Please try again.</span></p>
          </div>
        </div>
      )}
    </>
  );
}

function EmptyChart({ message, height = 260 }: { message: string; height?: number }) {
  return (
    <div className="flex items-center justify-center rounded-xl border border-dashed border-[#1f2528]/12 bg-[#f9faf7]" style={{ height }}>
      <p className="max-w-xs text-center text-sm leading-6 text-slate-400">{message}</p>
    </div>
  );
}
