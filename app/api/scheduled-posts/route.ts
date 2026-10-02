import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { canPublish } from "@/lib/workspace/permissions";
import { parseJsonBody, parseSearchParams } from "@/lib/validation/http";
import { httpUrl, isoDateTime, platformId, uuid } from "@/lib/validation/schemas";
import type { WorkspaceRole } from "@/types";
import { schedulePostWithInngest } from "@/lib/inngest/client";
import { getUserEntitlements, incrementUsage } from "@/lib/subscriptions/entitlements";

const ListQuery = z.object({
  workspace_id: uuid.optional(),
});

/**
 * `scheduled_time` is the only required field — the handler defaults every
 * other column, and previously hand-rolled the same 400 for a missing time.
 *
 * The pre-upload ids and workspace links are `.nullish()`: Compose always
 * sends the `linkedin_media_urn` / `youtube_video_id` keys and sets them to
 * `null` when there was no video to pre-upload, so `null` must stay valid.
 */
const CreateScheduledPostBody = z.object({
  title: z.string().trim().max(500, "Must be 500 characters or fewer.").optional(),
  description: z.string().trim().max(20_000, "Must be 20000 characters or fewer.").optional(),
  media_urls: z.array(httpUrl.max(2_048, "Must be 2048 characters or fewer.")).max(20, "At most 20 media items.").optional(),
  platforms: z.array(platformId).max(20, "Too many platforms.").optional(),
  scheduled_time: isoDateTime,
  linkedin_media_urn: z.string().trim().max(255, "Must be 255 characters or fewer.").nullish(),
  youtube_video_id: z.string().trim().max(255, "Must be 255 characters or fewer.").nullish(),
  workspace_id: uuid.nullish(),
  workspace_draft_id: uuid.nullish(),
});

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ?workspace_id= lets the Team Workspace Calendar/Drafts views list posts
  // scheduled for the whole workspace. Omitted, this is the unchanged
  // solo-user query (only the caller's own personal posts).
  const parsedQuery = parseSearchParams(req.nextUrl, ListQuery);
  if (!parsedQuery.success) return parsedQuery.response;
  const workspaceId = parsedQuery.data.workspace_id;

  let query = supabase
    .from("scheduled_posts")
    .select("*")
    .order("scheduled_time", { ascending: true });

  query = workspaceId ? query.eq("workspace_id", workspaceId) : query.eq("user_id", user.id).is("workspace_id", null);

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ posts: data });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = await parseJsonBody(req, CreateScheduledPostBody);
  if (!parsed.success) return parsed.response;
  const {
    title, description, media_urls, platforms, scheduled_time,
    linkedin_media_urn, youtube_video_id,
    // Only sent by Team Workspace flows (see workspace/drafts/[id]/publish).
    // Solo users never send these and get identical behavior to before.
    workspace_id, workspace_draft_id,
  } = parsed.data;

  const selectedPlatforms = Array.isArray(platforms) ? platforms : [];
  const requiresMedia = selectedPlatforms.some((p: string) =>
    ["instagram", "youtube", "pinterest"].includes(p.toLowerCase())
  );
  const mediaList = Array.isArray(media_urls) ? media_urls.filter(Boolean) : [];

  if (requiresMedia && mediaList.length === 0) {
    return NextResponse.json(
      { error: "Instagram, YouTube, and Pinterest require an image or video file. Please attach media before scheduling." },
      { status: 400 }
    );
  }

  if (workspace_id) {
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("*")
      .eq("user_id", user.id)
      .eq("workspace_id", workspace_id)
      .single();

    if (!membership) return NextResponse.json({ error: "Not a member of this workspace." }, { status: 403 });
    if (!canPublish(membership.role as WorkspaceRole)) {
      return NextResponse.json({ error: "Only managers and owners can schedule for this workspace." }, { status: 403 });
    }
  }

  // Enforce tier quota for monthly scheduled posts
  const { entitlements, usage } = await getUserEntitlements(user.id);
  if (usage.scheduled_posts_count >= entitlements.maxScheduledPostsPerMonth) {
    return NextResponse.json(
      {
        error: `Monthly quota of ${entitlements.maxScheduledPostsPerMonth} scheduled posts reached for ${entitlements.name} plan. Please upgrade to schedule more posts.`,
        code: "QUOTA_EXCEEDED",
        metric: "scheduled_posts",
        limit: entitlements.maxScheduledPostsPerMonth,
        current: usage.scheduled_posts_count,
      },
      { status: 403 }
    );
  }

  const { data, error } = await supabase
    .from("scheduled_posts")
    .insert({
      user_id: user.id,
      workspace_id: workspace_id || null,
      workspace_draft_id: workspace_draft_id || null,
      title: title || "",
      description: description || "",
      media_urls: media_urls || [],
      platforms: platforms || [],
      scheduled_time,
      status: "pending",
      linkedin_media_urn: linkedin_media_urn || null,
      youtube_video_id: youtube_video_id || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Increment usage quota
  await incrementUsage(user.id, "scheduled_posts", 1);

  // Dispatch event to Inngest to sleep until scheduled_time and auto-publish
  if (data?.scheduled_time) {
    await schedulePostWithInngest({ postId: data.id, scheduledTime: data.scheduled_time });
  }

  return NextResponse.json({ post: data });
}
