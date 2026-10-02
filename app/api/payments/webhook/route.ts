import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { setUserTier } from "@/lib/subscriptions/entitlements";
import { createClient as createBaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function verifyWebhookSignature(body: string, signature: string | null, secret: string) {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  const receivedBuf = Buffer.from(signature, "utf8");
  if (expectedBuf.length !== receivedBuf.length) return false;
  return timingSafeEqual(expectedBuf, receivedBuf);
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature");
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  if (webhookSecret) {
    const isValid = verifyWebhookSignature(rawBody, signature, webhookSecret);
    if (!isValid) {
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
    }
  }

  let event: Record<string, unknown> = {};
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventType = event.event as string;
  const payload = event.payload as Record<string, unknown> | undefined;

  try {
    // 1. Successful payment or recurring subscription charge
    if (eventType === "subscription.charged" || eventType === "payment.captured") {
      const paymentEntity = (payload?.payment as Record<string, unknown>)?.entity as Record<string, unknown> | undefined;
      const notes = (paymentEntity?.notes as Record<string, string>) || {};
      const userId = notes.user_id;

      if (userId) {
        // Upgrade tier (default to pro, or plus if marked in notes)
        const tier = notes.tier === "plus" ? "plus" : "pro";
        await setUserTier({
          userId,
          tier,
          billingType: "razorpay",
          status: "active",
          periodDays: 30,
          razorpayPaymentId: paymentEntity?.id as string | undefined,
        });

        // Reset user usage counters for the new billing cycle
        const supabase = createBaseClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );
        await supabase
          .from("user_usage")
          .upsert({
            user_id: userId,
            scheduled_posts_count: 0,
            automated_posts_count: 0,
            ai_words_generated: 0,
            ai_images_generated: 0,
            period_start: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: "user_id" });
      }
    }

    // 2. Subscription cancelled
    if (eventType === "subscription.cancelled") {
      const subEntity = (payload?.subscription as Record<string, unknown>)?.entity as Record<string, unknown> | undefined;
      const subId = subEntity?.id as string;
      if (subId) {
        const supabase = createBaseClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );
        await supabase
          .from("user_subscriptions")
          .update({ cancel_at_period_end: true, status: "cancelled", updated_at: new Date().toISOString() })
          .eq("razorpay_subscription_id", subId);
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Razorpay webhook processing error:", err);
    return NextResponse.json({ error: "Webhook processing error" }, { status: 500 });
  }
}