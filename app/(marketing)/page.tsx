"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Globe2,
  Layers3,
  PenLine,
  Sparkles,
  TrendingUp,
  Zap
} from "lucide-react";
import { PageTransition } from "@/components/marketing/PageTransition";
import { PlatformMarquee } from "@/components/marketing/PlatformMarquee";
import { Reveal } from "@/components/marketing/Reveal";
import { StatCounter } from "@/components/marketing/StatCounter";
import { Faq } from "@/components/marketing/Faq";
import { RotatingWord } from "@/components/marketing/RotatingWord";
import { ProductFlowDemo } from "@/components/marketing/ProductFlowDemo";
import { HomeHeroVisual } from "@/components/marketing/HomeHeroVisual";

const highlights = [
  {
    icon: Sparkles,
    title: "AI Studio",
    copy: "Draft captions, refine tone, and adapt content for every platform in seconds.",
    href: "/features"
  },
  {
    icon: Layers3,
    title: "One post, every channel",
    copy: "Publish to LinkedIn, Instagram, YouTube, and more from a single unified workflow.",
    href: "/features"
  },
  {
    icon: CalendarDays,
    title: "Smart scheduling",
    copy: "Plan your week visually and let Postelligence handle the timing across time zones.",
    href: "/features"
  },
  {
    icon: BarChart3,
    title: "Analytics that clarify",
    copy: "Track reach, engagement, and growth with dashboards built for decisions.",
    href: "/features"
  },
  {
    icon: Globe2,
    title: "Native integrations",
    copy: "Direct OAuth connections — no middlemen, no broken embeds, just reliable publishing.",
    href: "/platforms"
  },
  {
    icon: PenLine,
    title: "Drafts that travel",
    copy: "Start an idea on mobile, refine it on desktop, publish it anywhere — always in sync.",
    href: "/features"
  }
];

const steps = [
  {
    step: "01",
    title: "Write once",
    copy: "Draft your post in Postelligence's composer with images, video, or just your words."
  },
  {
    step: "02",
    title: "Let AI adapt it",
    copy: "AI Studio reshapes tone, length, and formatting for each platform automatically."
  },
  {
    step: "03",
    title: "Publish everywhere",
    copy: "Schedule once and Postelligence syncs it across every connected account, on time."
  }
];

const testimonials = [
  {
    name: "Maya R.",
    role: "Independent newsletter writer",
    quote:
      "I used to spend Sunday nights reformatting the same post six different ways. Now I write it once and Postelligence handles the rest.",
    initials: "MR",
    color: "#2f7867"
  },
  {
    name: "Daniel K.",
    role: "Agency social lead",
    quote:
      "The visual calendar alone replaced three spreadsheets. Our whole team finally plans content in one place.",
    initials: "DK",
    color: "#1d5b95"
  },
  {
    name: "Priya N.",
    role: "B2B content marketer",
    quote:
      "AI Studio actually sounds like us — it's grounded in the brand voice instead of generic filler.",
    initials: "PN",
    color: "#a53b28"
  }
];

const stats = [
  { value: 7, suffix: "+", label: "Platforms supported", icon: Globe2, color: "#2f7867", bgLight: "#eaf7ef" },
  { value: 3, suffix: "×", label: "Faster publishing", icon: Zap, color: "#d05945", bgLight: "#fff0ed" },
  { value: 1, suffix: "", label: "Unified dashboard", icon: Sparkles, color: "#0077B5", bgLight: "#e8f1fb" }
];

