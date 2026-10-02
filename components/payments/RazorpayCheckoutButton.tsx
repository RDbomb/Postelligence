"use client";

import * as React from "react";
import { Button, type ButtonProps } from "@/components/ui/button";

/**
 * Razorpay Standard Checkout button.
 *
 * Flow, all client-side:
 *   1. POST /api/payments/create-order  → { order_id, amount, currency }
 *   2. Open the Razorpay modal with that order_id
 *   3. On success, POST the three razorpay_* fields to
 *      /api/payments/verify-payment and surface the verified result
 *
 * The Checkout script (checkout.js) is loaded lazily on first click, so pages
 * that render this button don't pay for the script unless the user pays.
 *
 * Only NEXT_PUBLIC_RAZORPAY_KEY_ID is used here — the secret stays on the server
 * and signs/verifies everything the browser cannot be trusted to.
 */

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

// Minimal shape of the Razorpay Checkout global we use.
interface RazorpaySuccessResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  order_id: string;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
  handler: (response: RazorpaySuccessResponse) => void;
  modal?: { ondismiss?: () => void };
}

interface RazorpayInstance {
  open: () => void;
  on: (event: "payment.failed", cb: (response: unknown) => void) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

function loadCheckoutScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window !== "undefined" && window.Razorpay) return resolve();

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${CHECKOUT_SRC}"]`,
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("Failed to load Razorpay Checkout.")),
      );
      return;
    }

    const script = document.createElement("script");
    script.src = CHECKOUT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Failed to load Razorpay Checkout."));
    document.body.appendChild(script);
  });
}

export interface RazorpayCheckoutButtonProps
  extends Omit<ButtonProps, "onClick" | "onError" | "children"> {
  /** Amount in the smallest currency unit (paise for INR). Minimum 100. */
  amount: number;
  currency?: string;
  /** Title shown in the Checkout modal. */
  name?: string;
  description?: string;
  /** Desired subscription tier to activate upon payment verification. Defaults to 'pro' or 'plus' based on amount. */
  tier?: "pro" | "plus";
  /** Optional prefill for the payer's details. */
  prefill?: { name?: string; email?: string; contact?: string };
  children?: React.ReactNode;
  onSuccess?: (result: { payment_id: string; order_id: string }) => void;
  onError?: (message: string) => void;
}

export function RazorpayCheckoutButton({
  amount,
  currency = "INR",
  name = "PostSync",
  description,
  tier,
  prefill,
  children = "Pay now",
  onSuccess,
  onError,
  disabled,
  ...buttonProps
}: RazorpayCheckoutButtonProps) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const fail = React.useCallback(
    (message: string) => {
      setError(message);
      onError?.(message);
    },
    [onError],
  );

  async function handleClick() {
    setError(null);
    setLoading(true);

    const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    if (!keyId) {
      setLoading(false);
      return fail("Payments are not configured.");
    }

    try {
      // 1. Create the order server-side.
      const orderRes = await fetch("/api/payments/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, currency }),
      });
      const orderData = await orderRes.json();
      if (!orderRes.ok) {
        throw new Error(orderData.error ?? "Could not start the payment.");
      }

      // 2. Load Checkout and open the modal.
      await loadCheckoutScript();
      if (!window.Razorpay) throw new Error("Razorpay Checkout unavailable.");

      const rzp = new window.Razorpay({
        key: keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name,
        description,
        order_id: orderData.order_id,
        prefill,
        theme: { color: "#2f7867" },
        handler: async (response) => {
          // 3. Verify the signature server-side before treating it as paid.
          try {
            const targetTier = tier || (amount >= 300000 ? "plus" : "pro");
            const verifyRes = await fetch("/api/payments/verify-payment", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...response, tier: targetTier }),
            });
            const verifyData = await verifyRes.json();
            if (!verifyRes.ok || !verifyData.verified) {
              throw new Error(
                verifyData.error ?? "Payment could not be verified.",
              );
            }
            onSuccess?.({
              payment_id: verifyData.payment_id,
              order_id: verifyData.order_id,
            });
          } catch (verifyErr) {
            fail(
              verifyErr instanceof Error
                ? verifyErr.message
                : "Payment verification failed.",
            );
          } finally {
            setLoading(false);
          }
        },
        modal: {
          // User closed the modal without paying.
          ondismiss: () => {
            setLoading(false);
            fail("Payment cancelled.");
          },
        },
      });

      rzp.on("payment.failed", (response) => {
        setLoading(false);
        const reason =
          typeof response === "object" &&
          response !== null &&
          "error" in response
            ? (response as { error?: { description?: string } }).error
                ?.description
            : undefined;
        fail(reason ?? "Payment failed. Please try again.");
      });

      rzp.open();
    } catch (err) {
      setLoading(false);
      fail(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        onClick={handleClick}
        disabled={disabled || loading}
        {...buttonProps}
      >
        {loading ? "Processing…" : children}
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
