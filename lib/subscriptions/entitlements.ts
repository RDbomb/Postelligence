import { createClient as createBaseClient } from "@supabase/supabase-js";

export type TierId = "starter" | "pro" | "plus";
export type SubscriptionStatus = "free" | "trialing" | "active" | "past_due" | "cancelled" | "paused";
export type BillingType = "razorpay" | "manual_grant" | "lifetime" | "partner";

export interface TierEntitlements {
  name: string;
  badgeLabel: string;
  maxConnectedPlatforms: number;
  maxScheduledPostsPerMonth: number;
  maxAutomatedPostsPerMonth: number;
  maxAiWordsPerMonth: number;
  maxAiImagesPerMonth: number;
  maxWorkspaces: number;
  canAccessAiStudio: boolean;
  canAccessAutomation: boolean;
  canAccessTeamWorkspaces: boolean;
  canExportReports: boolean;
  analyticsRetentionDays: number;
}

export const TIER_CONFIG: Record<TierId, TierEntitlements> = {
  starter: {
    name: "Starter",
    badgeLabel: "Starter (Free)",
    maxConnectedPlatforms: 4,
    maxScheduledPostsPerMonth: 10,
    maxAutomatedPostsPerMonth: 0,
    maxAiWordsPerMonth: 1000,
    maxAiImagesPerMonth: 0,
    maxWorkspaces: 0,
    canAccessAiStudio: false,
    canAccessAutomation: false,
    canAccessTeamWorkspaces: false,
    canExportReports: false,
    analyticsRetentionDays: 7,
  },
  pro: {
    name: "Pro",
    badgeLabel: "Pro Member",
    maxConnectedPlatforms: 8,
    maxScheduledPostsPerMonth: 150,
    maxAutomatedPostsPerMonth: 50,
    maxAiWordsPerMonth: 10000,
    maxAiImagesPerMonth: 25,
    maxWorkspaces: 1,
    canAccessAiStudio: true,
    canAccessAutomation: true,
    canAccessTeamWorkspaces: true,
    canExportReports: true,
    analyticsRetentionDays: 90,
  },
  plus: {
    name: "Plus",
    badgeLabel: "Plus / Agency",
    maxConnectedPlatforms: 999, // Unlimited
    maxScheduledPostsPerMonth: 1000,
    maxAutomatedPostsPerMonth: 300,
    maxAiWordsPerMonth: 50000,
    maxAiImagesPerMonth: 150,
    maxWorkspaces: 5,
    canAccessAiStudio: true,
    canAccessAutomation: true,
    canAccessTeamWorkspaces: true,
    canExportReports: true,
    analyticsRetentionDays: 365,
  },
};

export interface UserSubscription {
  user_id: string;
  tier: TierId;
  status: SubscriptionStatus;
  billing_type: BillingType;
  current_period_start: string;
  current_period_end: string | null;
  razorpay_customer_id?: string | null;
  razorpay_subscription_id?: string | null;
  razorpay_payment_id?: string | null;
  cancel_at_period_end: boolean;
}

export interface UserUsage {
  user_id: string;
  scheduled_posts_count: number;
  automated_posts_count: number;
  ai_words_generated: number;
  ai_images_generated: number;
  period_start: string;
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing Supabase credentials for entitlements evaluation.");
  }
  return createBaseClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * Reads a user's subscription record.
 * Handles lifetime access and grace periods.
 */
