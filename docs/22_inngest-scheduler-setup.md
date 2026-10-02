# 22_ Inngest Background Scheduler Integration

This document outlines the complete migration from traditional cron polling (Vercel Cron / Supabase `pg_cron`) to **Inngest Event-Driven Background Jobs**.

---

## 1. Overview & Architecture

Instead of running heavy database polling every minute to check for due posts:
1. When a post or draft is scheduled (via Solo Compose, Team Workspace, or AI Automation), the API dispatches a `post/scheduled` event to Inngest with the target ISO timestamp.
2. Inngest holds the execution timer in cloud memory using `step.sleepUntil("wait-for-target-publish-time", scheduledTime)`.
3. When the target time arrives, Inngest triggers an incoming webhook to `/api/inngest`, executing the auto-publisher engine (`runScheduler()`) with **0% database overhead** during the waiting period.

---

## 2. Key Files Created & Modified

*   **[`lib/inngest/client.ts`](file:///C:/Users/HP/Desktop/abcdef/PostSync/lib/inngest/client.ts):** Inngest client initialization and `schedulePostWithInngest()` helper.
*   **[`app/api/inngest/route.ts`](file:///C:/Users/HP/Desktop/abcdef/PostSync/app/api/inngest/route.ts):** Next.js App Router handlers (`GET`, `POST`, `PUT`) exposing `publishScheduledPost`.
*   **[`scripts/inngest-https-proxy.js`](file:///C:/Users/HP/Desktop/abcdef/PostSync/scripts/inngest-https-proxy.js):** Local HTTP-to-HTTPS dev proxy to bypass Go self-signed SSL certificate errors when testing locally on `https://localhost:3000`.

---

## 3. Environment Variables

Add the following keys to your `.env.local` and Vercel Environment Variables:

```env
INNGEST_EVENT_KEY=your_inngest_event_key
INNGEST_SIGNING_KEY=your_inngest_signing_key
```

---

## 4. Local Development & Demo Commands

To run local testing on your laptop with HTTPS (`https://localhost:3000`):

1. **Terminal 1 (Website):**
   ```bash
   yarn dev:https
   ```
2. **Terminal 2 (HTTPS Proxy):**
   ```bash
   node scripts/inngest-https-proxy.js
   ```
3. **Terminal 3 (Inngest Dev Server):**
   ```bash
   npx inngest-cli@latest dev -u http://localhost:3001/api/inngest --no-discovery
   ```

Open `http://localhost:8288` in your browser to view live events, timers, and execution logs!
