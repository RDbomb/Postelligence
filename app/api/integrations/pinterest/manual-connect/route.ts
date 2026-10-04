import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchPinterestUser, PINTEREST_PLATFORM } from "@/lib/integrations/pinterest";
import { upsertSocialAccount } from "@/lib/integrations/upsert-social-account";
import { canManageSocialAccounts } from "@/lib/workspace/permissions";
import type { WorkspaceRole } from "@/types";
import { assertCanConnectPlatform } from "@/lib/subscriptions/entitlements";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { accessToken, workspaceId } = await request.json();

  if (!accessToken || typeof accessToken !== "string" || !accessToken.trim()) {
    return NextResponse.json({ error: "Pinterest Access Token is required." }, { status: 400 });
  }

  if (workspaceId) {
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("*")
      .eq("user_id", user.id)
      .eq("workspace_id", workspaceId)
      .single();

    if (!membership || !canManageSocialAccounts(membership.role as WorkspaceRole)) {
      return NextResponse.json({ error: "Only the workspace Owner or a Manager can connect social accounts." }, { status: 403 });
    }
  }

  const quotaCheck = await assertCanConnectPlatform(user.id, "pinterest", workspaceId);
  if (!quotaCheck.allowed) {
    return NextResponse.json({ error: quotaCheck.error }, { status: 403 });
  }

  try {
    const pinterestUser = await fetchPinterestUser(accessToken.trim());
    const accountId = pinterestUser.id || pinterestUser.username;

    await upsertSocialAccount(supabase, {
      user_id: user.id,
      workspace_id: workspaceId || null,
      connected_by: user.id,
      platform: PINTEREST_PLATFORM,
      account_id: accountId,
      account_name: pinterestUser.username || "Pinterest Account",
      account_avatar_url: pinterestUser.profile_image || null,
      access_token: accessToken.trim(),
      refresh_token: null,
      token_expires_at: null,
      scopes: ["pins:read", "pins:write", "boards:read", "user_accounts:read"],
      status: "connected",
      metadata: { username: pinterestUser.username, login_type: "token" },
    });

    return NextResponse.json({ success: true, accountName: pinterestUser.username });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to verify Pinterest token.";
    console.error("[Pinterest Manual Connect Error]:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
