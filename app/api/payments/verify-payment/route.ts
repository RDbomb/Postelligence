import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { parseJsonBody } from "@/lib/validation/http";
import { isValidPaymentSignature } from "@/lib/payments/razorpay";
import { setUserTier } from "@/lib/subscriptions/entitlements";

/**
 * Verifies the signature returned by Razorpay Checkout on a successful payment
 * and upgrades the user's account to the Pro tier in Supabase.
 */
const VerifyPaymentBody = z.object({
  razorpay_order_id: z.string().trim().min(1),
  razorpay_payment_id: z.string().trim().min(1),
  razorpay_signature: z.string().trim().min(1),
  tier: z.enum(["pro", "plus"]).optional().default("pro"),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = await parseJsonBody(req, VerifyPaymentBody);
  if (!parsed.success) return parsed.response;

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, tier } =
    parsed.data;

  const valid = isValidPaymentSignature({
    orderId: razorpay_order_id,
    paymentId: razorpay_payment_id,
    signature: razorpay_signature,
  });

  if (!valid) {
    return NextResponse.json(
      { verified: false, error: "Payment signature verification failed." },
      { status: 400 },
    );
  }

  try {
    // Persist active subscription & upgrade user tier in Supabase
    await setUserTier({
      userId: user.id,
      tier,
      billingType: "razorpay",
      status: "active",
      periodDays: 30,
      razorpayPaymentId: razorpay_payment_id,
    });

    return NextResponse.json({
      verified: true,
      payment_id: razorpay_payment_id,
      order_id: razorpay_order_id,
      tier,
    });
  } catch (dbErr) {
    console.error("Failed to persist subscription in database:", dbErr);
    return NextResponse.json(
      { error: "Payment verified but subscription activation failed." },
      { status: 500 },
    );
  }
}