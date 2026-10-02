"use client";

import React, { createContext, useContext, useState } from "react";
import type { TierEntitlements, TierId, UserSubscription, UserUsage } from "@/lib/subscriptions/entitlements";
import { TIER_CONFIG } from "@/lib/subscriptions/entitlements";

export interface SubscriptionContextValue {
  tier: TierId;
  entitlements: TierEntitlements;
  isProOrPlus: boolean;
  isPlus: boolean;
  subscription?: UserSubscription | null;
  usage?: UserUsage | null;
  refreshSubscription?: () => Promise<void>;
}

const defaultContextValue: SubscriptionContextValue = {
  tier: "starter",
  entitlements: TIER_CONFIG.starter,
  isProOrPlus: false,
  isPlus: false,
  subscription: null,
  usage: null,
};

const SubscriptionContext = createContext<SubscriptionContextValue>(defaultContextValue);

export function SubscriptionProvider({
  value,
  children,
}: {
  value?: Partial<SubscriptionContextValue> | null;
  children: React.ReactNode;
}) {
  const [overrideData, setOverrideData] = useState<SubscriptionContextValue | null>(null);

  const tier = overrideData?.tier ?? value?.tier ?? "starter";
  const entitlements =
    overrideData?.entitlements ??
    value?.entitlements ??
    (value?.tier ? TIER_CONFIG[value.tier] : TIER_CONFIG.starter);
  const isProOrPlus =
    overrideData?.isProOrPlus ??
    value?.isProOrPlus ??
    (tier === "pro" || tier === "plus");
  const isPlus =
    overrideData?.isPlus ??
    value?.isPlus ??
    (tier === "plus");
  const subscription = overrideData?.subscription ?? value?.subscription ?? null;
  const usage = overrideData?.usage ?? value?.usage ?? null;

  const refreshSubscription = async () => {
    try {
      const res = await fetch("/api/subscriptions/current");
      if (res.ok) {
        const data = await res.json();
        setOverrideData({
          tier: data.tier || "starter",
          entitlements: data.entitlements || TIER_CONFIG.starter,
          isProOrPlus: Boolean(data.isProOrPlus),
          isPlus: Boolean(data.isPlus),
          subscription: data.subscription ?? null,
          usage: data.usage ?? null,
        });
      }
    } catch {
      // silent fallback
    }
  };

  const contextValue: SubscriptionContextValue = {
    tier,
    entitlements,
    isProOrPlus,
    isPlus,
    subscription,
    usage,
    refreshSubscription,
  };

  return (
    <SubscriptionContext.Provider value={contextValue}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription(): SubscriptionContextValue {
  return useContext(SubscriptionContext);
}