export default function HomePage() {
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    e.currentTarget.style.setProperty("--mouse-x", `${x}px`);
    e.currentTarget.style.setProperty("--mouse-y", `${y}px`);
  };


  return (
    <PageTransition>
      <section className="marketing-hero relative overflow-hidden px-4 sm:px-6 md:px-8 pb-16 pt-[90px] md:pt-[104px]">
        <div className="marketing-orb marketing-orb-teal" aria-hidden="true" />
        <div className="marketing-orb marketing-orb-coral" aria-hidden="true" />

        <div className="relative mx-auto grid max-w-7xl items-center gap-8 lg:gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(320px,540px)] xl:grid-cols-[minmax(0,1fr)_580px] w-full min-w-0">
          <div className="max-w-2xl w-full min-w-0">
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="marketing-eyebrow"
            >
              Social publishing, reimagined
            </motion.p>
            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
              className="marketing-display mt-5 max-w-full min-w-0 break-words"
            >
              Create once.
              <br />
              <span className="inline-flex flex-wrap items-baseline gap-x-2 sm:gap-x-3 max-w-full">
                <span>Publish</span>
                <RotatingWord />
              </span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.16 }}
              className="mt-7 max-w-xl text-lg leading-relaxed text-[#4f5b62] md:text-[1.15rem]"
            >
              Postelligence is the calm, intelligent workspace for creators who refuse to repeat
              themselves. Write once — AI adapts, schedules, and syncs across every channel.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.24 }}
              className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center w-full max-w-full"
            >
              <a href="/login" className="marketing-cta-primary marketing-cta-glow w-full sm:w-auto text-center justify-center">
                Start for free
                <ArrowRight className="h-4 w-4 shrink-0" />
              </a>
              <a href="/features" className="marketing-cta-secondary w-full sm:w-auto text-center justify-center">
                Explore features
              </a>
            </motion.div>

            {/* 3 Stats cards */}
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.32 }}
              className="mt-10 grid grid-cols-1 min-[420px]:grid-cols-3 gap-2 sm:gap-4 w-full min-w-0"
            >
              {stats.map((stat) => {
                const StatIcon = stat.icon;
                return (
                  <div 
                    key={stat.label} 
                    className="marketing-stat-card marketing-stat-card-hover p-3.5 sm:p-5 flex flex-col justify-between min-h-[110px] sm:min-h-[135px] relative group hover:border-[#2f7867]/20 transition-all duration-300 overflow-hidden"
                  >
                    {/* Icon container */}
                    <div 
                      className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl shadow-sm transition-transform duration-300 group-hover:scale-105"
                      style={{ backgroundColor: stat.bgLight, color: stat.color }}
                    >
                      <StatIcon className="h-4 w-4" />
                    </div>

                    <div className="mt-2.5 sm:mt-3">
                      <p className="text-2xl font-extrabold tracking-[-0.04em] text-[#1f2528] sm:text-3xl md:text-4xl flex items-baseline">
                        <StatCounter value={stat.value} suffix={stat.suffix} />
                      </p>
                      <p className="mt-0.5 sm:mt-1 text-xs text-[#627078] font-bold leading-tight">{stat.label}</p>
                    </div>
                    
                    {/* Hover ambient light inside each card */}
                    <div 
                      className="pointer-events-none absolute -bottom-10 -right-10 h-20 w-20 rounded-full blur-2xl opacity-0 group-hover:opacity-40 transition-opacity duration-300"
                      style={{ backgroundColor: stat.color }}
                    />
                  </div>
                );
              })}
            </motion.div>
          </div>

          <Reveal y={28} className="mt-2 lg:mt-0 lg:-mt-44 xl:-mt-52 flex items-center justify-center w-full overflow-hidden max-w-full min-w-0">
            <div className="flex items-center justify-center -my-24 min-[380px]:-my-18 xs:-my-12 sm:max-lg:-my-6 lg:my-0 scale-[0.56] min-[380px]:scale-[0.66] xs:scale-[0.78] sm:scale-[0.92] md:max-lg:scale-[1.0] lg:scale-85 xl:scale-95 lg:translate-x-0 xl:translate-x-2 transform-gpu transition-all">
              <HomeHeroVisual />
            </div>
          </Reveal>
        </div>

        <div className="relative mx-auto mt-6 sm:mt-12 md:mt-16 max-w-6xl">
          <p className="mb-4 text-center text-[0.78rem] font-bold uppercase tracking-[0.1em] text-[#8a949a]">
            Publish natively, everywhere your audience already is
          </p>
          <PlatformMarquee />
        </div>
      </section>

      <section className="px-5 py-12 md:px-8 md:py-20 marketing-grid-bg relative border-y border-[#1f2528]/5 bg-white/20">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <div className="text-center mb-12">
              <p className="marketing-eyebrow">Unified Flow</p>
              <h2 className="marketing-section-title mt-4">
                How Postelligence works
              </h2>
              <p className="mt-4 text-[1.05rem] leading-relaxed text-[#4f5b62] max-w-xl mx-auto">
                Draft once, and watch AI prepare and synchronize updates natively across all your key social channels in seconds.
              </p>
            </div>
            <ProductFlowDemo />
          </Reveal>
        </div>
      </section>

      <section className="px-5 py-16 md:px-8 md:py-24">
        <div className="mx-auto max-w-6xl">
          <Reveal className="max-w-2xl">
            <p className="marketing-eyebrow">Core Features</p>
            <h2 className="marketing-section-title mt-4">
              Everything you need to stay consistent — without the chaos.
            </h2>
            <p className="mt-4 text-[1.05rem] leading-relaxed text-[#4f5b62]">
              A unified toolkit designed to respect your time, preserve your brand voice, and maximize your social footprint.
            </p>
          </Reveal>

          {/* Premium Bento Grid */}
          <div className="mt-12 grid gap-6 md:grid-cols-6">
            
            {/* AI Studio - Large 2-column card */}
            <div className="md:col-span-3 rounded-3xl border border-[#1f2528]/8 bg-white p-6 shadow-sm flex flex-col justify-between overflow-hidden relative group min-h-[360px]">
              <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-[#2f7867]/5 to-transparent rounded-bl-full pointer-events-none" />
              <div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#2f7867]/10 text-[#2f7867] mb-6">
                  <Sparkles className="h-5 w-5" />
                </div>
                <h3 className="text-xl font-bold tracking-tight text-[#1f2528]">AI Studio</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#627078] max-w-sm">
                  Draft captions, refine tone, and generate engaging hooks in seconds. The AI learns from your edits to match your exact brand voice over time.
                </p>
              </div>
              <div className="mt-6 border border-[#1f2528]/5 bg-[#fbfbf9]/80 rounded-2xl p-4 shadow-[0_4px_12px_rgba(0,0,0,0.02)] backdrop-blur-sm relative z-10 transition-transform duration-300 group-hover:scale-[1.02]">
                <div className="flex items-center justify-between border-b border-[#1f2528]/5 pb-2 mb-3">
                  <span className="text-[0.68rem] font-bold uppercase tracking-wider text-[#2f7867]">AI Prompt Adapter</span>
                  <span className="text-[0.65rem] px-2 py-0.5 rounded bg-[#eaf7ef] text-[#20613a] font-bold">Active</span>
                </div>
                <p className="text-xs text-[#627078] italic">&ldquo;Rewrite this post with a professional tone, keeping it under 300 characters for Bluesky and formatting as bullet points...&rdquo;</p>
                <div className="mt-3 flex items-center justify-end gap-2">
                  <span className="text-[0.68rem] text-[#8a949a]">Adapted:</span>
                  <div className="h-2 w-12 bg-[#2f7867]/20 rounded-full overflow-hidden">
                    <div className="h-full w-4/5 bg-[#2f7867] rounded-full animate-pulse" />
                  </div>
                </div>
              </div>
            </div>

            {/* One post, every channel - Large 2-column card */}
            <div className="md:col-span-3 rounded-3xl border border-[#1f2528]/8 bg-white p-6 shadow-sm flex flex-col justify-between overflow-hidden relative group min-h-[360px]">
              <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-bl from-[#2f7867]/5 to-transparent rounded-bl-full pointer-events-none" />
              <div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#2f7867]/10 text-[#2f7867] mb-6">
                  <Globe2 className="h-5 w-5" />
                </div>
                <h3 className="text-xl font-bold tracking-tight text-[#1f2528]">One post, every channel</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#627078] max-w-sm">
                  Connect all your major platforms via secure native API endpoints. Author your master draft once, and publish to LinkedIn, YouTube, Threads, and Bluesky at once.
                </p>
              </div>
              <div className="mt-6 flex flex-wrap gap-2 items-center justify-center py-4 bg-[#fbfbf9]/80 rounded-2xl border border-[#1f2528]/5 transition-all duration-300 group-hover:bg-slate-100/50">
                <span className="text-[0.7rem] px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-[#1f2528] font-semibold shadow-sm">LinkedIn API</span>
                <span className="text-[0.7rem] px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-[#1f2528] font-semibold shadow-sm">Instagram Graph</span>
                <span className="text-[0.7rem] px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-[#1f2528] font-semibold shadow-sm">YouTube OAuth</span>
                <span className="text-[0.7rem] px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-[#1f2528] font-semibold shadow-sm">Threads API</span>
              </div>
            </div>

            {/* Smart scheduling - 3-column card */}
            <div className="md:col-span-2 rounded-3xl border border-[#1f2528]/8 bg-white p-6 shadow-sm flex flex-col justify-between overflow-hidden relative group min-h-[300px]">
              <div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#0077B5]/10 text-[#0077B5] mb-6">
                  <CalendarDays className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold tracking-tight text-[#1f2528]">Smart scheduling</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#627078]">
                  Plan and organize your entire social calendar visually. Reschedule posts instantly with drag-and-drop handles.
                </p>
              </div>
              <div className="mt-6 border border-[#1f2528]/5 bg-[#fbfbf9]/80 rounded-2xl p-3 flex gap-2 justify-between items-center transition-transform duration-300 group-hover:translate-y-[-2px]">
                <div className="flex gap-1.5">
                  <span className="h-3 w-3 rounded bg-[#2f7867]" />
                  <span className="h-3 w-16 bg-[#1f2528]/10 rounded-full" />
                </div>
                <span className="text-[0.62rem] font-bold text-slate-400">12:30 PM</span>
              </div>
            </div>

            {/* Analytics that clarify - 2-column card */}
            <div className="md:col-span-2 rounded-3xl border border-[#1f2528]/8 bg-white p-6 shadow-sm flex flex-col justify-between overflow-hidden relative group min-h-[300px]">
              <div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#a53b28]/10 text-[#a53b28] mb-6">
                  <BarChart3 className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold tracking-tight text-[#1f2528]">Analytics that clarify</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#627078]">
                  Say goodbye to bloated stats dashboards. Monitor what drives actual engagement with clean metric summaries.
                </p>
              </div>
              <div className="mt-6 flex items-end gap-1.5 h-10 w-full px-2 border-b border-[#1f2528]/10 justify-between">
                <div className="bg-[#2f7867]/30 w-full h-[40%] rounded-t" />
                <div className="bg-[#2f7867]/50 w-full h-[65%] rounded-t" />
                <div className="bg-[#2f7867] w-full h-[95%] rounded-t transition-all group-hover:h-[100%]" />
                <div className="bg-[#2f7867]/40 w-full h-[55%] rounded-t" />
              </div>
            </div>

            {/* Secure connection - 2-column card */}
            <div className="md:col-span-2 rounded-3xl border border-[#1f2528]/8 bg-white p-6 shadow-sm flex flex-col justify-between overflow-hidden relative group min-h-[300px]">
              <div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#6d5ad0]/10 text-[#6d5ad0] mb-6">
                  <Zap className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold tracking-tight text-[#1f2528]">Direct integration</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#627078]">
                  Postelligence connects natively without third-party scrapers or plugins. Experience secure, instant, and reliable publishing.
                </p>
              </div>
              <div className="mt-6 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#2f7867] animate-pulse" />
                <span className="text-[0.68rem] font-bold uppercase tracking-wider text-[#627078]">Active API handshake</span>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* Modern Workflow Comparison Section: The Chaos vs. The Calm */}
      <section className="px-5 py-16 md:px-8 md:py-24 bg-[#fbfbf9]/60 border-y border-[#1f2528]/5 relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[450px] w-[700px] rounded-full bg-gradient-to-tr from-[#2f7867]/5 to-[#d05945]/3 blur-3xl" />
        </div>
        <div className="mx-auto max-w-6xl">
          <Reveal className="max-w-2xl mx-auto text-center mb-16">
            <p className="marketing-eyebrow">Workflow Comparison</p>
            <h2 className="marketing-section-title mt-4">
              Step into a calmer publishing workflow.
            </h2>
            <p className="mt-4 text-[1.05rem] leading-relaxed text-[#4f5b62]">
              See how Postelligence cleans up the friction, manual reformatting, and tab-switching of traditional social publishing.
            </p>
          </Reveal>

          <div className="grid gap-8 md:grid-cols-2">
            
            {/* The Chaos Panel */}
            <Reveal>
              <div className="rounded-3xl border border-[#d05945]/15 bg-white/70 p-6 md:p-8 backdrop-blur-sm relative overflow-hidden flex flex-col justify-between h-full">
                <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-[#d05945]/5 to-transparent rounded-bl-full pointer-events-none" />
                <div>
                  <div className="flex items-center justify-between border-b border-[#1f2528]/5 pb-4 mb-6">
                    <h3 className="text-lg font-bold tracking-tight text-[#d05945] flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-[#d05945]" />
                      Without Postelligence
                    </h3>
                    <span className="text-[0.65rem] px-2 py-0.5 rounded bg-[#fff0ed] text-[#a53b28] font-bold">Chaos</span>
                  </div>
                  <ul className="space-y-4">
                    <li className="flex items-start gap-3">
                      <span className="h-5 w-5 rounded-full bg-[#fff0ed] text-[#a53b28] flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">✕</span>
                      <div>
                        <p className="text-sm font-semibold text-[#1f2528]">Manual Reformatting</p>
                        <p className="text-xs text-[#627078] mt-0.5">Copying, pasting, and rewording drafts across 6 different browser tabs.</p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="h-5 w-5 rounded-full bg-[#fff0ed] text-[#a53b28] flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">✕</span>
                      <div>
                        <p className="text-sm font-semibold text-[#1f2528]">Spreadsheet Scheduling</p>
                        <p className="text-xs text-[#627078] mt-0.5">Managing dates, copy fragments, and publishing times in a messy grid.</p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="h-5 w-5 rounded-full bg-[#fff0ed] text-[#a53b28] flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">✕</span>
                      <div>
                        <p className="text-sm font-semibold text-[#1f2528]">Security & Token Anxiety</p>
                        <p className="text-xs text-[#627078] mt-0.5">Constantly reconnecting social platforms because of expired cookies or session drop-offs.</p>
                      </div>
                    </li>
                  </ul>
                </div>
                <div className="mt-8 pt-6 border-t border-[#1f2528]/5 text-center">
                  <span className="text-xs text-[#8a949a] font-medium">Result: Expended effort, fragmented focus</span>
                </div>
              </div>
            </Reveal>

            {/* The Calm Panel */}
            <Reveal delay={0.1}>
              <div className="rounded-3xl border border-[#2f7867]/25 bg-white p-6 md:p-8 relative overflow-hidden flex flex-col justify-between h-full shadow-[0_16px_40px_rgba(47,120,103,0.05)]">
                <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-[#2f7867]/5 to-transparent rounded-bl-full pointer-events-none" />
                <div>
                  <div className="flex items-center justify-between border-b border-[#1f2528]/5 pb-4 mb-6">
                    <h3 className="text-lg font-bold tracking-tight text-[#2f7867] flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-[#2f7867] animate-pulse" />
                      With Postelligence
                    </h3>
                    <span className="text-[0.65rem] px-2 py-0.5 rounded bg-[#eaf7ef] text-[#20613a] font-bold">Calm</span>
                  </div>
                  <ul className="space-y-4">
                    <li className="flex items-start gap-3">
                      <span className="h-5 w-5 rounded-full bg-[#eaf7ef] text-[#20613a] flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">✓</span>
                      <div>
                        <p className="text-sm font-semibold text-[#1f2528]">Write Once, Adapt with AI</p>
                        <p className="text-xs text-[#627078] mt-0.5">Write a master post once. AI adjusts character limits, hashtags, and style for each site.</p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="h-5 w-5 rounded-full bg-[#eaf7ef] text-[#20613a] flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">✓</span>
                      <div>
                        <p className="text-sm font-semibold text-[#1f2528]">Visual Calendar Reschedule</p>
                        <p className="text-xs text-[#627078] mt-0.5">Clear calendar visualization. Rescheduling is a simple drag-and-drop away.</p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="h-5 w-5 rounded-full bg-[#eaf7ef] text-[#20613a] flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">✓</span>
                      <div>
                        <p className="text-sm font-semibold text-[#1f2528]">Auto-Refreshing Tokens</p>
                        <p className="text-xs text-[#627078] mt-0.5">Handshake tokens refresh in the background automatically. Secure and always ready.</p>
                      </div>
                    </li>
                  </ul>
                </div>
                <div className="mt-8 pt-6 border-t border-[#1f2528]/5 text-center">
                  <span className="text-xs text-[#2f7867] font-semibold">Result: High consistency, maximum focus</span>
                </div>
              </div>
            </Reveal>

          </div>
        </div>
      </section>

      {/* Premium Testimonials Grid */}
      <section className="px-5 py-16 md:px-8 md:py-24">
        <div className="mx-auto max-w-6xl">
          <Reveal className="max-w-2xl mx-auto text-center mb-16">
            <p className="marketing-eyebrow">Loved by creators</p>
            <h2 className="marketing-section-title mt-4">
              Calmer workflows, louder results.
            </h2>
            <p className="mt-4 text-[1.05rem] leading-relaxed text-[#4f5b62]">
              Here is why writers, marketers, and independent teams rely on Postelligence every day.
            </p>
          </Reveal>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {testimonials.map((t, index) => (
              <Reveal key={t.name} delay={index * 0.07}>
                <motion.div 
                  whileHover={{ y: -6, scale: 1.02 }} 
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                  className="rounded-3xl border border-[#1f2528]/8 bg-white p-6 shadow-sm flex flex-col justify-between h-full relative overflow-hidden"
                >
                  <blockquote className="text-sm leading-relaxed text-[#4f5b62] italic relative z-10">
                    “{t.quote}”
                  </blockquote>
                  <div className="mt-6 pt-5 border-t border-[#1f2528]/5 flex items-center gap-3 relative z-10">
                    <span className="marketing-avatar text-xs font-bold" style={{ background: t.color }}>
                      {t.initials}
                    </span>
                    <div>
                      <span className="block text-sm font-semibold text-[#1f2528]">{t.name}</span>
                      <span className="block text-[0.72rem] text-[#7b858d]">{t.role}</span>
                    </div>
                  </div>
                </motion.div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Clean Accordion FAQ */}
      <section className="px-5 py-16 md:px-8 md:py-24 bg-[#fbfbf9]/40 border-t border-[#1f2528]/5">
        <div className="mx-auto max-w-4xl">
          <Reveal className="mx-auto mb-16 max-w-2xl text-center">
            <p className="marketing-eyebrow">Questions, answered</p>
            <h2 className="marketing-section-title mt-4">Everything you&apos;re wondering.</h2>
          </Reveal>
          <Reveal>
            <Faq />
          </Reveal>
        </div>
      </section>

      {/* Glassmorphic bottom CTA panel */}
      <section className="px-5 pb-24 pt-16 md:px-8 md:pb-32">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <div className="relative overflow-hidden rounded-[24px] sm:rounded-[32px] border border-[#1f2528]/8 bg-white px-4 sm:px-8 md:px-16 py-10 sm:py-16 md:py-24 text-center shadow-[0_24px_60px_rgba(0,0,0,0.03)]">
              {/* Background ambient lights */}
              <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-[#2f7867]/8 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-16 -left-16 h-64 w-64 rounded-full bg-[#d05945]/4 blur-3xl" />
              
              <div className="relative z-10 max-w-2xl mx-auto flex flex-col items-center gap-6">
                <span className="inline-flex items-center gap-2 rounded-full border border-[#2f7867]/20 bg-[#eaf7ef] px-4.5 py-1.5 text-xs font-black uppercase tracking-widest text-[#2f7867]">
                  <Zap className="h-3.5 w-3.5 fill-[#2f7867]/10" />
                  Ready when you are
                </span>
                <h2 className="text-4xl font-extrabold tracking-tight text-[#1f2528] md:text-6xl">
                  Your audience is waiting.
                </h2>
                <p className="max-w-lg text-[0.95rem] leading-relaxed text-[#3b444a] font-semibold">
                  Join creators publishing smarter — with AI-assisted drafts, cross-platform scheduling, and analytics that actually clarify progress.
                </p>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
                  <a href="/login" className="inline-flex items-center gap-2 rounded-full bg-[#2f7867] hover:bg-[#205146] px-8 py-4.5 text-sm font-black uppercase tracking-wider text-white shadow-[0_10px_25px_rgba(47,120,103,0.15)] hover:shadow-none transition-all duration-300 cursor-pointer">
                    Get started free
                    <TrendingUp className="h-4 w-4" />
                  </a>
                  <a href="/pricing" className="inline-flex items-center gap-2 rounded-full border border-[#1f2528]/10 bg-slate-50 hover:bg-slate-100 px-8 py-4.5 text-sm font-black uppercase tracking-wider text-[#1f2528] transition-all duration-300 cursor-pointer">
                    View pricing
                  </a>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </PageTransition>
  );
}
