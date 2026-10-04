import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildInstagramOAuthUrl } from "@/lib/integrations/instagram";
import { canManageSocialAccounts } from "@/lib/workspace/permissions";
import type { WorkspaceRole } from "@/types";
import { readWorkspaceIdParam } from "@/lib/validation/oauth";
import { assertCanConnectPlatform } from "@/lib/subscriptions/entitlements";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/", requestUrl.origin));
  }

  // Present only when connecting from the Team Workspace Accounts tab.
  // A malformed workspace id previously reached Supabase as-is, where a
  // non-UUID raises a Postgres type error instead of failing cleanly.
  const workspaceParam = readWorkspaceIdParam(requestUrl);
  if (workspaceParam.present && !workspaceParam.valid) {
    const invalidUrl = new URL("/team", requestUrl.origin);
    invalidUrl.searchParams.set("instagram", "error");
    invalidUrl.searchParams.set("message", "That workspace link is not valid.");
    return NextResponse.redirect(invalidUrl);
  }
  const workspaceId = workspaceParam.present ? workspaceParam.workspaceId : null;
  if (workspaceId) {
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("*")
      .eq("user_id", user.id)
      .eq("workspace_id", workspaceId)
      .single();

    if (!membership || !canManageSocialAccounts(membership.role as WorkspaceRole)) {
      const redirectUrl = new URL("/team", requestUrl.origin);
      redirectUrl.searchParams.set("instagram", "error");
      redirectUrl.searchParams.set("message", "Only the workspace Owner or a Manager can connect social accounts.");
      return NextResponse.redirect(redirectUrl);
    }
  }

  const quotaCheck = await assertCanConnectPlatform(user.id, "instagram", workspaceId);
  if (!quotaCheck.allowed) {
    const errorUrl = new URL(workspaceId ? "/team" : "/integrations", requestUrl.origin);
    errorUrl.searchParams.set("error", "limit_reached");
    errorUrl.searchParams.set("message", quotaCheck.error || "Plan limit reached.");
    return NextResponse.redirect(errorUrl);
  }

  try {
    const state = crypto.randomUUID();
    const oauthUrl = buildInstagramOAuthUrl(requestUrl.origin, state);
    const response = NextResponse.redirect(oauthUrl);

    response.cookies.set(
      "postelligence_instagram_oauth_state",
      JSON.stringify({ state, userId: user.id, workspaceId: workspaceId || null }),
      {
        httpOnly: true,
        maxAge: 60 * 10,
        path: "/",
        sameSite: "lax",
        secure: requestUrl.protocol === "https:"
      }
    );

    return response;
  } catch (error) {
    const redirectUrl = new URL(workspaceId ? "/team" : "/dashboard", requestUrl.origin);
    redirectUrl.searchParams.set("instagram", "error");
    redirectUrl.searchParams.set(
      "message",
      error instanceof Error
        ? error.message
        : "Instagram setup is incomplete. Check INSTAGRAM_APP_ID and INSTAGRAM_APP_SECRET in .env.local."
    );
    return NextResponse.redirect(redirectUrl);
  }
}
