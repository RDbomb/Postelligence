import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { parseOptionalJsonBody } from "@/lib/validation/http";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLocalSocialAccountsWithTokens } from "@/lib/integrations/local-social-accounts";
import { getAnalyticsDashboard, type AnalyticsAccount } from "@/lib/analytics/social-analytics";
import {
  writeAnalyticsCache,
  markCacheRefreshing,
  invalidateAnalyticsCache,
} from "@/lib/analytics/analytics-cache";

export const dynamic = "force-dynamic";

/**
 * `parseOptionalJsonBody` rather than `parseJsonBody`: the handler previously did
 * `req.json().catch(() => ({}))`, so a bodyless POST is a legitimate request
 * meaning "background refresh" (`force` absent → falsy). Keeping that tolerance
 * matters because a 400 here would break the analytics page's stale-cache
 * refresh, which is fire-and-forget.
 */
const RefreshAnalyticsBody = z.object({
  force: z.boolean().optional(),
});

// POST /api/analytics/refresh
// Called by:
//   1. The analytics page when it detects a stale cache (background refresh)
//   2. The "Refresh" button click (force = true — invalidates cache first)
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = await parseOptionalJsonBody(request, RefreshAnalyticsBody);
  if (!parsed.success) return parsed.response;
  const force = parsed.data.force === true;

  // If forced (user clicked Refresh), invalidate cache first
  if (force) {
    await invalidateAnalyticsCache(user.id);
  } else {
    // Background refresh: check if another request is already refreshing
    const acquired = await markCacheRefreshing(user.id);
    if (!acquired) {
      // Already refreshing — bail out to prevent duplicate API calls
      return NextResponse.json({ status: "already_refreshing" });
    }
  }

  try {
    // Fetch accounts (same logic as the page server component)
    const { data: socialAccounts, error: socialAccountsError } = await supabase
      .from("social_accounts")
      .select(
        "id, platform, account_id, account_name, account_avatar_url, status, scopes, metadata, connected_at, updated_at, access_token, refresh_token, token_expires_at"
      )
      .eq("user_id", user.id)
      .is("workspace_id", null);

    const localSocialAccounts = socialAccountsError
      ? await getLocalSocialAccountsWithTokens(user.id)
      : [];

    const { data: scheduledPosts } = await supabase
      .from("scheduled_posts")
      .select("*")
      .eq("user_id", user.id)
      .is("workspace_id", null)
      .order("scheduled_time", { ascending: false });

    const accounts = (
      socialAccountsError ? localSocialAccounts : socialAccounts || []
    ) as AnalyticsAccount[];

    const posts = scheduledPosts || [];

    // Run all platform fetches
    const analytics = await getAnalyticsDashboard(accounts, posts, { restrictToScheduled: true });

    // Write to cache
    await writeAnalyticsCache(user.id, analytics);

    return NextResponse.json({ status: "refreshed", generatedAt: analytics.generatedAt });
  } catch (error) {
    // On error, clear the is_refreshing flag so the next request can try again
    try {
      const admin = createAdminClient();
      await admin
        .from("analytics_cache")
        .update({ is_refreshing: false })
        .eq("user_id", user.id)
        .is("workspace_id", null);
    } catch {
      // best effort
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Refresh failed" },
      { status: 500 }
    );
  }
}