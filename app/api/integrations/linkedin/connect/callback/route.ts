import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { readOAuthCallbackParams } from "@/lib/validation/oauth";
import {
  exchangeLinkedInCode,
  fetchLinkedInUser,
  getLinkedInTokenExpiry,
  LINKEDIN_PLATFORM,
  LINKEDIN_SCOPES
} from "@/lib/integrations/linkedin";
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
    url.searchParams.set("linkedin", status);
    if (message) url.searchParams.set("message", message);
    const response = NextResponse.redirect(url);
    response.cookies.delete("postelligence_linkedin_oauth_state");
    return response;
  };

  if (oauthError) return redirect("error", `LinkedIn authorization failed: ${oauthError}`);
  if (!code || !state) return redirect("error", "Missing OAuth data.");

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/", requestUrl.origin));

  const raw = (await cookies()).get("postelligence_linkedin_oauth_state")?.value;
  let cookieState: { state?: string; userId?: string } | null = null;
  try { cookieState = raw ? JSON.parse(raw) : null; } catch { cookieState = null; }

  if (cookieState?.state !== state || cookieState?.userId !== user.id) {
    return redirect("error", "Session expired. Try connecting again.");
  }

  try {
    const tokens = await exchangeLinkedInCode(requestUrl.origin, code);
    const linkedinUser = await fetchLinkedInUser(tokens.access_token);

    const { error: upsertErr } = await upsertSocialAccount(supabase, {
      user_id: user.id,
      platform: LINKEDIN_PLATFORM,
      account_id: linkedinUser.sub,
      account_name: linkedinUser.name || `${linkedinUser.given_name || ""} ${linkedinUser.family_name || ""}`.trim(),
      account_avatar_url: linkedinUser.picture || null,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || null,
      token_expires_at: getLinkedInTokenExpiry(tokens.expires_in),
      scopes: tokens.scope?.split(" ") || LINKEDIN_SCOPES,
      status: "connected",
      metadata: { email: linkedinUser.email },
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    if (upsertErr) {
      return redirect("error", upsertErr.message);
    }

    return redirect("connected");
  } catch (error) {
    return redirect("error", error instanceof Error ? error.message : "LinkedIn connection failed.");
  }
}