import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity, WorkspaceActions } from "@/lib/workspace/activity-logger";
import { parseJsonBody } from "@/lib/validation/http";
import { nonEmptyString } from "@/lib/validation/schemas";
import { getUserEntitlements } from "@/lib/subscriptions/entitlements";

export const dynamic = "force-dynamic";

/**
 * `workspaces.name` is `text NOT NULL` with no length constraint, so the bound is
 * chosen here rather than inherited: 100 characters is well beyond any real team
 * name and keeps a display value from being unbounded. `nonEmptyString` trims,
 * which is what the handler did by hand.
 */
const CreateWorkspaceBody = z.object({
  name: nonEmptyString(100),
});

// ── GET /api/workspace ───────────────────────────────────────
// Returns the current user's workspace + their role
// Returns null if user is not in any workspace
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Find workspace the user belongs to
  const { data: member, error: memberError } = await supabase
    .from("workspace_members")
    .select("*, workspace:workspaces(*)")
    .eq("user_id", user.id)
    .single();

  if (memberError || !member) {
    // Not in any workspace — return null (not an error)
    return NextResponse.json({ workspace: null, member: null, role: null });
  }

  return NextResponse.json({
    workspace: member.workspace,
    member: {
      id:           member.id,
      workspace_id: member.workspace_id,
      user_id:      member.user_id,
      role:         member.role,
      joined_at:    member.joined_at,
    },
    role: member.role,
  });
}

// ── POST /api/workspace ──────────────────────────────────────
// Creates a new workspace and adds the creator as owner
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const admin    = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Check user is not already in a workspace
  const { data: existing } = await supabase
    .from("workspace_members")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (existing) {
    return NextResponse.json(
      { error: "You are already a member of a workspace. Leave it before creating a new one." },
      { status: 400 }
    );
  }

  // Check workspace creation entitlements
  const { entitlements } = await getUserEntitlements(user.id);
  if (!entitlements.canAccessTeamWorkspaces || entitlements.maxWorkspaces <= 0) {
    return NextResponse.json(
      {
        error: "Team Workspaces require a Pro or Plus subscription. Please upgrade to create a workspace.",
        code: "FEATURE_LOCKED",
        feature: "canAccessTeamWorkspaces",
      },
      { status: 403 }
    );
  }

  // Check how many workspaces the user already owns
  const { count } = await supabase
    .from("workspaces")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", user.id);

  if ((count || 0) >= entitlements.maxWorkspaces) {
    return NextResponse.json(
      {
        error: `You have reached the workspace limit (${entitlements.maxWorkspaces}) for the ${entitlements.name} plan.`,
        code: "QUOTA_EXCEEDED",
        metric: "workspaces",
        limit: entitlements.maxWorkspaces,
      },
      { status: 403 }
    );
  }

  // Parsed after the "already in a workspace" check so that check keeps
  // answering first, exactly as before.
  const parsed = await parseJsonBody(req, CreateWorkspaceBody, {
    message: "Workspace name is required.",
  });
  if (!parsed.success) return parsed.response;
  const { name } = parsed.data;

  // Create workspace
  const { data: workspace, error: wsError } = await supabase
    .from("workspaces")
    .insert({ name, owner_id: user.id })
    .select()
    .single();

  if (wsError || !workspace) {
    return NextResponse.json({ error: wsError?.message || "Failed to create workspace" }, { status: 500 });
  }

  // Add creator as owner member
  const { error: memberError } = await supabase
    .from("workspace_members")
    .insert({ workspace_id: workspace.id, user_id: user.id, role: "owner" });

  if (memberError) {
    // Rollback workspace creation
    await supabase.from("workspaces").delete().eq("id", workspace.id);
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }

  // Get user display name for activity log
  const { data: userData } = await admin.auth.admin.getUserById(user.id);
  const userName = userData?.user?.user_metadata?.full_name
    || userData?.user?.email
    || "Unknown";

  // Log activity
  await logActivity(supabase, workspace.id, user.id, WorkspaceActions.WORKSPACE_CREATED, {
    metadata: { user_name: userName },
  });

  return NextResponse.json({ workspace }, { status: 201 });
}