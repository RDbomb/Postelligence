import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildPinterestOAuthUrl, IS_PINTEREST_LOCKED } from "@/lib/integrations/pinterest";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);

  if (IS_PINTEREST_LOCKED) {
    const redirectUrl = new URL("/integrations", requestUrl.origin);
    redirectUrl.searchParams.set("pinterest", "error");
    redirectUrl.searchParams.set("message", "Pinterest integration is currently locked and coming soon.");
    return NextResponse.redirect(redirectUrl);
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.redirect(new URL("/", requestUrl.origin));

  try {
    const state = crypto.randomUUID();
    const oauthUrl = buildPinterestOAuthUrl(requestUrl.origin, state);
    const response = NextResponse.redirect(oauthUrl);

    response.cookies.set(
      "postelligence_pinterest_oauth_state",
      JSON.stringify({ state, userId: user.id }),
      { httpOnly: true, maxAge: 60 * 10, path: "/", sameSite: "lax", secure: requestUrl.protocol === "https:" }
    );

    return response;
  } catch (error) {
    const redirectUrl = new URL("/dashboard", requestUrl.origin);
    redirectUrl.searchParams.set("pinterest", "error");
    redirectUrl.searchParams.set("message", error instanceof Error ? error.message : "Pinterest setup incomplete.");
    return NextResponse.redirect(redirectUrl);
  }
}