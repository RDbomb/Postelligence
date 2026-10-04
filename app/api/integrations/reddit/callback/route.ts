import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { readOAuthCallbackParams } from "@/lib/validation/oauth";
import {
  exchangeRedditCode,
  fetchRedditUser,
  getRedditTokenExpiry,
  REDDIT_PLATFORM,
  REDDIT_SCOPES
} from "@/lib/integrations/reddit";
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
    url.searchParams.set("reddit", status);
    if (message) url.searchParams.set("message", message);
    const response = NextResponse.redirect(url);
    response.cookies.delete("postelligence_reddit_oauth_state");
    return response;
  };

  if (oauthError) return redirect("error", `Reddit authorization failed: ${oauthError}`);
  if (!code || !state) return redirect("error", "Missing OAuth data.");

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/", requestUrl.origin));

  const raw = (await cookies()).get("postelligence_reddit_oauth_state")?.value;
  let cookieState: { state?: string; userId?: string } | null = null;
  try { cookieState = raw ? JSON.parse(raw) : null; } catch { cookieState = null; }

  if (cookieState?.state !== state || cookieState?.userId !== user.id) {
    return redirect("error", "Session expired. Try connecting again.");
  }

  try {
    const tokens = await exchangeRedditCode(requestUrl.origin, code);
    const redditUser = await fetchRedditUser(tokens.access_token);

    // Clean up avatar URL (Reddit appends query strings that can break)
    const avatarUrl = redditUser.icon_img
      ? redditUser.icon_img.split("?")[0]
      : null;

    const { error: upsertErr } = await upsertSocialAccount(supabase, {
      user_id: user.id,
      platform: REDDIT_PLATFORM,
      account_id: redditUser.id,
      account_name: redditUser.name,
      account_avatar_url: avatarUrl,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || null,
      token_expires_at: getRedditTokenExpiry(tokens.expires_in),
      scopes: tokens.scope?.split(" ") || REDDIT_SCOPES,
      status: "connected",
      metadata: { username: redditUser.name },
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    if (upsertErr) {
      return redirect("error", upsertErr.message);
    }

    return redirect("connected");
  } catch (error) {
    return redirect("error", error instanceof Error ? error.message : "Reddit connection failed.");
  }
}
