"use client";

import { Crown, Sparkles, Zap } from "lucide-react";
import type { TierId } from "@/lib/subscriptions/entitlements";

interface PlanBadgeProps {
  tier?: TierId | string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function PlanBadge({ tier = "starter", size = "sm", className = "" }: PlanBadgeProps) {
  const normalizedTier = (tier || "starter").toLowerCase();

  const configs: Record<string, { label: string; icon: typeof Zap; color: string; bg: string; border: string }> = {
    starter: {
      label: "Starter",
      icon: Zap,
      color: "text-slate-600",
      bg: "bg-slate-100",
      border: "border-slate-200",
    },
    pro: {
      label: "Pro",
      icon: Sparkles,
      color: "text-[#2f7867]",
      bg: "bg-[#2f7867]/10",
      border: "border-[#2f7867]/25",
    },
    plus: {
      label: "Plus / VIP",
      icon: Crown,
      color: "text-amber-700",
      bg: "bg-amber-500/10",
      border: "border-amber-500/30",
    },
  };

  const config = configs[normalizedTier] || configs.starter;
  const Icon = config.icon;

  const sizeClasses = {
    sm: "px-2 py-0.5 text-[11px] gap-1",
    md: "px-2.5 py-1 text-xs gap-1.5",
    lg: "px-3 py-1.5 text-sm gap-2",
  };

  return (
    <span
      className={`inline-flex items-center font-bold rounded-full border shadow-sm ${config.bg} ${config.border} ${config.color} ${sizeClasses[size]} ${className}`}
    >
      <Icon className={size === "sm" ? "h-3 w-3" : size === "md" ? "h-3.5 w-3.5" : "h-4 w-4"} />
      {config.label}
    </span>
  );
}