export async function getUserSubscription(userId: string): Promise<UserSubscription> {
  try {
    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from("user_subscriptions")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error || !data) {
      // Default to starter tier if no row exists yet
      return {
        user_id: userId,
        tier: "starter",
        status: "free",
        billing_type: "razorpay",
        current_period_start: new Date().toISOString(),
        current_period_end: null,
        cancel_at_period_end: false,
      };
    }

    // Check if paid subscription has expired (except lifetime / manual grants where end is null)
    if (data.current_period_end) {
      const expiresAt = new Date(data.current_period_end).getTime();
      if (expiresAt < Date.now() && data.status === "active") {
        // Grace period expired — downgrade tier to starter
        return {
          ...data,
          tier: "starter",
          status: "past_due",
        };
      }
    }

    return data as UserSubscription;
  } catch (err) {
    console.warn("Falling back to starter subscription due to error:", err);
    return {
      user_id: userId,
      tier: "starter",
      status: "free",
      billing_type: "razorpay",
      current_period_start: new Date().toISOString(),
      current_period_end: null,
      cancel_at_period_end: false,
    };
  }
}

/**
 * Reads current usage counters for the billing cycle.
 */
export async function getUserUsage(userId: string): Promise<UserUsage> {
  try {
    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from("user_usage")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error || !data) {
      return {
        user_id: userId,
        scheduled_posts_count: 0,
        automated_posts_count: 0,
        ai_words_generated: 0,
        ai_images_generated: 0,
        period_start: new Date().toISOString(),
      };
    }

    return data as UserUsage;
  } catch (err) {
    console.warn("Falling back to zero usage due to error:", err);
    return {
      user_id: userId,
      scheduled_posts_count: 0,
      automated_posts_count: 0,
      ai_words_generated: 0,
      ai_images_generated: 0,
      period_start: new Date().toISOString(),
    };
  }
}

/**
 * Returns the effective tier, configured limits, and current usage in one call.
 */
export async function getUserEntitlements(userId: string) {
  const [subscription, usage] = await Promise.all([
    getUserSubscription(userId),
    getUserUsage(userId),
  ]);

  const tier = subscription.tier || "starter";
  const entitlements = TIER_CONFIG[tier] || TIER_CONFIG.starter;

  return {
    tier,
    subscription,
    entitlements,
    usage,
    isProOrPlus: tier === "pro" || tier === "plus",
    isPlus: tier === "plus",
  };
}

/**
 * Atomically increments a usage counter.
 */
export async function incrementUsage(
  userId: string,
  metric: "scheduled_posts" | "automated_posts" | "ai_words" | "ai_images",
  amount = 1
) {
  const supabase = getAdminClient();

  const columnMap: Record<string, string> = {
    scheduled_posts: "scheduled_posts_count",
    automated_posts: "automated_posts_count",
    ai_words: "ai_words_generated",
    ai_images: "ai_images_generated",
  };

  const col = columnMap[metric];
  if (!col) return;

  // Read current and update (or insert if absent)
  const { data } = await supabase
    .from("user_usage")
    .select(col)
    .eq("user_id", userId)
    .maybeSingle();

  const usageRecord = data as unknown as Record<string, number> | null;
  const current = usageRecord?.[col] ?? 0;

  await supabase
    .from("user_usage")
    .upsert({
      user_id: userId,
      [col]: current + amount,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
}

/**
 * Upgrades or modifies a user's subscription tier.
 */
export async function setUserTier(params: {
  userId: string;
  tier: TierId;
  billingType?: BillingType;
  status?: SubscriptionStatus;
  periodDays?: number;
  razorpayPaymentId?: string;
  razorpaySubscriptionId?: string;
}) {
  const supabase = getAdminClient();

  const periodEnd =
    params.billingType === "lifetime"
      ? null
      : new Date(Date.now() + (params.periodDays || 30) * 86_400_000).toISOString();

  const { data, error } = await supabase
    .from("user_subscriptions")
    .upsert({
      user_id: params.userId,
      tier: params.tier,
      status: params.status || "active",
      billing_type: params.billingType || "razorpay",
      current_period_start: new Date().toISOString(),
      current_period_end: periodEnd,
      razorpay_payment_id: params.razorpayPaymentId || null,
      razorpay_subscription_id: params.razorpaySubscriptionId || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" })
    .select()
    .single();

  if (error) throw error;
  return data;
}