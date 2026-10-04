import type { createClient } from "@/lib/supabase/server";
import { assertCanConnectPlatform } from "@/lib/subscriptions/entitlements";

// Migration 012 replaced the single table-wide unique constraint on
// social_accounts with two *partial* unique indexes:
//   social_accounts_personal_unique   (user_id, platform, account_id) WHERE workspace_id IS NULL
//   social_accounts_workspace_unique  (workspace_id, platform, account_id) WHERE workspace_id IS NOT NULL
//
// PostgREST's `.upsert(row, { onConflict: "col1,col2,col3" })` generates a
// plain `ON CONFLICT (col1, col2, col3)` clause with no WHERE predicate.
// Postgres can only resolve ("infer") an ON CONFLICT target against a
// *partial* unique index if the ON CONFLICT clause repeats that index's
// WHERE predicate verbatim — which PostgREST has no way to do. So every
// `.upsert(..., { onConflict: "workspace_id,platform,account_id" })` or
// `.upsert(..., { onConflict: "user_id,platform,account_id" })` call against
// this table fails with "there is no unique or exclusion constraint
// matching the ON CONFLICT specification", both for brand-new connections
// and for reconnecting a previously-disconnected account.
//
// Rather than upsert-with-onConflict, do the lookup ourselves and issue an
// explicit insert or update. This works regardless of the partial indexes.
export async function upsertSocialAccount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  record: Record<string, unknown> & {
    user_id: string;
    workspace_id?: string | null;
    platform: string;
    account_id: string;
  }
) {
  const workspaceId = record.workspace_id ?? null;

  const ownerFilter = workspaceId
    ? supabase.from("social_accounts").select("id, status").eq("workspace_id", workspaceId)
    : supabase.from("social_accounts").select("id, status").eq("user_id", record.user_id).is("workspace_id", null);

  const { data: existing } = await ownerFilter
    .eq("platform", record.platform)
    .eq("account_id", record.account_id)
    .maybeSingle();

  // If this account doesn't exist or wasn't already connected, verify subscription tier limit
  if (!existing?.id || existing.status !== "connected") {
    try {
      const quotaCheck = await assertCanConnectPlatform(
        record.user_id,
        record.platform,
        workspaceId,
        record.account_id
      );
      if (!quotaCheck.allowed) {
        return {
          data: null,
          error: new Error(quotaCheck.error || "Connected platforms limit reached for your plan."),
        };
      }
    } catch (quotaErr) {
      console.warn("Could not check subscription quota in upsertSocialAccount:", quotaErr);
    }
  }

  const fields = { ...(record as Record<string, unknown>) };
  delete fields.id;

  if (existing?.id) {
    return supabase.from("social_accounts").update(fields).eq("id", existing.id as string);
  }

  return supabase.from("social_accounts").insert(fields);
}