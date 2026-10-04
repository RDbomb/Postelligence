"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Hash,
  Zap,
  Megaphone,
  Lightbulb,
  CalendarDays,
  RefreshCw,
  Layers,
  ImageIcon,
  Copy,
  Check,
  Loader2,
  ChevronDown,
  WandSparkles,
  Download,
  X,
  AlertTriangle,
  Library,
  TrendingUp,
  Compass,
} from "lucide-react";
import { FeatureGate } from "@/components/billing/FeatureGate";
import { useSubscription } from "@/components/billing/SubscriptionContext";

// ─── Types ────────────────────────────────────────────────────────────────────

type AIMode =
  | "caption"
  | "hashtags"
  | "hooks"
  | "cta"
  | "content-ideas"
  | "content-calendar"
  | "rewrite"
  | "repurpose";

interface Tool {
  id: AIMode;
  label: string;
  description: string;
  icon: React.ElementType;
  accent: string;
  inputLabel: string;
  inputPlaceholder: string;
  requiresExisting?: boolean;
  supportsMultiPlatform?: boolean;
}

// One entry of the "trends-list" payload returned by /api/ai/generate.
interface Trend {
  title: string;
  explanation: string;
  category: string;
  imagePrompt: string;
  captionPrompt: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TOOLS: Tool[] = [
  {
    id: "caption",
    label: "Caption Generator",
    description: "AI-written captions for any platform",
    icon: Sparkles,
    accent: "fuchsia",
    inputLabel: "What's your post about?",
    inputPlaceholder: "e.g. Launching my new productivity app that helps remote teams stay focused",
  },
  {
    id: "hashtags",
    label: "Hashtag Generator",
    description: "Ranked hashtags by popularity tier",
    icon: Hash,
    accent: "violet",
    inputLabel: "Topic or niche",
    inputPlaceholder: "e.g. sustainable fashion, tech startups, mindfulness",
  },
  {
    id: "hooks",
    label: "Social Hooks",
    description: "Scroll-stopping opening lines",
    icon: Zap,
    accent: "amber",
    inputLabel: "What's the topic?",
    inputPlaceholder: "e.g. How I grew 10k followers in 30 days with zero paid ads",
  },
  {
    id: "cta",
    label: "CTA Generator",
    description: "Calls-to-action that convert",
    icon: Megaphone,
    accent: "rose",
    inputLabel: "What action do you want?",
    inputPlaceholder: "e.g. Get people to follow my page and check the link in bio",
  },
  {
    id: "content-ideas",
    label: "Content Ideas",
    description: "Fresh ideas for your niche",
    icon: Lightbulb,
    accent: "yellow",
    inputLabel: "Your niche or brand",
    inputPlaceholder: "e.g. Personal finance for Gen Z, fitness for busy moms",
  },
  {
    id: "content-calendar",
    label: "Content Calendar",
    description: "7-day posting plan",
    icon: CalendarDays,
    accent: "cyan",
    inputLabel: "Your brand/niche",
    inputPlaceholder: "e.g. SaaS startup, food blogger, fashion brand",
    supportsMultiPlatform: true,
  },
  {
    id: "rewrite",
    label: "Rewrite Content",
    description: "Transform existing posts",
    icon: RefreshCw,
    accent: "emerald",
    inputLabel: "Paste your existing content",
    inputPlaceholder: "Paste your current caption or post here...",
    requiresExisting: true,
  },
  {
    id: "repurpose",
    label: "Repurpose Content",
    description: "One post → all platforms",
    icon: Layers,
    accent: "sky",
    inputLabel: "Paste content to repurpose",
    inputPlaceholder: "Paste a blog post, tweet, or any content you want to repurpose...",
    requiresExisting: true,
    supportsMultiPlatform: true,
  },
];

const PLATFORMS = ["Instagram", "LinkedIn", "Facebook", "YouTube", "Pinterest", "Threads"];

const TONES = ["Professional", "Casual", "Witty", "Inspirational", "Educational", "Bold", "Friendly", "Luxury"];

const IMAGE_STYLES = [
  { id: "photorealistic", label: "Photorealistic", emoji: "📷" },
  { id: "illustration", label: "Illustration", emoji: "🎨" },
  { id: "minimalist", label: "Minimalist", emoji: "⬜" },
  { id: "3d", label: "3D Render", emoji: "🧊" },
  { id: "watercolor", label: "Watercolor", emoji: "💧" },
  { id: "cinematic", label: "Cinematic", emoji: "🎬" },
];

const ASPECT_RATIOS = [
  { id: "square", label: "1:1 Square", sub: "Instagram, Facebook" },
  { id: "portrait", label: "4:5 Portrait", sub: "Instagram, Pinterest" },
  { id: "landscape", label: "16:9 Landscape", sub: "YouTube, LinkedIn" },
];

// ─── Accent helpers ───────────────────────────────────────────────────────────

function accentClass(accent: string, type: "bg" | "text" | "border" | "ring") {
  const map: Record<string, Record<string, string>> = {
    fuchsia: { bg: "bg-fuchsia-100", text: "text-fuchsia-600", border: "border-fuchsia-300", ring: "ring-fuchsia-300" },
    violet:  { bg: "bg-violet-100",  text: "text-violet-600",  border: "border-violet-300",  ring: "ring-violet-300" },
    amber:   { bg: "bg-amber-100",   text: "text-amber-600",   border: "border-amber-300",   ring: "ring-amber-300" },
    rose:    { bg: "bg-rose-100",    text: "text-rose-600",    border: "border-rose-300",    ring: "ring-rose-300" },
    yellow:  { bg: "bg-yellow-100",  text: "text-yellow-600",  border: "border-yellow-300",  ring: "ring-yellow-300" },
    cyan:    { bg: "bg-cyan-100",    text: "text-cyan-600",    border: "border-cyan-300",    ring: "ring-cyan-300" },
    emerald: { bg: "bg-emerald-100", text: "text-emerald-600", border: "border-emerald-300", ring: "ring-emerald-300" },
    sky:     { bg: "bg-sky-100",     text: "text-sky-600",     border: "border-sky-300",     ring: "ring-sky-300" },
  };
  return map[accent]?.[type] ?? "";
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AIStudioClient({
  initialAllowed,
}: {
  user?: { email?: string | null; user_metadata?: Record<string, string> };
  initialAllowed?: boolean;
}) {
  const router = useRouter();
  const { entitlements } = useSubscription();
  const [activeToolId, setActiveToolId] = useState<AIMode>("caption");
  const [topic, setTopic] = useState("");
  const [platform, setPlatform] = useState("");
  const [tone, setTone] = useState("Professional");
  const [count, setCount] = useState(5);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Image generator state
  const [imgPrompt, setImgPrompt] = useState("");
  const [imgStyle, setImgStyle] = useState("photorealistic");
  const [imgAspect, setImgAspect] = useState("square");
  const [imgLoading, setImgLoading] = useState(false);
  const [imgResult, setImgResult] = useState<string | null>(null);
  const [imgError, setImgError] = useState<string | null>(null);
  const [imgSavedToLibrary, setImgSavedToLibrary] = useState(false);
  const [imgSaveWarning, setImgSaveWarning] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<"text" | "image" | "trends">("text");

  // Trends Analyzer State
  const [trends, setTrends] = useState<Trend[]>([]);
  const [trendsLoading, setTrendsLoading] = useState(false);
  const [trendsError, setTrendsError] = useState<string | null>(null);
  const [selectedTrend, setSelectedTrend] = useState<Trend | null>(null);
  const [trendTextLoading, setTrendTextLoading] = useState(false);
  const [trendImageLoading, setTrendImageLoading] = useState(false);
  const [trendGeneratedPost, setTrendGeneratedPost] = useState<{ caption: string; imageUrl: string; publicUrl: string } | null>(null);
  const [trendImgIndex, setTrendImgIndex] = useState(0);
  const [keywordInput, setKeywordInput] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [selectedGeo, setSelectedGeo] = useState("GLOBAL");
  const [selectedCategory, setSelectedCategory] = useState("WORLD");

  async function fetchTrends(keywordsList: string[] = keywords, geo: string = selectedGeo, category: string = selectedCategory) {
    setTrendsLoading(true);
    setTrendsError(null);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "trends-list",
          keyword: keywordsList.length > 0 ? keywordsList.join(" ") : undefined,
          geo: geo !== "GLOBAL" ? geo : undefined,
          category: category,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch trends");
      setTrends(data.result);
    } catch (e) {
      setTrendsError(e instanceof Error ? e.message : "Failed to load trends");
    } finally {
      setTrendsLoading(false);
    }
  }

  function handleAddKeyword() {
    const val = keywordInput.trim();
    if (val && !keywords.includes(val)) {
      const updated = [...keywords, val];
      setKeywords(updated);
      setKeywordInput("");
      fetchTrends(updated, selectedGeo, selectedCategory);
    }
  }

  function handleRemoveKeyword(indexToRemove: number) {
    const updated = keywords.filter((_, idx) => idx !== indexToRemove);
    setKeywords(updated);
    fetchTrends(updated, selectedGeo, selectedCategory);
  }

  // Wrapped retry click handler
  function handleRetryFetch() {
    fetchTrends(keywords, selectedGeo, selectedCategory);
  }

  function handleGeoChange(newGeo: string) {
    setSelectedGeo(newGeo);
    fetchTrends(keywords, newGeo, selectedCategory);
  }

  function handleCategoryChange(newCategory: string) {
    setSelectedCategory(newCategory);
    fetchTrends(keywords, selectedGeo, newCategory);
  }

  async function generateTrendPost(trend: Trend) {
    setSelectedTrend(trend);
    setTrendTextLoading(true);
    setTrendImageLoading(true);
    setTrendGeneratedPost(null);
    setTrendsError(null);
    setTrendImgIndex(0); // Reset index to first image

    const textPromise = fetch("/api/ai/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "trends-post",
        topic: trend.title,
        existingContent: trend.explanation,
      }),
    }).then(async (r) => {
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Caption generation failed");
      return d.result as string;
    });

    const imgPromise = fetch("/api/ai/image-generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: trend.title,
        style: "photorealistic",
        aspectRatio: "square",
        usePinterest: true,
        pinterestIndex: 0,
      }),
    }).then(async (r) => {
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Image generation failed");
      return {
        imageUrl: d.imageUrl as string,
        publicUrl: (d.libraryItem?.file_url || d.imageUrl) as string,
      };
    });

    try {
      const [caption, imgData] = await Promise.all([textPromise, imgPromise]);
      setTrendGeneratedPost({
        caption,
        imageUrl: imgData.imageUrl,
        publicUrl: imgData.publicUrl,
      });
    } catch (e) {
      setTrendsError(e instanceof Error ? e.message : "Failed to generate trend post");
    } finally {
      setTrendTextLoading(false);
      setTrendImageLoading(false);
    }
  }

  async function regenerateTrendText() {
    if (!selectedTrend || !trendGeneratedPost) return;
    setTrendTextLoading(true);
    setTrendsError(null);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "trends-post",
          topic: selectedTrend.title,
          existingContent: selectedTrend.explanation,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Caption generation failed");
      setTrendGeneratedPost((prev) => prev ? {
        ...prev,
        caption: data.result,
      } : null);
    } catch (e) {
      setTrendsError(e instanceof Error ? e.message : "Failed to regenerate caption");
    } finally {
      setTrendTextLoading(false);
    }
  }

  async function regenerateTrendImage() {
    if (!selectedTrend || !trendGeneratedPost) return;
    setTrendImageLoading(true);
    setTrendsError(null);
    const nextIdx = trendImgIndex + 1;
    setTrendImgIndex(nextIdx);
    try {
      const res = await fetch("/api/ai/image-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: selectedTrend.title,
          style: "photorealistic",
          aspectRatio: "square",
          usePinterest: true,
          pinterestIndex: nextIdx,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Image generation failed");
      setTrendGeneratedPost((prev) => prev ? {
        ...prev,
        imageUrl: data.imageUrl,
        publicUrl: data.libraryItem?.file_url || data.imageUrl,
      } : null);
    } catch (e) {
      setTrendsError(e instanceof Error ? e.message : "Failed to regenerate image");
    } finally {
      setTrendImageLoading(false);
    }
  }

  function shiftToCreate() {
    if (!trendGeneratedPost) return;
    const { caption, publicUrl } = trendGeneratedPost;
    router.push(`/create?caption=${encodeURIComponent(caption)}&mediaUrl=${encodeURIComponent(publicUrl)}`);
  }

  const activeTool = TOOLS.find((t) => t.id === activeToolId)!;
  const resultRef = useRef<HTMLDivElement>(null);

  const togglePlatform = (p: string) =>
    setSelectedPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));

  async function generate() {
    const input = activeTool.requiresExisting ? topic : topic;
    if (!input.trim()) { setError("Please enter some content first."); return; }
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        mode: activeToolId,
        tone,
        count,
        ...(activeTool.requiresExisting ? { existingContent: topic } : { topic }),
        ...(platform ? { platform } : {}),
        ...(selectedPlatforms.length ? { targetPlatforms: selectedPlatforms } : {}),
      };

      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      setResult(data.result);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function generateImage() {
    if (!imgPrompt.trim()) { setImgError("Please enter a prompt."); return; }
    setImgLoading(true);
    setImgResult(null);
    setImgError(null);
    setImgSavedToLibrary(false);
    setImgSaveWarning(null);

    try {
      const res = await fetch("/api/ai/image-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: imgPrompt, style: imgStyle, aspectRatio: imgAspect }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Image generation failed");
      setImgResult(data.imageUrl);
      setImgSavedToLibrary(!!data.savedToLibrary);
      if (!data.savedToLibrary && data.libraryError) {
        setImgSaveWarning("Image generated, but saving it to your Library failed.");
      }
    } catch (e) {
      setImgError(e instanceof Error ? e.message : "Image generation failed");
    } finally {
      setImgLoading(false);
    }
  }

  function copyText(text: string, idx: number) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIndex(idx);
      setTimeout(() => setCopiedIndex(null), 2000);
    });
  }

  function downloadImage() {
    if (!imgResult) return;
    const a = document.createElement("a");
    a.href = imgResult;
    a.download = `postelligence-ai-image-${Date.now()}.png`;
    a.click();
  }

  // Parse result into sections/items
  function parseResult(text: string): string[] {
    return text
      .split(/\n(?=\d+\.|#{1,3}\s|\*{1,2}[A-Z]|\*{2}Day)/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-5">
        <div className="mx-auto max-w-7xl">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-fuchsia-100 to-violet-100">
              <WandSparkles className="h-5 w-5 text-fuchsia-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black tracking-tight text-gray-900">AI Studio</h1>
                {entitlements && (
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600 border border-slate-200">
                    {entitlements.name} Plan: {entitlements.maxAiWordsPerMonth.toLocaleString()} words/mo
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500">Generate viral captions, hashtags, hooks, and content ideas with AI.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6">
        {/* Tab switcher */}
        <div className="mb-6 flex gap-2">
          <button
            onClick={() => { setActiveTab("text"); setTrendsError(null); }}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-all cursor-pointer ${
              activeTab === "text"
                ? "bg-fuchsia-100 text-fuchsia-700 ring-1 ring-fuchsia-300"
                : "text-gray-500 hover:text-gray-800"
            }`}
          >
            <Sparkles className="h-4 w-4" />
            Text Generation
          </button>
          <button
            onClick={() => { setActiveTab("image"); setTrendsError(null); }}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-all cursor-pointer ${
              activeTab === "image"
                ? "bg-violet-100 text-violet-700 ring-1 ring-violet-300"
                : "text-gray-500 hover:text-gray-800"
            }`}
          >
            <ImageIcon className="h-4 w-4" />
            Image Generator
            <span className="text-[9px] font-black uppercase tracking-wider text-violet-700 bg-violet-50 border border-violet-200 rounded-full px-1.5 py-0.5">
              PRO
            </span>
          </button>
          <button
            onClick={() => {
              setActiveTab("trends");
              // Load the trend feed the first time this tab is opened.
              if (!trends.length && !trendsLoading) void fetchTrends();
            }}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-all cursor-pointer ${
              activeTab === "trends"
                ? "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300"
                : "text-gray-500 hover:text-gray-800"
            }`}
          >
            <TrendingUp className="h-4 w-4" />
            Trends Analyzer
          </button>
        </div>

        <AnimatePresence mode="wait">
          {activeTab === "text" && (
            <motion.div
              key="text"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="grid gap-6 lg:grid-cols-[340px_1fr]"
            >
              {/* Tool selector */}
              <div className="flex flex-col gap-2">
                <p className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-400">Choose Tool</p>
                {TOOLS.map((tool) => {
                  const Icon = tool.icon;
                  const isActive = activeToolId === tool.id;
                  return (
                    <button
                      key={tool.id}
                      onClick={() => { setActiveToolId(tool.id); setResult(null); setError(null); }}
                      className={`group flex items-center gap-3 rounded-2xl border p-3 text-left transition-all ${
                        isActive
                          ? `${accentClass(tool.accent, "bg")} ${accentClass(tool.accent, "border")} ring-1 ${accentClass(tool.accent, "ring")}`
                          : "border-gray-200 bg-white hover:bg-gray-50"
                      }`}
                    >
                      <div className={`grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl ${accentClass(tool.accent, "bg")}`}>
                        <Icon className={`h-4 w-4 ${isActive ? accentClass(tool.accent, "text") : "text-gray-400 group-hover:text-gray-700"}`} />
                      </div>
                      <div className="min-w-0">
                        <p className={`text-sm font-bold ${isActive ? "text-gray-900" : "text-gray-700"}`}>{tool.label}</p>
                        <p className="truncate text-xs text-gray-500">{tool.description}</p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Main workspace */}
              <div className="flex flex-col gap-5">
                {/* Input card */}
                <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="mb-4 flex items-center gap-3">
                    <div className={`grid h-9 w-9 place-items-center rounded-xl ${accentClass(activeTool.accent, "bg")}`}>
                      <activeTool.icon className={`h-4 w-4 ${accentClass(activeTool.accent, "text")}`} />
                    </div>
                    <div>
                      <h2 className="font-black text-gray-900">{activeTool.label}</h2>
                      <p className="text-xs text-gray-500">{activeTool.description}</p>
                    </div>
                  </div>

                  {/* Main input */}
                  <div className="mb-4">
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-gray-500">
                      {activeTool.inputLabel}
                    </label>
                    <textarea
                      rows={activeTool.requiresExisting ? 5 : 3}
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      placeholder={activeTool.inputPlaceholder}
                      className="w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none transition focus:border-gray-300 focus:ring-1 focus:ring-gray-200"
                    />
                  </div>

                  {/* Options row */}
                  <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {/* Platform */}
                    {!activeTool.supportsMultiPlatform && (
                      <div>
                        <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-gray-500">Platform</label>
                        <div className="relative">
                          <select
                            value={platform}
                            onChange={(e) => setPlatform(e.target.value)}
                            className="w-full appearance-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-300"
                          >
                            <option value="">Any</option>
                            {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-2 top-2.5 h-4 w-4 text-gray-500" />
                        </div>
                      </div>
                    )}

                    {/* Tone */}
                    <div>
                      <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-gray-500">Tone</label>
                      <div className="relative">
                        <select
                          value={tone}
                          onChange={(e) => setTone(e.target.value)}
                          className="w-full appearance-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-300"
                        >
                          {TONES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-2 top-2.5 h-4 w-4 text-gray-500" />
                      </div>
                    </div>

                    {/* Count */}
                    {!activeTool.supportsMultiPlatform && activeToolId !== "rewrite" && (
                      <div>
                        <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-gray-500">Results</label>
                        <div className="relative">
                          <select
                            value={count}
                            onChange={(e) => setCount(Number(e.target.value))}
                            className="w-full appearance-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-300"
                          >
                            {[3, 5, 7, 10].map((n) => <option key={n} value={n}>{n}</option>)}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-2 top-2.5 h-4 w-4 text-gray-500" />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Multi-platform selector */}
                  {activeTool.supportsMultiPlatform && (
                    <div className="mb-4">
                      <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-gray-500">
                        Target Platforms
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {PLATFORMS.map((p) => (
                          <button
                            key={p}
                            onClick={() => togglePlatform(p)}
                            className={`rounded-lg border px-2.5 py-1 text-xs font-bold transition-all ${
                              selectedPlatforms.includes(p)
                                ? "border-violet-300 bg-violet-100 text-violet-600"
                                : "border-gray-200 bg-white text-gray-500 hover:text-gray-900"
                            }`}
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <button
                    onClick={generate}
                    disabled={loading}
                    className={`flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-black transition-all ${
                      loading
                        ? "cursor-not-allowed bg-gray-100 text-gray-400"
                        : `bg-gradient-to-r from-fuchsia-500 to-violet-500 text-white shadow-[0_8px_30px_rgba(168,85,247,0.35)] hover:shadow-[0_8px_40px_rgba(168,85,247,0.5)] hover:-translate-y-0.5`
                    }`}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Generating
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        Generate {activeTool.label}
                      </>
                    )}
                  </button>
                </div>

                {/* Error */}
                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600"
                    >
                      <X className="h-4 w-4 flex-shrink-0" />
                      {error}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Result */}
                <AnimatePresence>
                  {result && (
                    <motion.div
                      ref={resultRef}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-3xl border border-gray-200 bg-white p-5"
                    >
                      <div className="mb-4 flex items-center justify-between">
                        <div>
                          <p className={`text-xs font-bold uppercase tracking-widest ${accentClass(activeTool.accent, "text")}`}>
                            Generated Results
                          </p>
                          <h3 className="mt-1 font-black">{activeTool.label}</h3>
                        </div>
                        <button
                          onClick={() => copyText(result, -1)}
                          className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-gray-100 px-3 py-1.5 text-xs font-bold text-gray-700 transition hover:bg-gray-200"
                        >
                          {copiedIndex === -1 ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                          Copy all
                        </button>
                      </div>

                      {/* Parse and display results */}
                      {parseResult(result).map((section, idx) => (
                        <motion.div
                          key={idx}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.04 }}
                          className="group mb-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 last:mb-0"
                        >
                          <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
                            {section}
                          </p>
                          <div className="mt-3 flex gap-2">
                            <button
                              onClick={() => copyText(section, idx)}
                              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-500 transition hover:text-gray-900"
                            >
                              {copiedIndex === idx ? (
                                <><Check className="h-3 w-3 text-emerald-600" /> Copied</>
                              ) : (
                                <><Copy className="h-3 w-3" /> Copy</>
                              )}
                            </button>
                          </div>
                        </motion.div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}

          {activeTab === "image" && (
            /* ── Image Generator Tab ── */
            <FeatureGate
              feature="canGenerateAiImages"
              featureName="AI Image Generator"
              requiredTier="pro"
              initialAllowed={initialAllowed}
              description="Create high-resolution AI visuals, artwork, and banners for your posts. Upgrade to Pro (25 images/month) or Plus (150 images/month) to unlock AI image generation."
            >
              <motion.div
                key="image"
                initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="grid gap-6 lg:grid-cols-[420px_1fr]"
            >
              {/* Controls */}
              <div className="rounded-3xl border border-gray-200 bg-white p-5">
                <div className="mb-5 flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-2xl bg-violet-100">
                    <ImageIcon className="h-5 w-5 text-violet-600" />
                  </div>
                  <div>
                    <h2 className="font-black">AI Image Generator</h2>
                    </div>
                </div>

                <div className="mb-4">
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-gray-500">
                    Image Prompt
                  </label>
                  <textarea
                    rows={4}
                    value={imgPrompt}
                    onChange={(e) => setImgPrompt(e.target.value)}
                    placeholder="e.g. A professional workspace with laptop, coffee and plants, natural lighting, modern aesthetic"
                    className="w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none transition focus:border-gray-300 focus:ring-1 focus:ring-gray-200"
                  />
                </div>

                {/* Style */}
                <div className="mb-4">
                  <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-gray-500">Style</label>
                  <div className="grid grid-cols-3 gap-2">
                    {IMAGE_STYLES.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setImgStyle(s.id)}
                        className={`rounded-xl border p-2 text-center transition-all ${
                          imgStyle === s.id
                            ? "border-violet-300 bg-violet-100 text-violet-700"
                            : "border-gray-200 bg-white text-gray-500 hover:text-gray-900"
                        }`}
                      >
                        <span className="block text-lg">{s.emoji}</span>
                        <span className="text-xs font-bold">{s.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Aspect ratio */}
                <div className="mb-5">
                  <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-gray-500">Aspect Ratio</label>
                  <div className="flex flex-col gap-2">
                    {ASPECT_RATIOS.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => setImgAspect(r.id)}
                        className={`flex items-center justify-between rounded-xl border px-3 py-2 transition-all ${
                          imgAspect === r.id
                            ? "border-violet-300 bg-violet-100"
                            : "border-gray-200 bg-white hover:bg-gray-100"
                        }`}
                      >
                        <span className={`text-sm font-bold ${imgAspect === r.id ? "text-violet-700" : "text-gray-700"}`}>
                          {r.label}
                        </span>
                        <span className="text-xs text-gray-500">{r.sub}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={generateImage}
                  disabled={imgLoading}
                  className={`flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-black transition-all ${
                    imgLoading
                      ? "cursor-not-allowed bg-gray-100 text-gray-400"
                      : "bg-gradient-to-r from-violet-500 to-sky-500 text-white shadow-[0_8px_30px_rgba(139,92,246,0.35)] hover:-translate-y-0.5 hover:shadow-[0_8px_40px_rgba(139,92,246,0.5)]"
                  }`}
                >
                  {imgLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generating image...
                    </>
                  ) : (
                    <>
                      <WandSparkles className="h-4 w-4" />
                      Generate Image
                    </>
                  )}
                </button>
              </div>

              {/* Preview */}
              <div className="flex min-h-[400px] flex-col items-center justify-center rounded-3xl border border-gray-200 bg-white">
                <AnimatePresence mode="wait">
                  {imgLoading ? (
                    <motion.div
                      key="loading"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex flex-col items-center gap-4 p-8 text-center"
                    >
                      <div className="relative h-16 w-16">
                        <div className="absolute inset-0 animate-spin rounded-full border-2 border-violet-500/30 border-t-violet-400" />
                        <div className="absolute inset-3 animate-spin rounded-full border-2 border-sky-500/30 border-t-sky-400" style={{ animationDirection: "reverse" }} />
                      </div>
                      <div>
                        <p className="font-black text-gray-900">Generating your image</p>
                        <p className="mt-1 text-sm text-gray-500">This can take 20–40 seconds on free tier</p>
                      </div>
                    </motion.div>
                  ) : imgError ? (
                    <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-8 text-center">
                      <p className="text-rose-600">{imgError}</p>
                      <button onClick={() => setImgError(null)} className="mt-3 text-xs text-gray-500 underline">Dismiss</button>
                    </motion.div>
                  ) : imgResult ? (
                    <motion.div
                      key="result"
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="w-full p-5"
                    >
                      <div className="overflow-hidden rounded-2xl">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={imgResult} alt="AI Generated" className="w-full object-cover" />
                      </div>

                      {imgSavedToLibrary ? (
                        <a
                          href="/library"
                          className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700 transition hover:bg-emerald-100"
                        >
                          <Check className="h-4 w-4" />
                          Saved to Library
                          <Library className="ml-auto h-4 w-4" />
                        </a>
                      ) : imgSaveWarning ? (
                        <div className="mt-3 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm font-bold text-amber-700">
                          <AlertTriangle className="h-4 w-4" />
                          {imgSaveWarning}
                        </div>
                      ) : null}

                      <div className="mt-4 flex flex-wrap gap-3">
                        <button
                          onClick={downloadImage}
                          className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-100 py-2.5 text-sm font-bold text-gray-700 transition hover:bg-gray-200"
                        >
                          <Download className="h-4 w-4" />
                          Download
                        </button>
                        <button
                          onClick={() => { setImgResult(null); setImgSavedToLibrary(false); setImgSaveWarning(null); }}
                          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-sky-500 py-2.5 text-sm font-bold text-white"
                        >
                          <RefreshCw className="h-4 w-4" />
                          Generate New
                        </button>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-3 p-8 text-center">
                      <div className="grid h-16 w-16 place-items-center rounded-3xl border border-gray-200 bg-gray-100">
                        <ImageIcon className="h-7 w-7 text-gray-500" />
                      </div>
                      <div>
                        <p className="font-black text-gray-700">Your image will appear here</p>
                        <p className="mt-1 text-sm text-gray-600">Enter a prompt and hit Generate</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
            </FeatureGate>
          )}

          {activeTab === "trends" && (
            <motion.div
              key="trends"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="grid gap-6 lg:grid-cols-[1.2fr_1.8fr]"
            >
              {/* Trends List Column */}
              <div className="flex flex-col gap-4">
                <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-2xl bg-emerald-100">
                      <TrendingUp className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div>
                      <h2 className="font-black text-gray-900 text-left">Current Viral Trends</h2>
                      <p className="text-xs text-gray-500 text-left">Real-time social media topics & visual prompts</p>
                    </div>
                  </div>

                  {/* Country Selector & Keywords Search Panel */}
                  <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-gray-100 bg-gray-50/50 p-4">
                    {/* Selectors Grid */}
                    <div className="grid grid-cols-2 gap-3">
                      {/* Country Selector */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Search Region</label>
                        <select
                          value={selectedGeo}
                          onChange={(e) => handleGeoChange(e.target.value)}
                          className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 outline-none transition focus:border-gray-300"
                        >
                          <option value="GLOBAL">🌍 Global</option>
                          <option value="US">🇺🇸 United States</option>
                          <option value="IN">🇮🇳 India</option>
                          <option value="GB">🇬🇧 United Kingdom</option>
                          <option value="CA">🇨🇦 Canada</option>
                          <option value="AU">🇦🇺 Australia</option>
                          <option value="DE">🇩🇪 Germany</option>
                          <option value="FR">🇫🇷 France</option>
                          <option value="JP">🇯🇵 Japan</option>
                        </select>
                      </div>

                      {/* Category Selector */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Category Feed</label>
                        <select
                          value={selectedCategory}
                          onChange={(e) => handleCategoryChange(e.target.value)}
                          className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 outline-none transition focus:border-gray-300"
                        >
                          <option value="WORLD">🌍 General / World News</option>
                          <option value="TECHNOLOGY">💻 Technology</option>
                          <option value="BUSINESS">📈 Business / Finance</option>
                          <option value="SPORTS">⚽ Sports</option>
                          <option value="ENTERTAINMENT">🎬 Entertainment</option>
                          <option value="HEALTH">🏥 Health</option>
                          <option value="SCIENCE">🧪 Science</option>
                        </select>
                      </div>
                    </div>

                    {/* Keyword Input & Add Button */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Target Keywords</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={keywordInput}
                          onChange={(e) => setKeywordInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleAddKeyword();
                            }
                          }}
                          placeholder="Type keyword and click Add..."
                          className="flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-900 placeholder-gray-400 outline-none transition focus:border-gray-300"
                        />
                        <button
                          onClick={handleAddKeyword}
                          type="button"
                          className="rounded-xl bg-emerald-100 hover:bg-emerald-200 px-4 py-2 text-xs font-bold text-emerald-800 transition cursor-pointer"
                        >
                          Add
                        </button>
                      </div>
                    </div>

                    {/* Keyword Chips/Tags */}
                    {keywords.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 py-1">
                        {keywords.map((kw, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-1.5 rounded-lg bg-emerald-50 border border-emerald-200/60 px-2 py-1 text-xs text-emerald-800 font-medium"
                          >
                            <span>{kw}</span>
                            <button
                              onClick={() => handleRemoveKeyword(idx)}
                              type="button"
                              className="text-emerald-500 hover:text-emerald-700 font-bold focus:outline-none cursor-pointer"
                            >
                              &times;
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Search & Reset Buttons */}
                    <div className="flex gap-2 mt-1">
                      <button
                        onClick={() => fetchTrends(keywords, selectedGeo)}
                        disabled={trendsLoading}
                        className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white transition disabled:opacity-50 cursor-pointer text-center"
                      >
                        {trendsLoading ? "Searching..." : "Search Trends"}
                      </button>
                      {keywords.length > 0 && (
                        <button
                          onClick={() => {
                            setKeywords([]);
                            fetchTrends([], selectedGeo);
                          }}
                          disabled={trendsLoading}
                          className="rounded-xl border border-gray-200 bg-white hover:bg-gray-50 px-3 py-2.5 text-xs font-bold text-gray-600 transition cursor-pointer"
                        >
                          Clear Keywords
                        </button>
                      )}
                    </div>
                  </div>

                  {trendsLoading ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-3">
                      <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
                      <p className="text-xs text-gray-500 font-semibold">Analyzing current social media trends...</p>
                    </div>
                  ) : trendsError && !selectedTrend ? (
                    <div className="text-center py-6">
                      <p className="text-sm text-rose-600 font-medium mb-3">{trendsError}</p>
                      <button
                        onClick={handleRetryFetch}
                        className="rounded-xl bg-gray-100 hover:bg-gray-200 px-4 py-2 text-xs font-bold text-gray-700 transition"
                      >
                        Retry
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {trends.map((trend, idx) => (
                        <button
                          key={idx}
                          onClick={() => generateTrendPost(trend)}
                          className={`w-full text-left p-4 rounded-2xl border transition-all duration-300 flex flex-col gap-2 hover:-translate-y-0.5 hover:shadow-sm cursor-pointer ${
                            selectedTrend?.title === trend.title
                              ? "border-emerald-300 bg-emerald-50/50 shadow-sm"
                              : "border-gray-200 bg-white"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[0.62rem] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                              {trend.category}
                            </span>
                            <span className="text-[0.65rem] text-[#8a949a] font-bold">Trend #{idx + 1}</span>
                          </div>
                          <h3 className="text-sm font-bold text-gray-900">{trend.title}</h3>
                          <p className="text-xs text-gray-500 leading-relaxed">{trend.explanation}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Preview/Generator Column */}
              <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm min-h-[450px] flex flex-col justify-between relative overflow-hidden">
                <AnimatePresence mode="wait">
                  {(!trendGeneratedPost && (trendTextLoading || trendImageLoading)) ? (
                    <motion.div
                      key="loading"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm gap-4 p-8 text-center z-10"
                    >
                      <div className="relative h-16 w-16">
                        <div className="absolute inset-0 animate-spin rounded-full border-2 border-emerald-500/30 border-t-emerald-500" />
                        <div className="absolute inset-3 animate-spin rounded-full border-2 border-violet-500/30 border-t-violet-500" style={{ animationDirection: "reverse" }} />
                      </div>
                      <div>
                        <p className="font-black text-gray-900">Creating trend package</p>
                        <p className="mt-1 text-xs text-gray-500 max-w-[280px]">Drafting viral caption & generating high-quality visual via Pollinations AI...</p>
                      </div>
                    </motion.div>
                  ) : trendsError && selectedTrend ? (
                    <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center h-full p-8 text-center">
                      <p className="text-rose-600 text-sm font-medium">{trendsError}</p>
                      <button
                        onClick={() => generateTrendPost(selectedTrend)}
                        className="mt-4 rounded-xl bg-gray-100 hover:bg-gray-200 px-4 py-2 text-xs font-bold text-gray-700 transition"
                      >
                        Retry Generation
                      </button>
                    </motion.div>
                  ) : trendGeneratedPost ? (
                    <motion.div
                      key="preview"
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="flex flex-col gap-4 h-full"
                    >
                      <div className="text-left">
                        <span className="text-[0.62rem] font-bold uppercase tracking-wider text-emerald-600">Generated Trend Campaign</span>
                        <h3 className="text-base font-black text-gray-950 mt-0.5">{selectedTrend?.title}</h3>
                      </div>

                      {/* Mock Social Preview Box */}
                      <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-sm flex flex-col">
                        <div className="bg-gray-50 px-4 py-3 border-b border-gray-100 flex items-center gap-2.5 text-left">
                          <div className="h-8 w-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">AI</div>
                          <div>
                            <span className="block text-xs font-bold text-gray-800">Postelligence Assistant</span>
                            <span className="block text-[0.62rem] text-gray-400">Campaign Preview</span>
                          </div>
                        </div>

                        {/* Image Preview */}
                        <div className="relative aspect-video w-full bg-slate-100 overflow-hidden border-b border-gray-100 flex items-center justify-center">
                          {trendImageLoading && (
                            <div className="absolute inset-0 bg-white/80 flex flex-col items-center justify-center gap-2 z-10">
                              <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
                              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Generating visual...</span>
                            </div>
                          )}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={trendGeneratedPost.imageUrl} alt="Trend matching image" className="w-full h-full object-cover" />
                        </div>

                        {/* Caption Preview */}
                        <div className="p-4 bg-white text-left relative min-h-[80px]">
                          {trendTextLoading && (
                            <div className="absolute inset-0 bg-white/85 flex flex-col items-center justify-center gap-2 z-10">
                              <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
                              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Rewriting caption...</span>
                            </div>
                          )}
                          <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed max-h-[160px] overflow-y-auto custom-scrollbar">
                            {trendGeneratedPost.caption}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 mt-2 border-t border-gray-100 pt-4">
                        <div className="flex gap-2">
                          <button
                            onClick={regenerateTrendText}
                            disabled={trendTextLoading}
                            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50 py-2.5 text-[0.7rem] font-bold text-gray-600 hover:bg-gray-100 cursor-pointer disabled:opacity-50"
                          >
                            <RefreshCw className={`h-3 w-3 ${trendTextLoading ? 'animate-spin' : ''}`} />
                            Regenerate Text
                          </button>
                          <button
                            onClick={regenerateTrendImage}
                            disabled={trendImageLoading}
                            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50 py-2.5 text-[0.7rem] font-bold text-gray-600 hover:bg-gray-100 cursor-pointer disabled:opacity-50"
                          >
                            <RefreshCw className={`h-3 w-3 ${trendImageLoading ? 'animate-spin' : ''}`} />
                            Regenerate Image
                          </button>
                        </div>
                        <button
                          onClick={shiftToCreate}
                          disabled={trendTextLoading || trendImageLoading}
                          className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white py-2.5 text-xs font-bold shadow-md shadow-emerald-500/20 hover:shadow-emerald-500/35 cursor-pointer hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:pointer-events-none"
                        >
                          <WandSparkles className="h-3.5 w-3.5" />
                          Create Post
                        </button>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="empty"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center"
                    >
                      <div className="grid h-16 w-16 place-items-center rounded-3xl border border-gray-100 bg-emerald-50/50">
                        <Compass className="h-7 w-7 text-emerald-600" />
                      </div>
                      <div>
                        <p className="font-black text-gray-700">Trend Post Preview</p>
                        <p className="mt-1 text-sm text-gray-500 max-w-[280px]">Select a trend on the left to auto-generate a matching image and post draft.</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}