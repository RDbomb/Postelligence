import type { Metadata } from "next";
import { requireUser } from "@/lib/supabase/require-user";
import type { SocialAccount } from "@/lib/integrations/social-accounts";
import { getLocalSocialAccountsWithTokens } from "@/lib/integrations/local-social-accounts";
import type { ScheduledPost, WorkspaceRole } from "@/types";
import { getAnalyticsDashboard, type AnalyticsAccount } from "@/lib/analytics/social-analytics";
import { readAnalyticsCache, writeAnalyticsCache } from "@/lib/analytics/analytics-cache";
import AnalyticsClient from "./AnalyticsClient";

export const metadata: Metadata = {
  title: "Analytics",
  description: "Reach, engagement and performance across your connected accounts."
};


export const dynamic = "force-dynamic";

function sanitizeMetadata(metadata: Record<string, unknown> | null) {
  if (!metadata) return metadata;
  const safeMetadata = { ...metadata };
  delete safeMetadata.access_token;
  delete safeMetadata.refresh_token;
  delete safeMetadata.appPassword;
  delete safeMetadata.app_password;
  return safeMetadata;
}

export default async function AnalyticsPage() {
  const { supabase, user } = await requireUser();

  const [
    { data: socialAccounts, error: socialAccountsError },
    { data: scheduledPosts },
    { data: membership },
  ] = await Promise.all([
    supabase
      .from("social_accounts")
      .select("id, platform, account_id, account_name, account_avatar_url, status, scopes, metadata, connected_at, updated_at, access_token, refresh_token, token_expires_at")
      .eq("user_id", user.id)
      .is("workspace_id", null),
    supabase
      .from("scheduled_posts")
      .select("*")
      .eq("user_id", user.id)
      .is("workspace_id", null)
      .order("scheduled_time", { ascending: false }),
    supabase.from("workspace_members").select("*, workspace:workspaces(id, name)").eq("user_id", user.id).single(),
  ]);

  const localSocialAccounts = socialAccountsError ? await getLocalSocialAccountsWithTokens(user.id) : [];
  const accounts = (socialAccountsError ? localSocialAccounts : socialAccounts || []) as AnalyticsAccount[];
  const posts = (scheduledPosts || []) as ScheduledPost[];

  const cached = await readAnalyticsCache(user.id);
  let analytics: Awaited<ReturnType<typeof getAnalyticsDashboard>>;
  let servedFromCache = false;
  let cacheStale = false;

  if (cached.hit) {
    analytics = cached.data;
    servedFromCache = true;
    cacheStale = cached.stale;
  } else {
    analytics = await getAnalyticsDashboard(accounts, posts, { restrictToScheduled: true });
    void writeAnalyticsCache(user.id, analytics);
  }

  const workspace: { id: string; name: string } | null = membership?.workspace ?? null;

  const publicAccounts = accounts.map((account) => {
    const { access_token: _, refresh_token: __, token_expires_at: ___, ...rest } = account;
    void _; void __; void ___;
    return {
      ...rest,
      metadata: sanitizeMetadata(account.metadata),
    };
  }) as SocialAccount[];

  return (
    <AnalyticsClient
      socialAccounts={publicAccounts}
      posts={posts}
      analytics={analytics}
      servedFromCache={servedFromCache}
      cacheStale={cacheStale}
      isInWorkspace={!!membership}
      workspaceId={workspace?.id}
      currentRole={membership?.role as WorkspaceRole | null}
    />
  );
}
