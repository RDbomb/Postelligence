"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, HelpCircle, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { PageTransition } from "@/components/marketing/PageTransition";

const faqPricing = [
  {
    q: "Can I switch plans later?",
    a: "Absolutely. You can upgrade, downgrade, or cancel your subscription at any point. Downgrades take effect at the end of the current billing cycle, while upgrades take effect immediately."
  },
  {
    q: "Can I cancel my subscription anytime?",
    a: "Yes. Your subscription will remain active until the end of the current billing cycle, and you won't be charged again."
  },
  {
    q: "What payment methods are supported?",
    a: "We support UPI, Netbanking, and all major international and domestic credit/debit cards (Visa, MasterCard, RuPay, Amex) processed securely through Razorpay."
  },
  {
    q: "Is there a limit on connected channels?",
    a: "On the Starter plan, you can connect up to 4 platforms. Pro supports up to 8 connected platforms, and Plus grants access to all available networks."
  }
];

export default function PricingPage() {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annually">("annually");
  const [openFaq, setOpenFaq] = useState<number | null>(null);

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
        "90-day performance analytics",
        "Priority developer support",
      ],
    },
    {
      name: "Plus",
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
    <PageTransition>
      {/* Hero Header Section */}
      <section className="marketing-page-hero px-5 pb-10 pt-[100px] md:px-8 md:pb-14 md:pt-[110px]">
        <div className="mx-auto max-w-3xl text-center">
          <p className="marketing-eyebrow">Pricing Plans</p>
          <h1 className="marketing-display mt-5 leading-tight">
            Simple plans. Serious results.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-[#4f5b62]">
            Start free. Upgrade when you are ready to expand your reach. Clear billing, no surprises, cancel anytime.
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
      </section>

      {/* Pricing Cards Grid Section */}
      <section className="px-5 pb-16 md:px-8">
        <div className="mx-auto grid max-w-6xl gap-5 sm:gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => {
            const priceVal = getPrice(plan.name);
            return (
              <motion.div
                key={plan.name}
                whileHover={{ y: -6 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                onMouseMove={handleMouseMove}
                className="glow-card rounded-[28px] sm:rounded-[32px] border border-[#1f2528]/8 bg-white overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.025)] flex flex-col justify-between"
              >
                <article
                  className={
                    plan.featured 
                      ? "marketing-pricing-card marketing-pricing-card-featured h-full relative z-20 p-6 sm:p-8 flex flex-col justify-between" 
                      : "marketing-pricing-card h-full relative z-20 p-6 sm:p-8 flex flex-col justify-between"
                  }
                >
                  <div>
                    {plan.featured && (
                      <span className="absolute top-4 right-4 bg-[#2f7867] text-white text-[9px] font-black uppercase tracking-wider px-3 py-1 rounded-full shadow-sm">
                        Most popular
                      </span>
                    )}

                    <div className="text-left">
                      <h2 className="text-xl font-black tracking-tight text-[#1f2528]">{plan.name}</h2>
                      <p className="mt-2 text-xs leading-relaxed text-slate-500 font-semibold">{plan.description}</p>
                    </div>

                    <div className="mt-8 text-left border-b border-slate-100 pb-6">
                      <div className="flex items-baseline gap-1.5">
                        <AnimatePresence mode="wait">
                          <motion.span 
                            key={priceVal}
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 4 }}
                            transition={{ duration: 0.2 }}
                            className="text-5xl font-black tracking-tight text-[#1f2528]"
                          >
                            {priceVal}
                          </motion.span>
                        </AnimatePresence>
                        {priceVal !== "Free" && (
                          <span className="text-sm text-slate-400 font-bold">/mo</span>
                        )}
                      </div>
                      <p className="mt-1 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                        {priceVal === "Free" ? "forever" : billingCycle === "annually" ? "billed annually" : "billed monthly"}
                      </p>
                    </div>

                    <ul className="mt-8 space-y-4 text-left">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-3 text-xs text-[#3b444a] font-semibold leading-normal">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#2f7867] stroke-[3]" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <Link
                    href="/login"
                    className={
                      plan.featured
                        ? "inline-flex items-center justify-center gap-1.5 rounded-full bg-[#2f7867] hover:bg-[#205146] px-6 py-3.5 text-xs font-black uppercase tracking-wider text-white shadow-md hover:shadow-none transition-all duration-300 w-full mt-10 cursor-pointer"
                        : "inline-flex items-center justify-center gap-1.5 rounded-full border border-[#1f2528]/10 bg-slate-50 hover:bg-slate-100 px-6 py-3.5 text-xs font-black uppercase tracking-wider text-[#1f2528] transition-all duration-300 w-full mt-10 cursor-pointer"
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
      </section>

      {/* Contact Sales for custom needs block */}
      <section className="px-5 pb-16 md:px-8 -mt-4">
        <div className="mx-auto max-w-6xl rounded-3xl border border-dashed border-[#1f2528]/15 bg-[#fbfbf9]/60 p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6 text-left">
          <div>
            <h4 className="text-base font-black text-[#1f2528] tracking-tight">Are your needs more than this?</h4>
            <p className="text-xs text-slate-500 mt-1.5 font-semibold">For enterprise branding, custom webhook automation arrays, or dedicated account managers.</p>
          </div>
          <Link
            href="/contact"
            className="inline-flex items-center gap-1.5 rounded-full bg-[#1f2528] hover:bg-[#2e363b] px-6 py-3 text-xs font-black uppercase tracking-wider transition-all duration-300 cursor-pointer shrink-0"
            style={{ color: "#ffffff" }}
          >
            <span className="text-white" style={{ color: "#ffffff" }}>Contact Sales</span>
            <ArrowRight className="h-3.5 w-3.5 text-white" style={{ color: "#ffffff" }} />
          </Link>
        </div>
      </section>

      {/* Pricing FAQs Accordion Section */}
      <section className="px-5 pb-28 md:px-8 border-t border-slate-100 pt-20">
        <div className="mx-auto max-w-3xl">
          <div className="text-center mb-12">
            <p className="marketing-eyebrow">FAQs</p>
            <h2 className="text-3xl font-black text-[#1f2528] tracking-tight mt-4">Pricing Questions</h2>
          </div>

          <div className="space-y-4">
            {faqPricing.map((item, index) => {
              const isOpen = openFaq === index;
              return (
                <div 
                  key={index}
                  className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden"
                >
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : index)}
                    className="w-full flex items-center justify-between p-5 text-left font-black text-sm text-[#1f2528] focus:outline-none cursor-pointer"
                  >
                    <span className="flex items-center gap-2.5">
                      <HelpCircle className="h-4.5 w-4.5 text-[#2f7867] shrink-0" />
                      {item.q}
                    </span>
                    <span className="text-xl font-bold text-slate-400 leading-none">
                      {isOpen ? "−" : "+"}
                    </span>
                  </button>
                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: "easeInOut" }}
                      >
                        <div className="px-5 pb-5 pt-1 text-xs leading-relaxed text-[#4f5b62] font-semibold border-t border-slate-100 bg-slate-50/50">
                          {item.a}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>

          <p className="mt-12 text-center text-xs leading-relaxed text-[#7b858d] font-semibold">
            All transaction queries, GST invoicing details, and subscription handles are processed securely. Cancel anytime.
          </p>
        </div>
      </section>
    </PageTransition>
  );
}
