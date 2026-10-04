import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { readOAuth1CallbackParams } from "@/lib/validation/oauth";
import {
  exchangeTwitterToken,
  fetchTwitterUser,
  TWITTER_PLATFORM,
  TWITTER_SCOPES,
} from "@/lib/integrations/twitter";
import { upsertSocialAccount } from "@/lib/integrations/upsert-social-account";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  // Validated and bounded; an invalid value reads as null so the existing
  // redirect-on-missing branch below handles it exactly as before.
  const {
    oauthToken,
    oauthVerifier,
    error: oauthError,
  } = readOAuth1CallbackParams(requestUrl);
  const supabase = await createClient();

  const redirect = (status: "connected" | "error", message?: string) => {
    const url = new URL("/dashboard", requestUrl.origin);
    url.searchParams.set("twitter", status);
    if (message) url.searchParams.set("message", message);
    const response = NextResponse.redirect(url);
    response.cookies.delete("postelligence_twitter_oauth_state");
    return response;
  };

  if (oauthError) return redirect("error", `Twitter authorization failed: ${oauthError}`);
  if (!oauthToken || !oauthVerifier) return redirect("error", "Missing OAuth data.");

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/", requestUrl.origin));

  const raw = (await cookies()).get("postelligence_twitter_oauth_state")?.value;
  let cookieState: { oauthToken?: string; oauthTokenSecret?: string; userId?: string } | null = null;
  try { cookieState = raw ? JSON.parse(raw) : null; } catch { cookieState = null; }

  if (!cookieState || cookieState.userId !== user.id || cookieState.oauthToken !== oauthToken) {
    return redirect("error", "Session expired. Try connecting again.");
  }

  try {
    const { accessToken, accessTokenSecret, userId, screenName } = await exchangeTwitterToken(oauthToken, oauthVerifier);
    const twitterUser = await fetchTwitterUser(accessToken, accessTokenSecret);

    const { error: upsertErr } = await upsertSocialAccount(supabase, {
      user_id: user.id,
      platform: TWITTER_PLATFORM,
      account_id: userId,
      account_name: twitterUser.name,
      account_avatar_url: twitterUser.profile_image_url_https || null,
      access_token: accessToken,
      refresh_token: accessTokenSecret,
      token_expires_at: null,
      scopes: TWITTER_SCOPES,
      status: "connected",
      metadata: { username: screenName },
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (upsertErr) {
      return redirect("error", upsertErr.message);
    }

    return redirect("connected");
  } catch (error) {
    return redirect("error", error instanceof Error ? error.message : "Twitter connection failed.");
  }
}