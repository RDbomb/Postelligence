import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildMetaOAuthUrl } from "@/lib/integrations/meta";
import { canManageSocialAccounts } from "@/lib/workspace/permissions";
import type { WorkspaceRole } from "@/types";
import { readWorkspaceIdParam } from "@/lib/validation/oauth";
import { assertCanConnectPlatform } from "@/lib/subscriptions/entitlements";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const platform = requestUrl.searchParams.get("platform");
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
    invalidUrl.searchParams.set("meta", "error");
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
      redirectUrl.searchParams.set("meta", "error");
      redirectUrl.searchParams.set("message", "Only the workspace Owner or a Manager can connect social accounts.");
      return NextResponse.redirect(redirectUrl);
    }
  }

  const targetPlatform = platform === "instagram" ? "instagram" : "facebook";
  const quotaCheck = await assertCanConnectPlatform(user.id, targetPlatform, workspaceId);
  if (!quotaCheck.allowed) {
    const errorUrl = new URL(workspaceId ? "/team" : "/integrations", requestUrl.origin);
    errorUrl.searchParams.set("error", "limit_reached");
    errorUrl.searchParams.set("message", quotaCheck.error || "Plan limit reached.");
    return NextResponse.redirect(errorUrl);
  }

  try {
    const state = crypto.randomUUID();
    const oauthUrl = buildMetaOAuthUrl(requestUrl.origin, state);
    const response = NextResponse.redirect(oauthUrl);

    response.cookies.set(
      "postelligence_meta_oauth_state",
      JSON.stringify({
        state,
        userId: user.id,
        platform: platform === "facebook" || platform === "instagram" ? platform : null,
        workspaceId: workspaceId || null
      }),
      {
        httpOnly: true,
        maxAge: 60 * 10,
        path: "/",
        sameSite: "lax",
        secure: requestUrl.protocol === "https:"
      }
    );

    return response;
  } catch {
    const redirectUrl = new URL("/dashboard", requestUrl.origin);
    redirectUrl.searchParams.set("meta", "error");
    redirectUrl.searchParams.set(
      "message",
      "Add META_APP_ID and META_APP_SECRET to .env.local first."
    );
    return NextResponse.redirect(redirectUrl);
  }
}
