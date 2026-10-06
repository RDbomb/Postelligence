export const PINTEREST_PLATFORM = "pinterest";

// Single toggle to lock/unlock Pinterest across the entire application
export const IS_PINTEREST_LOCKED = true;

export const PINTEREST_SCOPES = [
  "boards:read",
  "boards:write",
  "pins:read",
  "pins:write",
  "user_accounts:read"
];

export type PinterestTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
};

export type PinterestUser = {
  username: string;
  account_type?: string;
  profile_image?: string;
  website_url?: string;
  id?: string;
};

function getClientConfig() {
  const appId = process.env.PINTEREST_APP_ID;
  const appSecret = process.env.PINTEREST_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error(
      "Pinterest credentials missing. Add PINTEREST_APP_ID and PINTEREST_APP_SECRET to .env.local."
    );
  }

  return { appId, appSecret };
}

export function getPinterestRedirectUri(origin: string) {
  return `${origin}/auth/pinterest/callback`;
}

export function buildPinterestOAuthUrl(origin: string, state: string) {
  const { appId } = getClientConfig();
  const url = new URL("https://www.pinterest.com/oauth/");

  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", getPinterestRedirectUri(origin));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", PINTEREST_SCOPES.join(","));
  url.searchParams.set("state", state);

  return url;
}

export async function exchangePinterestCode(origin: string, code: string) {
  const { appId, appSecret } = getClientConfig();
  const credentials = btoa(`${appId}:${appSecret}`);

  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("code", code);
  body.set("redirect_uri", getPinterestRedirectUri(origin));

  const response = await fetch("https://api.pinterest.com/v5/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`
    },
    body
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Pinterest token exchange failed: ${text}`);
  }

  return (await response.json()) as PinterestTokenResponse;
}

export async function fetchPinterestUser(accessToken: string): Promise<PinterestUser> {
  try {
    const response = await fetch("https://api.pinterest.com/v5/user_account", {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (response.ok) {
      const data = await response.json();
      if (data && (data.username || data.id)) return data as PinterestUser;
    }
  } catch (err) {
    console.warn("[Pinterest] User fetch restricted or failed:", err);
  }

  // Fallback for Trial Access Tokens where Pinterest API blocks GET /v5/user_account
  return {
    username: "Pinterest Creator",
    account_type: "INDIVIDUAL",
    id: "pinterest_trial_user",
  };
}

export function getPinterestTokenExpiry(expiresIn?: number) {
  if (!expiresIn) return null;
  return new Date(Date.now() + expiresIn * 1000).toISOString();
}