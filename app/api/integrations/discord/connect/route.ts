import { z } from "zod";
import { parseJsonBody } from "@/lib/validation/http";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildDiscordOAuthUrl, fetchDiscordWebhookInfo, DISCORD_PLATFORM } from "@/lib/integrations/discord";
import { upsertSocialAccount } from "@/lib/integrations/upsert-social-account";
import { canManageSocialAccounts } from "@/lib/workspace/permissions";
import type { WorkspaceRole } from "@/types";
import { readWorkspaceIdParam } from "@/lib/validation/oauth";
import { assertCanConnectPlatform } from "@/lib/subscriptions/entitlements";

/**
 * The stored webhook URL is later fetched AND posted to by the server
 * (`fetchDiscordWebhookInfo`, `publishToDiscordWebhook`). Accepting an arbitrary
 * URL would therefore be a server-side request forgery vector — a user could
 * point it at an internal address and have the server call it. Restricted to
 * Discord's own webhook endpoint over https.
 */
const discordWebhookUrl = z
  .string()
  .trim()
  .min(1, "Discord Webhook URL is required.")
  .max(512)
  .refine((value) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return false;
    }
    const host = url.hostname.toLowerCase();
    const allowedHost =
      host === "discord.com" ||
      host === "discordapp.com" ||
      host === "ptb.discord.com" ||
      host === "canary.discord.com";
    return (
      url.protocol === "https:" &&
      allowedHost &&
      url.pathname.startsWith("/api/webhooks/")
    );
  }, "Must be a Discord webhook URL (https://discord.com/api/webhooks/...).");

const DiscordConnectBody = z.object({
  webhookUrl: discordWebhookUrl,
  workspaceId: z.string().uuid().nullish(),
  serverName: z.string().trim().max(200).optional(),
  channelName: z.string().trim().max(200).optional(),
  serverLogoUrl: z.string().url().max(1024).optional().nullable(),
});

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/", requestUrl.origin));
  // A malformed workspace id previously reached Supabase as-is, where a
  // non-UUID raises a Postgres type error instead of failing cleanly.
  const workspaceParam = readWorkspaceIdParam(requestUrl);
  if (workspaceParam.present && !workspaceParam.valid) {
    const invalidUrl = new URL("/team", requestUrl.origin);
    invalidUrl.searchParams.set("discord", "error");
    invalidUrl.searchParams.set("message", "That workspace link is not valid.");
    return NextResponse.redirect(invalidUrl);
  }
  const workspaceId = workspaceParam.present ? workspaceParam.workspaceId : null;

  if (workspaceId) {
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("workspace_id", workspaceId)
      .single();
    if (!membership || !canManageSocialAccounts(membership.role as WorkspaceRole)) {
      return NextResponse.redirect(new URL("/team?tab=accounts&discord=error&message=You+cannot+manage+workspace+social+accounts.", requestUrl.origin));
    }
  }

  const quotaCheck = await assertCanConnectPlatform(user.id, "discord", workspaceId);
  if (!quotaCheck.allowed) {
    const errorUrl = new URL(workspaceId ? "/team?tab=accounts" : "/integrations", requestUrl.origin);
    errorUrl.searchParams.set("error", "limit_reached");
    errorUrl.searchParams.set("message", quotaCheck.error || "Plan limit reached.");
    return NextResponse.redirect(errorUrl);
  }

  const state = crypto.randomUUID();
  try {
    const response = NextResponse.redirect(buildDiscordOAuthUrl(requestUrl.origin, state));
    response.cookies.set("postelligence_discord_oauth_state", JSON.stringify({ state, userId: user.id, workspaceId }), {
      httpOnly: true,
      maxAge: 60 * 10,
      path: "/",
      sameSite: "lax",
      secure: requestUrl.protocol === "https:",
    });
    return response;
  } catch (error) {
    const url = new URL(workspaceId ? "/team?tab=accounts" : "/integrations", requestUrl.origin);
    url.searchParams.set("discord", "error");
    url.searchParams.set("message", error instanceof Error ? error.message : "Discord setup is incomplete.");
    return NextResponse.redirect(url);
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const parsedBody = await parseJsonBody(request, DiscordConnectBody, {
    message: "Discord Webhook URL is required.",
  });
  if (!parsedBody.success) return parsedBody.response;
  const { webhookUrl, workspaceId, serverName, channelName, serverLogoUrl } = parsedBody.data;

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

  const quotaCheck = await assertCanConnectPlatform(user.id, "discord", workspaceId);
  if (!quotaCheck.allowed) {
    return NextResponse.json({ error: quotaCheck.error }, { status: 403 });
  }

  try {
    const info = await fetchDiscordWebhookInfo(webhookUrl);
    const savedServerName = typeof serverName === "string" && serverName.trim()
      ? serverName.trim()
      : info.guildName;
    const savedChannelName = typeof channelName === "string" && channelName.trim()
      ? channelName.trim().replace(/^#/, "")
      : info.channelName;
    const suppliedServerLogoUrl = typeof serverLogoUrl === "string" && /^https?:\/\//i.test(serverLogoUrl.trim())
      ? serverLogoUrl.trim()
      : null;
    const accountAvatarUrl = suppliedServerLogoUrl || info.guildAvatarUrl || info.botAvatarUrl;
    
    const accountName = savedServerName
      ? `${savedServerName} · ${info.botName || "Discord bot"}`
      : info.botName || "Discord bot";

    await upsertSocialAccount(supabase, {
      user_id: user.id,
      workspace_id: workspaceId || null,
      connected_by: user.id,
      platform: DISCORD_PLATFORM,
      account_id: info.channelId || `webhook-${crypto.randomUUID()}`,
      account_name: accountName,
      // Prefer the server image; fall back to the webhook/bot image.
      account_avatar_url: accountAvatarUrl,
      access_token: webhookUrl, // store webhook URL in access_token
      refresh_token: null,
      token_expires_at: null,
      scopes: [],
      status: "connected",
      metadata: { 
        webhookUrl,
        channelId: info.channelId,
        guildId: info.guildId,
        guildName: savedServerName,
        channelName: savedChannelName,
        botName: info.botName,
        botAvatarUrl: info.botAvatarUrl,
        guildAvatarUrl: suppliedServerLogoUrl || info.guildAvatarUrl
      },
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    return NextResponse.json({ ok: true, name: accountName });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Discord webhook connection failed." },
      { status: 400 }
    );
  }
}
