// Postelligence extended types for Drafts, Library, Scheduling

export interface Draft {
  id: string;
  user_id: string;
  title: string;
  description: string;
  media_urls: string[];
  platforms: string[];
  created_at: string;
  updated_at: string;
}

export interface MediaLibraryItem {
  id: string;
  user_id: string;
  file_name: string;
  file_url: string;
  file_type: "image" | "video";
  file_size: number | null;
  uploaded_at: string;
}

export type ScheduledPostStatus = "pending" | "publishing" | "published" | "failed" | "cancelled";

export interface ScheduledPost {
  id: string;
  user_id: string;
  title: string;
  description: string;
  media_urls: string[];
  platforms: string[];
  scheduled_time: string;
  status: ScheduledPostStatus;
  created_at: string;
  updated_at: string;
  linkedin_media_urn?: string | null;
  youtube_video_id?: string | null;
  // Present only for posts scheduled from a Team Workspace. When set, the
  // scheduler publishes through the workspace's connected accounts instead
  // of user_id's personal accounts, and reports status back onto the draft.
  workspace_id?: string | null;
  workspace_draft_id?: string | null;
  platform_results?: Array<{
    platform: string;
    status: "published" | "skipped" | "failed";
    message: string;
    id?: string;
  }> | null;
}

import { IS_PINTEREST_LOCKED } from "@/lib/integrations/pinterest";

export type PlatformAvailability = {
  id: string;
  name: string;
  available: boolean;
  comingSoonReason?: string;
};

export const PLATFORM_CONFIG: PlatformAvailability[] = [
  { id: "linkedin", name: "LinkedIn", available: true },
  { id: "youtube", name: "YouTube", available: true },
  { id: "bluesky", name: "Bluesky", available: true },
  {
    id: "instagram",
    name: "Instagram",
    available: true,
    comingSoonReason: "Requires Meta Business and Developer verification.",
  },
  {
    id: "facebook",
    name: "Facebook",
    available: true,
    comingSoonReason: "Requires Meta Developer approval and business review.",
  },
  {
    id: "twitter",
    name: "X (Twitter)",
    available: false,
    comingSoonReason: "Integration under development.",
  },
  {
    id: "threads",
    name: "Threads",
    available: true,
    comingSoonReason: "Awaiting stable API support and Meta verification.",
  },
  {
    id: "pinterest",
    name: "Pinterest",
    available: !IS_PINTEREST_LOCKED,
    comingSoonReason: "Pinterest integration is currently locked and coming soon.",
  },
  {
    id: "reddit",
    name: "Reddit",
    available: false,
    comingSoonReason: "Reddit integration is awaiting developer approval.",
  },
  {
    id: "discord",
    name: "Discord",
    available: true,
  },
  {
    id: "telegram",
    name: "Telegram",
    available: true,
  },
];
// ============================================================
// TEAM WORKSPACE TYPES
// Add these to the bottom of lib/types.ts
// ============================================================

export type WorkspaceRole = "owner" | "manager" | "creator" | "analyst";

export type WorkspaceDraftStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "scheduled"
  | "published"
  | "failed";

export interface Workspace {
  id: string;
  name: string;
  description: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  joined_at: string;
  // Joined from auth.users via API
  email?: string;
  full_name?: string;
  avatar_url?: string;
}

export interface WorkspaceInvite {
  id: string;
  workspace_id: string;
  email: string;
  role: WorkspaceRole;
  token: string;
  invited_by: string;
  accepted: boolean;
  rejected: boolean;
  created_at: string;
  expires_at: string;
}

export interface WorkspaceDraft {
  id: string;
  workspace_id: string;
  created_by: string;
  title: string;
  description: string;
  media_urls: string[];
  platforms: string[];
  status: WorkspaceDraftStatus;
  submitted_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  linkedin_media_urn: string | null;
  youtube_video_id: string | null;
  scheduled_time: string | null;
  created_at: string;
  updated_at: string;
  // Joined from workspace_members via API
  creator_name?: string;
  creator_avatar?: string;
  reviewer_name?: string;
}

export interface WorkspaceDraftComment {
  id: string;
  draft_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  // Joined from auth.users / workspace_members via API
  user_name?: string;
  user_avatar?: string;
  user_role?: string | null;
}

export interface WorkspaceActivityLog {
  id: string;
  workspace_id: string;
  user_id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  // Joined from auth.users via API
  user_name?: string;
  user_avatar?: string;
}

// Context passed around the app for the current user's workspace state
export interface WorkspaceContext {
  workspace: Workspace | null;
  member: WorkspaceMember | null;
  role: WorkspaceRole | null;
  isInWorkspace: boolean;
}