"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Check, Lock, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RazorpayCheckoutButton } from "@/components/payments/RazorpayCheckoutButton";
import Link from "next/link";

interface PaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  featureName?: string;
  requiredTier?: "pro" | "plus";
}

export function PaywallModal({
  isOpen,
  onClose,
  title = "Unlock Premium Features",
  description = "This feature requires an active subscription to access.",
  featureName,
  requiredTier = "pro",
}: PaywallModalProps) {
  if (!isOpen) return null;

  const isPlus = requiredTier === "plus";

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute right-4 top-4 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Icon Badge */}
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#2f7867]/10 px-3 py-1 text-xs font-black uppercase tracking-wider text-[#2f7867]">
            <Lock className="h-3.5 w-3.5" />
            {isPlus ? "Plus / Agency Plan Required" : "Pro Plan Required"}
          </div>

          <h3 className="text-xl font-black text-[#1f2528]">{featureName ? `Unlock ${featureName}` : title}</h3>
          <p className="mt-1 text-sm text-slate-600">{description}</p>

          {/* Benefits list */}
          <div className="my-6 rounded-xl border border-slate-100 bg-[#f8faf9] p-4">
            <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-3">Included in {isPlus ? "Plus" : "Pro"}:</p>
            <ul className="space-y-2.5 text-sm text-[#1f2528]">
              {isPlus ? (
                <>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-[#2f7867] shrink-0" />
                    <span><strong>Unlimited</strong> connected social platforms</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-[#2f7867] shrink-0" />
                    <span><strong>1,000</strong> scheduled posts & 300 automated posts / month</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-[#2f7867] shrink-0" />
                    <span><strong>5 Team Workspaces</strong> with unlimited collaborators</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-[#2f7867] shrink-0" />
                    <span>Full AI Studio + 50,000 words + 150 AI images / month</span>
                  </li>
                </>
              ) : (
                <>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-[#2f7867] shrink-0" />
                    <span>Connect up to <strong>8 social networks</strong></span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-[#2f7867] shrink-0" />
                    <span><strong>150 scheduled posts</strong> & 50 automated posts / month</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-[#2f7867] shrink-0" />
                    <span>Full <strong>AI Studio</strong> (10,000 words + 25 AI images / month)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-[#2f7867] shrink-0" />
                    <span>Content Automation with Discord Webhook review pipeline</span>
                  </li>
                </>
              )}
            </ul>
          </div>

          {/* Checkout CTA */}
          <div className="flex flex-col gap-3">
            <RazorpayCheckoutButton
              amount={isPlus ? 399900 : 149900}
              name={isPlus ? "PostSync Plus" : "PostSync Pro"}
              description={isPlus ? "PostSync Plus — Monthly Subscription" : "PostSync Pro — Monthly Subscription"}
              tier={isPlus ? "plus" : "pro"}
              className="w-full justify-center py-3 text-sm font-bold shadow-md"
              variant="primary"
              onSuccess={() => {
                onClose();
                window.location.reload();
              }}
            >
              <Sparkles className="h-4 w-4" />
              Upgrade to {isPlus ? "Plus — ₹3,999 / mo" : "Pro — ₹1,499 / mo"}
            </RazorpayCheckoutButton>

            <Link
              href="/pricing"
              onClick={onClose}
              className="text-center text-xs font-semibold text-slate-400 hover:text-slate-600 transition"
            >
              Compare all plans & features →
            </Link>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}