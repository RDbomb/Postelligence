import type { Metadata } from "next";
import { requireUser } from "@/lib/supabase/require-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActionLabel, type WorkspaceAction } from "@/lib/workspace/activity-logger";
import TeamClient from "./TeamClient";
import WorkspaceSetupClient from "@/app/(shell)/workspace/WorkspaceSetupClient";
import { FeatureGate } from "@/components/billing/FeatureGate";
import { getUserEntitlements } from "@/lib/subscriptions/entitlements";
import type { Workspace, WorkspaceInvite, WorkspaceRole } from "@/types";

export const metadata: Metadata = {
  title: "Team",
  description: "Members, roles and workspace activity."
};

export const dynamic = "force-dynamic";

export default async function TeamPage(
  props: {
    searchParams?: Promise<{ bluesky?: string; message?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const { supabase, user } = await requireUser();
  const { entitlements } = await getUserEntitlements(user.id);

  // If unentitled (Starter/Free), render locked paywall immediately on /team without redirect
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
          <div />
        </FeatureGate>
      </div>
    );
  }

  // Get membership
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("*, workspace:workspaces(*)")
    .eq("user_id", user.id)
    .single();

  // Entitled user not yet in a workspace — render setup directly without redirect
  if (!membership) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
        <WorkspaceSetupClient />
      </div>
    );
  }

  const admin = createAdminClient();
  const workspace   = membership.workspace as Workspace;
  const currentRole = membership.role as WorkspaceRole;

  // Fetch all members
  const { data: rawMembers } = await supabase
    .from("workspace_members")
    .select("*")
    .eq("workspace_id", workspace.id)
    .order("joined_at", { ascending: true });

  // Enrich members with user info
  const members = await Promise.all(
    (rawMembers || []).map(async (m) => {
      const { data: userData } = await admin.auth.admin.getUserById(m.user_id);
      return {
        ...m,
        email:      userData?.user?.email      ?? "",
        full_name:  userData?.user?.user_metadata?.full_name  ?? "",
        avatar_url: userData?.user?.user_metadata?.avatar_url ?? "",
      };
    })
  );

  // Fetch pending invites (owner/manager only)
  let invites: WorkspaceInvite[] = [];
  if (currentRole === "owner" || currentRole === "manager") {
    const { data } = await supabase
      .from("workspace_invites")
      .select("*")
      .eq("workspace_id", workspace.id)
      .eq("accepted", false)
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });
    invites = data || [];
  }

  // Fetch activity log (last 50)
  const { data: rawLogs } = await supabase
    .from("workspace_activity_log")
    .select("*")
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: false })
    .limit(50);

  // Enrich logs with user info
  const activityLogs = await Promise.all(
    (rawLogs || []).map(async (log) => {
      const { data: userData } = await admin.auth.admin.getUserById(log.user_id);
      const userName  = userData?.user?.user_metadata?.full_name || userData?.user?.email || "Unknown";
      const metadata  = { ...((log.metadata as Record<string, unknown>) || {}), user_name: userName };
      return {
        ...log,
        user_name:   userName,
        user_avatar: userData?.user?.user_metadata?.avatar_url || "",
        label:       getActionLabel(log.action as WorkspaceAction, metadata),
      };
    })
  );

  return (
    <TeamClient
      workspace={workspace}
      members={members}
      invites={invites}
      activityLogs={activityLogs}
      currentRole={currentRole}
      currentUserId={user.id}
      currentUser={{ email: user.email, user_metadata: user.user_metadata }}
      blueskyStatus={searchParams?.bluesky || null}
      blueskyMessage={searchParams?.message || null}
    />
  );
}
