import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { runScheduler } from "@/lib/scheduler/auto-publisher";
import { executeAutomationForUser, scheduleNextAutomationSlot } from "@/lib/automation/engine";

/**
 * Inngest Function: Publish Scheduled Post
 * Triggered when a "post/scheduled" event is sent.
 * Sleeps in Inngest cloud until `scheduledTime` and then publishes the post.
 */
export const publishScheduledPost = inngest.createFunction(
  {
    id: "publish-scheduled-post",
    name: "Publish Scheduled Social Post",
    triggers: [{ event: "post/scheduled" }],
  },
  async ({ event, step }) => {
    const eventData = event.data as { scheduledTime?: string; postId?: string };
    const scheduledTime = eventData?.scheduledTime;
    const postId = eventData?.postId;

    // Step 1: Sleep until the target scheduled publish time
    if (scheduledTime) {
      await step.sleepUntil("wait-for-target-publish-time", scheduledTime);
    }

    // Step 2: Invoke the auto-publisher engine to claim & publish the post
    const result = await step.run("execute-publisher", async () => {
      console.log(`[Inngest] Executing publisher for post ID: ${postId || "all due"}`);
      return await runScheduler();
    });

    return {
      success: true,
      postId: postId || null,
      ranAt: new Date().toISOString(),
      result,
    };
  }
);

/**
 * Inngest Function: Autonomous Content Generation Loop (Self-Chaining)
 * Triggered by "automation/loop".
 * Sleeps in Inngest cloud until `scheduledTime` (10 minutes before user's posting time),
 * scrapes trends, generates the post with Gemini + image, dispatches to queue or Discord review,
 * then self-chains by calculating the NEXT slot and sending the next "automation/loop" event!
 * Zero cron polling required!
 */
export const automationLoop = inngest.createFunction(
  {
    id: "automation-loop",
    name: "Autonomous Content Generation Loop",
    triggers: [{ event: "automation/loop" }],
    cancelOn: [
      {
        event: "automation/cancelled",
        match: "data.userId",
      },
      {
        event: "automation/loop",
        match: "data.userId",
      },
    ],
  },
  async ({ event, step }) => {
    const eventData = event.data as {
      userId?: string;
      scheduledTime?: string;
      timeSlot?: string;
    };
    const userId = eventData?.userId;
    const scheduledTime = eventData?.scheduledTime;
    const timeSlot = eventData?.timeSlot;

    if (!userId) {
      return { skipped: true, reason: "No userId provided in event" };
    }

    // Step 1: Sleep until the target execution time (10 min before posting)
    if (scheduledTime) {
      await step.sleepUntil("wait-for-automation-slot", scheduledTime);
    }

    // Step 2: Execute automation generation (trend scrape, AI caption, image generation, auto-schedule or manual approval)
    const result = await step.run("execute-automation-generation", async () => {
      console.log(`[Inngest] Executing autonomous generation for user: ${userId}, slot: ${timeSlot || "default"}`);
      return await executeAutomationForUser(userId, timeSlot);
    });

    // Step 3: Self-chain to the next slot
    await step.run("schedule-next-slot", async () => {
      console.log(`[Inngest] Calculating and scheduling next slot for user: ${userId}`);
      return await scheduleNextAutomationSlot(userId);
    });

    return {
      success: true,
      userId,
      ranAt: new Date().toISOString(),
      result,
    };
  }
);

// Create and export Next.js API route handlers for GET, POST, and PUT
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [publishScheduledPost, automationLoop],
});