import { z } from "zod";
import { parseJsonBody } from "@/lib/validation/http";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createBlueskySession, fetchBlueskyProfile, BLUESKY_PLATFORM } from "@/lib/integrations/bluesky";
import { upsertSocialAccount } from "@/lib/integrations/upsert-social-account";
import { canManageSocialAccounts } from "@/lib/workspace/permissions";
import type { WorkspaceRole } from "@/types";
import { assertCanConnectPlatform } from "@/lib/subscriptions/entitlements";

/**
 * `handle` is a Bluesky handle (a DNS-style name such as `alice.bsky.social`),
 * `appPassword` an app-specific password — never the account password. Both are
 * bounded; the handle is shape-checked so a malformed value never reaches the PDS
 * login call.
 */
const BlueskyConnectBody = z.object({
  handle: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Handle and app password are required.")
    .max(253)
    .regex(/^@?[a-z0-9.-]+$/, "Enter a valid Bluesky handle."),
  appPassword: z.string().min(1, "Handle and app password are required.").max(256),
  workspaceId: z.string().uuid().nullish(),
});

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  // `workspaceId` is only sent when connecting from the Team Workspace
  // "Accounts" tab — in that case the account belongs to the workspace,
  // not to whichever member ran the connect flow. Personal connects
  // (from Integrations) never send this and behave exactly as before.
  const parsedBody = await parseJsonBody(request, BlueskyConnectBody, {
    message: "Handle and app password are required.",
  });
  if (!parsedBody.success) return parsedBody.response;
  const { handle, appPassword, workspaceId } = parsedBody.data;

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

  const quotaCheck = await assertCanConnectPlatform(user.id, "bluesky", workspaceId);
  if (!quotaCheck.allowed) {
    return NextResponse.json({ error: quotaCheck.error }, { status: 403 });
  }

  try {
    const session = await createBlueskySession(handle, appPassword);
    const pdsHost = "pdsHost" in session && typeof session.pdsHost === "string" ? session.pdsHost : "bsky.social";
    const pdsUrl = `https://${pdsHost}`;
    const profile = await fetchBlueskyProfile(session.accessJwt, session.did, pdsUrl);

    const { error: upsertErr } = await upsertSocialAccount(supabase, {
      user_id: user.id,
      workspace_id: workspaceId || null,
      connected_by: user.id,
      platform: BLUESKY_PLATFORM,
      account_id: session.did,
      account_name: profile.displayName || profile.handle,
      account_avatar_url: profile.avatar || null,
      access_token: session.accessJwt,
      refresh_token: session.refreshJwt,
      token_expires_at: null,
      scopes: [],
      status: "connected",
      metadata: { handle: profile.handle, pdsHost, appPassword },
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    if (upsertErr) {
      return NextResponse.json({ error: upsertErr.message }, { status: 403 });
    }

    return NextResponse.json({ ok: true, handle: profile.handle });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Bluesky connection failed." },
      { status: 400 }
    );
  }
}
