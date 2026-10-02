import { Inngest } from "inngest";

export interface SchedulePostEventData {
  postId?: string;
  scheduledTime: string; // ISO string timestamp (e.g. "2026-07-25T15:00:00Z")
  workspaceId?: string;
}

export interface AutomationLoopEventData {
  userId: string;
  scheduledTime: string; // ISO string timestamp to run at (e.g. 10 mins before posting time)
  timeSlot?: string; // e.g. "09:00:00"
}

if (process.env.NODE_ENV === "development") {
  process.env.INNGEST_DEV = "1";
}

// Initialize the Inngest client with App ID
export const inngest = new Inngest({
  id: "post-sync",
  isDev: process.env.NODE_ENV === "development",
});

/**
 * Helper function to send a scheduled post event to Inngest.
 * Inngest will sleep until `scheduledTime` and then execute post publishing.
 */
export async function schedulePostWithInngest(data: SchedulePostEventData) {
  try {
    await inngest.send({
      name: "post/scheduled",
      data: {
        postId: data.postId,
        scheduledTime: data.scheduledTime,
        workspaceId: data.workspaceId,
      },
    });
    console.log("[Inngest] Scheduled post event sent successfully", data);
  } catch (error) {
    console.error("[Inngest] Failed to send scheduled post event", error);
  }
}

/**
 * Sends an event to initiate or continue the autonomous content generation loop.
 */
export async function sendAutomationLoopEvent(data: AutomationLoopEventData) {
  try {
    await inngest.send({
      name: "automation/loop",
      data: {
        userId: data.userId,
        scheduledTime: data.scheduledTime,
        timeSlot: data.timeSlot,
      },
    });
    console.log("[Inngest] Automation loop event sent successfully", data);
  } catch (error) {
    console.error("[Inngest] Failed to send automation loop event", error);
  }
}

/**
 * Sends an event to cancel any active automation sleep/loop for a user.
 */
export async function cancelAutomationLoop(userId: string) {
  try {
    await inngest.send({
      name: "automation/cancelled",
      data: {
        userId,
      },
    });
    console.log("[Inngest] Automation loop cancelled for user", userId);
  } catch (error) {
    console.error("[Inngest] Failed to cancel automation loop", error);
  }
}