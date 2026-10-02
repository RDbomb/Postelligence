"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ArrowRight, Sparkles, Zap, Crown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function PricingSection({ showTitle = true }: { showTitle?: boolean }) {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annually">("annually");

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    e.currentTarget.style.setProperty("--mouse-x", `${x}px`);
    e.currentTarget.style.setProperty("--mouse-y", `${y}px`);
  };

  const getPrice = (planName: string) => {
    if (planName === "Starter") return "Free";
    if (planName === "Pro") {
      return billingCycle === "annually" ? "₹1,199" : "₹1,499";
    }
    // Plus
    return billingCycle === "annually" ? "₹3,199" : "₹3,999";
  };

  const plans = [
    {
      name: "Starter",
      badge: "Free Tier",
      icon: Zap,
      iconColor: "text-slate-600",
      iconBg: "bg-slate-100",
      description: "Essential social publishing for solo creators getting started.",
      cta: "Get started free",
      featured: false,
      features: [
        "Up to 4 connected social accounts",
        "10 scheduled posts / month",
        "1,000 AI words / month",
        "Personal media library",
        "7-day analytics retention",
        "Standard community support",
      ],
    },
    {
      name: "Pro",
      badge: "Most Popular",
      icon: Sparkles,
      iconColor: "text-[#2f7867]",
      iconBg: "bg-[#2f7867]/10",
      description: "For active founders and creators publishing consistently across channels.",
      cta: "Upgrade to Pro",
      featured: true,
      features: [
        "Up to 8 connected social accounts",
        "150 scheduled posts / month",
        "50 automated posts / month",
        "AI Studio (10,000 words + 25 AI images / mo)",
        "Content Automation with Discord review",
        "1 Team Workspace (up to 3 members)",
        "90-day analytics retention",
        "Priority developer support",
      ],
    },
    {
      name: "Plus",
      badge: "Agency / VIP",
      icon: Crown,
      iconColor: "text-amber-700",
      iconBg: "bg-amber-500/10",
      description: "Maximum power and unlimited scale for brands, agencies, and teams.",
      cta: "Upgrade to Plus",
      featured: false,
      features: [
        "Unlimited connected accounts (All platforms)",
        "1,000 scheduled posts / month",
        "300 automated posts / month",
        "Full AI Studio (50,000 words + 150 AI images / mo)",
        "Background event-driven automated loop",
        "5 Team Workspaces (unlimited collaborators)",
        "365-day analytics retention & export reports",
        "Dedicated priority VIP support",
      ],
    },
  ];

  return (
    <section className="px-5 py-16 md:px-8 md:py-24">
      <div className="mx-auto max-w-6xl">
        {showTitle && (
          <div className="text-center mb-12">
            <p className="marketing-eyebrow">Pricing Plans</p>
            <h2 className="marketing-section-title mt-4">
              Simple, transparent pricing.
            </h2>
            <p className="mt-4 text-[1.05rem] leading-relaxed text-[#4f5b62] max-w-xl mx-auto">
              Choose the tier that matches your publishing scale. Upgrade or cancel anytime with zero friction.
            </p>

            {/* Billing Cycle Switcher Toggle */}
            <div className="mt-8 flex items-center justify-center gap-3">
              <span
                className={`text-xs font-black uppercase tracking-wider transition-colors ${
                  billingCycle === "monthly" ? "text-[#1f2528]" : "text-slate-400"
                }`}
              >
                Monthly
              </span>
              <button
                type="button"
                onClick={() => setBillingCycle((prev) => (prev === "monthly" ? "annually" : "monthly"))}
                className="w-12 h-6.5 rounded-full bg-slate-100 border border-slate-200 p-0.5 relative transition-colors focus:outline-none cursor-pointer"
                aria-label="Toggle billing cycle"
              >
                <motion.div
                  layout
                  className="h-5 w-5 rounded-full bg-[#2f7867]"
                  style={{ float: billingCycle === "annually" ? "right" : "left" }}
                />
              </button>
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs font-black uppercase tracking-wider transition-colors ${
                    billingCycle === "annually" ? "text-[#1f2528]" : "text-slate-400"
                  }`}
                >
                  Annually
                </span>
                <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[#2f7867] tracking-wider animate-pulse">
                  Save 20%
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Pricing Cards Grid */}
        <div className="grid max-w-6xl gap-5 sm:gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => {
            const priceVal = getPrice(plan.name);
            const Icon = plan.icon;
            return (
              <motion.div
                key={plan.name}
                whileHover={{ y: -6 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                onMouseMove={handleMouseMove}
                className={`glow-card rounded-[28px] sm:rounded-[32px] border bg-white overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.025)] flex flex-col justify-between ${
                  plan.featured
                    ? "border-[#2f7867]/30 ring-2 ring-[#2f7867]/15"
                    : "border-[#1f2528]/8"
                }`}
              >
                <article className="h-full relative z-20 p-6 sm:p-8 flex flex-col justify-between text-left">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${plan.iconBg} ${plan.iconColor}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <span
                        className={`text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full ${
                          plan.featured
                            ? "bg-[#2f7867] text-white shadow-sm"
                            : "bg-slate-100 text-slate-600 border border-slate-200"
                        }`}
                      >
                        {plan.badge}
                      </span>
                    </div>

                    <div>
                      <h3 className="text-xl font-black tracking-tight text-[#1f2528]">{plan.name}</h3>
                      <p className="mt-2 text-xs leading-relaxed text-slate-500 font-semibold min-h-[32px]">
                        {plan.description}
                      </p>
                    </div>

                    <div className="mt-6 border-b border-slate-100 pb-6">
                      <div className="flex items-baseline gap-1.5">
                        <AnimatePresence mode="wait">
                          <motion.span
                            key={priceVal}
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 4 }}
                            transition={{ duration: 0.2 }}
                            className="text-4xl sm:text-5xl font-black tracking-tight text-[#1f2528]"
                          >
                            {priceVal}
                          </motion.span>
                        </AnimatePresence>
                        {priceVal !== "Free" && (
                          <span className="text-sm text-slate-400 font-bold">/mo</span>
                        )}
                      </div>
                      <p className="mt-1 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                        {priceVal === "Free"
                          ? "forever free"
                          : billingCycle === "annually"
                          ? "billed annually (save 20%)"
                          : "billed monthly"}
                      </p>
                    </div>

                    <ul className="mt-6 space-y-3.5">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-3 text-xs text-[#3b444a] font-semibold leading-normal">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#2f7867] stroke-[3]" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <Link
                    href={plan.name === "Starter" ? "/login" : "/settings"}
                    className={
                      plan.featured
                        ? "inline-flex items-center justify-center gap-1.5 rounded-full bg-[#2f7867] hover:bg-[#205146] px-6 py-3.5 text-xs font-black uppercase tracking-wider text-white shadow-md hover:shadow-none transition-all duration-300 w-full mt-8 cursor-pointer"
                        : "inline-flex items-center justify-center gap-1.5 rounded-full border border-[#1f2528]/10 bg-slate-50 hover:bg-slate-100 px-6 py-3.5 text-xs font-black uppercase tracking-wider text-[#1f2528] transition-all duration-300 w-full mt-8 cursor-pointer"
                    }
                  >
                    {plan.cta}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </article>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
