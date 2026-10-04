import { z } from "zod";
import { parseJsonBody } from "@/lib/validation/http";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchTelegramBotInfo, fetchTelegramChatInfo, TELEGRAM_PLATFORM } from "@/lib/integrations/telegram";
import { upsertSocialAccount } from "@/lib/integrations/upsert-social-account";
import { canManageSocialAccounts } from "@/lib/workspace/permissions";
import type { WorkspaceRole } from "@/types";
import { assertCanConnectPlatform } from "@/lib/subscriptions/entitlements";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";

/**
 * This route serves three flows dispatched by `action`:
 *   - "send_code"   — MTProto phone login step 1 (needs phoneNumber)
 *   - "verify_code" — MTProto phone login step 2 (needs phone code + hash)
 *   - no action     — the classic bot-token flow (needs botToken + chatId)
 *
 * Which fields are required therefore depends on the flow, so every field is
 * optional here; the handler keeps its own per-flow required-field checks and
 * their specific error messages. Validation's job at this layer is to bound
 * lengths and reject wrong types before anything reaches the Telegram client —
 * `sessionString` in particular is an opaque MTProto session that would
 * otherwise be an unbounded string handed straight to the library.
 */
const TelegramConnectBody = z.object({
  action: z.enum(["send_code", "verify_code"]).optional(),
  phoneNumber: z.string().trim().max(32).optional(),
  phoneCode: z.string().trim().max(16).optional(),
  phoneCodeHash: z.string().max(256).optional(),
  sessionString: z.string().max(8192).optional(),
  password: z.string().max(256).optional(),
  botToken: z
    .string()
    .trim()
    .max(256)
    .regex(/^\d+:[A-Za-z0-9_-]+$/, "Enter a valid Telegram bot token.")
    .optional(),
  // Accept a numeric or string chat id, but always hand the handler a string —
  // that is how it passes chatId to the Telegram API and stores it.
  chatId: z.coerce.string().trim().max(128).optional(),
  apiId: z.union([z.string().max(32), z.number()]).optional(),
  apiHash: z.string().max(128).optional(),
  workspaceId: z.string().uuid().nullish(),
});

export const dynamic = "force-dynamic";

const DEFAULT_API_ID = Number(process.env.TELEGRAM_API_ID || 2040);
const DEFAULT_API_HASH = process.env.TELEGRAM_API_HASH || "b18441a1ed607e10a39fb21744570f96";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const parsedBody = await parseJsonBody(request, TelegramConnectBody);
  if (!parsedBody.success) return parsedBody.response;
  const body = parsedBody.data;
  const { action, phoneNumber, phoneCode, phoneCodeHash, sessionString, chatId, botToken, workspaceId, apiId, apiHash } = body;

  const effectiveApiId = Number(apiId || DEFAULT_API_ID);
  const effectiveApiHash = String(apiHash || DEFAULT_API_HASH);

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

  const quotaCheck = await assertCanConnectPlatform(user.id, "telegram", workspaceId);
  if (!quotaCheck.allowed) {
    return NextResponse.json({ error: quotaCheck.error }, { status: 403 });
  }

  // ──── Step 1: Send Code via MTProto (Option 4) ────
  if (action === "send_code") {
    if (!phoneNumber) {
      return NextResponse.json({ error: "Phone number with country code is required (e.g. +1234567890)." }, { status: 400 });
    }
    try {
      const client = new TelegramClient(new StringSession(""), effectiveApiId, effectiveApiHash, {
        connectionRetries: 5,
      });
      await client.connect();
      const res = await client.sendCode(
        { apiId: effectiveApiId, apiHash: effectiveApiHash },
        phoneNumber.trim()
      );
      const tempSession = client.session.save() as unknown as string;
      await client.disconnect();

      return NextResponse.json({
        ok: true,
        phoneCodeHash: res.phoneCodeHash,
        sessionString: tempSession,
      });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Failed to send code to Telegram app." },
        { status: 400 }
      );
    }
  }

  // ──── Step 2: Verify 5-Digit App Code & Save MTProto Account (Option 4) ────
  if (action === "verify_code") {
    if (!phoneNumber || !phoneCode || !phoneCodeHash) {
      return NextResponse.json({ error: "Phone number, verification code, and code hash are required." }, { status: 400 });
    }

    try {
      const client = new TelegramClient(new StringSession(sessionString || ""), effectiveApiId, effectiveApiHash, {
        connectionRetries: 5,
      });
      await client.connect();

      await client.start({
        phoneNumber: () => Promise.resolve(phoneNumber.trim()),
        password: () => Promise.resolve(body.password || ""),
        phoneCode: () => Promise.resolve(phoneCode.trim()),
        onError: (err) => { throw err; },
      });

      const finalSession = client.session.save() as unknown as string;
      const me = await client.getMe();
      const userDisplayName = me ? [me.firstName, me.lastName].filter(Boolean).join(" ") || me.username || phoneNumber : phoneNumber;

      const targetChannelOrUser = chatId ? String(chatId).trim() : me?.username || me?.id?.toString() || phoneNumber;

      await upsertSocialAccount(supabase, {
        user_id: user.id,
        workspace_id: workspaceId || null,
        connected_by: user.id,
        platform: TELEGRAM_PLATFORM,
        account_id: String(me.id),
        account_name: `@${me.username || userDisplayName} (Personal Account)`,
        account_avatar_url: null,
        access_token: finalSession,
        refresh_token: null,
        token_expires_at: null,
        scopes: [],
        status: "connected",
        metadata: {
          login_type: "mtproto",
          phoneNumber,
          apiId: effectiveApiId,
          apiHash: effectiveApiHash,
          username: me.username,
          firstName: me.firstName,
          targetChatId: targetChannelOrUser,
        },
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      await client.disconnect();
      return NextResponse.json({ ok: true, name: `@${me.username || userDisplayName}` });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Verification failed. Check the code and try again." },
        { status: 400 }
      );
    }
  }

  // ──── Step 3: Standard Bot Token Connection (Fallback / Option 1) ────
  if (botToken && chatId) {
    try {
      const botInfo = await fetchTelegramBotInfo(botToken);
      const chatInfo = await fetchTelegramChatInfo(botToken, chatId);

      const accountName = chatInfo.title 
        ? `${chatInfo.title} (via @${botInfo.username})` 
        : `@${chatInfo.username || chatId} (via @${botInfo.username})`;

      await upsertSocialAccount(supabase, {
        user_id: user.id,
        workspace_id: workspaceId || null,
        connected_by: user.id,
        platform: TELEGRAM_PLATFORM,
        account_id: String(chatInfo.id) || chatId,
        account_name: accountName,
        account_avatar_url: null,
        access_token: botToken,
        refresh_token: null,
        token_expires_at: null,
        scopes: [],
        status: "connected",
        metadata: {
          login_type: "bot",
          botToken,
          chatId,
          botUsername: botInfo.username,
          botName: botInfo.name,
          chatTitle: chatInfo.title,
          chatType: chatInfo.type,
          chatUsername: chatInfo.username
        },
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

      return NextResponse.json({ ok: true, name: accountName });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Telegram connection failed." },
        { status: 400 }
      );
    }
  }

  return NextResponse.json({ error: "Bot token and Chat/Channel ID are required." }, { status: 400 });
}
