import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { readOAuthCallbackParams } from "@/lib/validation/oauth";
import {
  exchangePinterestCode,
  fetchPinterestUser,
  getPinterestTokenExpiry,
  PINTEREST_PLATFORM,
  PINTEREST_SCOPES
} from "@/lib/integrations/pinterest";
import { upsertSocialAccount } from "@/lib/integrations/upsert-social-account";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  // Validated and bounded; an invalid value reads as null so the existing
  // "missing OAuth data" redirect below handles it exactly as before.
  const { code, state, error: oauthError } = readOAuthCallbackParams(requestUrl);
  const supabase = await createClient();

  const redirect = (status: "connected" | "error", message?: string) => {
    const url = new URL("/dashboard", requestUrl.origin);
    url.searchParams.set("pinterest", status);
    if (message) url.searchParams.set("message", message);
    const response = NextResponse.redirect(url);
    response.cookies.delete("postelligence_pinterest_oauth_state");
    return response;
  };

  if (oauthError) return redirect("error", `Pinterest authorization failed: ${oauthError}`);
  if (!code || !state) return redirect("error", "Missing OAuth data.");

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/", requestUrl.origin));

  const raw = (await cookies()).get("postelligence_pinterest_oauth_state")?.value;
  let cookieState: { state?: string; userId?: string } | null = null;
  try { cookieState = raw ? JSON.parse(raw) : null; } catch { cookieState = null; }

  if (cookieState?.state !== state || cookieState?.userId !== user.id) {
    return redirect("error", "Session expired. Try connecting again.");
  }

  try {
    const tokens = await exchangePinterestCode(requestUrl.origin, code);
    const pinterestUser = await fetchPinterestUser(tokens.access_token);

    const accountId = pinterestUser.id || pinterestUser.username;

    const { error: upsertErr } = await upsertSocialAccount(supabase, {
      user_id: user.id,
      platform: PINTEREST_PLATFORM,
      account_id: accountId,
      account_name: pinterestUser.username,
      account_avatar_url: pinterestUser.profile_image || null,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || null,
      token_expires_at: getPinterestTokenExpiry(tokens.expires_in),
      scopes: tokens.scope?.split(" ") || PINTEREST_SCOPES,
      status: "connected",
      metadata: { username: pinterestUser.username },
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    if (upsertErr) {
      return redirect("error", upsertErr.message);
    }

    return redirect("connected");
  } catch (error) {
    return redirect("error", error instanceof Error ? error.message : "Pinterest connection failed.");
  }
}