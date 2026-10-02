import type { Metadata } from "next";
import { requireUser } from "@/lib/supabase/require-user";
import { redirect } from "next/navigation";
import WorkspaceSetupClient from "./WorkspaceSetupClient";
import { FeatureGate } from "@/components/billing/FeatureGate";
import { getUserEntitlements } from "@/lib/subscriptions/entitlements";

export const metadata: Metadata = {
  title: "Workspace",
  description: "Manage your shared workspace."
};

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const { supabase, user } = await requireUser();
  const { entitlements } = await getUserEntitlements(user.id);

  // If unentitled (Starter/Free), render locked paywall immediately without redirect
  if (!entitlements.canAccessTeamWorkspaces) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
        <FeatureGate
          feature="canAccessTeamWorkspaces"
          featureName="Team Workspaces"
          requiredTier="pro"
          description="Collaborate with team members, manage brand accounts collectively, and establish structured review workflows."
          initialAllowed={false}
        >
          <WorkspaceSetupClient />
        </FeatureGate>
      </div>
    );
  }

  // If already in a workspace, redirect to team page
  const { data: member } = await supabase
    .from("workspace_members")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (member) redirect("/team");

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      <FeatureGate
        feature="canAccessTeamWorkspaces"
        featureName="Team Workspaces"
        requiredTier="pro"
        description="Collaborate with team members, manage brand accounts collectively, and establish structured review workflows."
        initialAllowed={true}
      >
        <WorkspaceSetupClient />
      </FeatureGate>
    </div>
  );
}