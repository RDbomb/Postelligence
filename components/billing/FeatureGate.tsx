"use client";

import { useEffect, useState, ReactNode } from "react";
import { Lock, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PaywallModal } from "@/components/billing/PaywallModal";
import type { TierEntitlements, TierId } from "@/lib/subscriptions/entitlements";

interface FeatureGateProps {
  feature: keyof TierEntitlements;
  featureName: string;
  requiredTier?: "pro" | "plus";
  description?: string;
  children: ReactNode;
}

export function FeatureGate({
  feature,
  featureName,
  requiredTier = "pro",
  description,
  children,
}: FeatureGateProps) {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    async function checkEntitlement() {
      try {
        const res = await fetch("/api/subscriptions/current");
        if (!res.ok) {
          setAllowed(false);
          return;
        }
        const data = await res.json();
        const entitlements = data.entitlements as TierEntitlements | undefined;
        if (entitlements && typeof entitlements[feature] === "boolean") {
          setAllowed(Boolean(entitlements[feature]));
        } else {
          setAllowed(false);
        }
      } catch {
        setAllowed(false);
      }
    }

    checkEntitlement();
  }, [feature]);

  // Loading state
  if (allowed === null) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#2f7867]" />
      </div>
    );
  }

  // Feature allowed: render content
  if (allowed) {
    return <>{children}</>;
  }

  // Feature locked: render sleek paywall barrier card
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#2f7867]/10 text-[#2f7867] shadow-sm">
        <Lock className="h-6 w-6" />
      </div>

      <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
        <Sparkles className="h-3.5 w-3.5 text-[#2f7867]" />
        {requiredTier === "plus" ? "Plus / Agency Plan Feature" : "Pro Plan Feature"}
      </div>

      <h3 className="text-2xl font-black text-[#1f2528]">{featureName} is Locked</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
        {description ||
          `Upgrade to the ${requiredTier === "plus" ? "Plus" : "Pro"} tier to unlock unlimited access to ${featureName} and scale your social audience.`}
      </p>

      <div className="mt-6 flex justify-center gap-3">
        <Button
          variant="primary"
          onClick={() => setModalOpen(true)}
          className="px-6 py-2.5 font-bold shadow-md"
        >
          <Sparkles className="h-4 w-4" />
          Unlock {featureName}
        </Button>
      </div>

      <PaywallModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        featureName={featureName}
        requiredTier={requiredTier}
      />
    </div>
  );
}