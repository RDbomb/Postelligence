import type { Metadata } from "next";
import { requireUser } from "@/lib/supabase/require-user";
import AutomationClient, { type AutomationLog } from "./AutomationClient";
import { FeatureGate } from "@/components/billing/FeatureGate";
import { getUserEntitlements } from "@/lib/subscriptions/entitlements";

export const metadata: Metadata = {
  title: "Automation",
  description: "Rules that publish and schedule on your behalf."
};

export const dynamic = "force-dynamic";

export default async function AutomationPage() {
  const { supabase, user } = await requireUser();
  const { entitlements } = await getUserEntitlements(user.id);

  // If unentitled (Starter/Free), render locked paywall immediately with zero delay
  if (!entitlements.canAccessAutomation) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <FeatureGate
          feature="canAccessAutomation"
          featureName="Content Automation"
          requiredTier="pro"
          description="Automate trend discovery, AI caption writing, image generation, and multi-platform publishing hands-free on your custom schedule."
          initialAllowed={false}
        >
          <div />
        </FeatureGate>
      </div>
    );
  }

  // Fetch initial settings
  const { data: settings } = await supabase
    .from("automation_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const initialSettings = settings || {
    is_enabled: false,
    post_time: "09:00:00",
    mode: "manual",
    platforms: [],
    categories: [],
    keywords: [],
  };

  // Fetch initial logs with referenced scheduled post platforms
  const { data: logs } = await supabase
    .from("automation_logs")
    .select(`
      *,
      scheduled_posts (
        platforms
      )
    `)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <FeatureGate
        feature="canAccessAutomation"
        featureName="Content Automation"
        requiredTier="pro"
        description="Automate trend discovery, AI caption writing, image generation, and multi-platform publishing hands-free on your custom schedule."
        initialAllowed={true}
      >
        <AutomationClient
          user={user}
          initialSettings={initialSettings}
          initialLogs={(logs as AutomationLog[] | null) ?? []}
        />
      </FeatureGate>
    </div>
  );
}
