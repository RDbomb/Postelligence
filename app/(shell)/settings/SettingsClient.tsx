"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Save, Upload, RotateCcw, X, Crop, Sparkles, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RazorpayCheckoutButton } from "@/components/payments/RazorpayCheckoutButton";
import { PlanBadge } from "@/components/billing/PlanBadge";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import type { User } from "@supabase/supabase-js";

const ALL_PLATFORMS = [
  { id: "instagram",  label: "Instagram",  color: "#E1306C" },
  { id: "facebook",   label: "Facebook",   color: "#1877F2" },
  { id: "linkedin",   label: "LinkedIn",   color: "#0A66C2" },
  { id: "youtube",    label: "YouTube",    color: "#FF0033" },
  { id: "threads",    label: "Threads",    color: "#111827" },
  { id: "bluesky",    label: "Bluesky",    color: "#1185FE" },
  { id: "pinterest",  label: "Pinterest",  color: "#E60023" },
  { id: "discord",    label: "Discord",    color: "#5865F2" },
  { id: "telegram",   label: "Telegram",   color: "#26A5E4" },
];

const DEFAULT_AVATARS = [
  { id: "avatar-1", url: "https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" },
  { id: "avatar-2", url: "https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka" },
  { id: "avatar-3", url: "https://api.dicebear.com/7.x/avataaars/svg?seed=Milo" },
  { id: "avatar-4", url: "https://api.dicebear.com/7.x/bottts/svg?seed=SyncBot" },
  { id: "avatar-5", url: "https://api.dicebear.com/7.x/lorelei/svg?seed=Creator" },
  { id: "avatar-6", url: "https://api.dicebear.com/7.x/identicon/svg?seed=Post" },
];

const COUNTRIES = [
  { code: "+91", country: "IN", label: "India (+91)", digits: 10 },
  { code: "+1",  country: "US", label: "United States (+1)", digits: 10 },
  { code: "+44", country: "UK", label: "United Kingdom (+44)", digits: 10 },
  { code: "+971", country: "AE", label: "United Arab Emirates (+971)", digits: 9 },
  { code: "+61", country: "AU", label: "Australia (+61)", digits: 9 },
  { code: "+81", country: "JP", label: "Japan (+81)", digits: 10 },
];

interface AvatarOption {
  id: string;
  url: string;
  isGoogle?: boolean;
}

function DefaultAvatarItem({ av, isSelected, onClick }: { av: AvatarOption; isSelected: boolean; onClick: () => void }) {
  const [error, setError] = useState(false);
  if (error) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-10 w-10 rounded-full overflow-hidden border-2 transition-all cursor-pointer relative",
        isSelected ? "border-[#2f7867] scale-110 shadow-sm" : "border-transparent opacity-60 hover:opacity-100 hover:scale-105"
      )}
      title={av.isGoogle ? "Google Account Photo" : "Default Avatar"}
    >
      <img 
        src={av.url} 
        alt="avatar option" 
        className="h-full w-full object-cover" 
        onError={() => setError(true)}
      />
      {av.isGoogle && (
        <div className="absolute bottom-0 right-0 bg-white rounded-full p-0.5 shadow-sm border border-slate-100 flex items-center justify-center">
          <svg className="h-2.5 w-2.5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
        </div>
      )}
    </button>
  );
}

interface Props {
  initialDefaultPlatforms: string[];
  initialUser: User | null;
}

export default function SettingsClient({ initialDefaultPlatforms, initialUser }: Props) {
  const router = useRouter();
  
  // Platform settings
  const [defaultPlatforms, setDefaultPlatforms] = useState<string[]>(initialDefaultPlatforms);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Billing
  const [paymentResult, setPaymentResult] = useState<string | null>(null);
  const [subData, setSubData] = useState<{
    tier: string;
    subscription: {
      status: string;
      billing_type: string;
      current_period_end: string | null;
    };
    entitlements: {
      name: string;
      maxScheduledPostsPerMonth: number;
      maxAiWordsPerMonth: number;
      maxAiImagesPerMonth: number;
      maxAutomatedPostsPerMonth: number;
      maxConnectedPlatforms: number;
      maxWorkspaces: number;
    };
    usage: {
      scheduled_posts_count: number;
      automated_posts_count: number;
      ai_words_generated: number;
      ai_images_generated: number;
    };
  } | null>(null);
  const [loadingSub, setLoadingSub] = useState(true);

  useEffect(() => {
    async function fetchSub() {
      try {
        const res = await fetch("/api/subscriptions/current");
        if (res.ok) {
          const data = await res.json();
          setSubData(data);
        }
      } catch (err) {
        console.error("Failed to load subscription data", err);
      } finally {
        setLoadingSub(false);
      }
    }
    fetchSub();
  }, []);

  // Profile details
  const [fullName, setFullName] = useState(initialUser?.user_metadata?.full_name || initialUser?.user_metadata?.name || "");
  const [avatarUrl, setAvatarUrl] = useState(initialUser?.user_metadata?.avatar_url || "");
  // Remembers which avatar URL failed to load, so the error state resets
  // automatically as soon as a different avatar is selected.
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const avatarLoadError = !!avatarUrl && failedAvatarUrl === avatarUrl;
  const [uploading, setUploading] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Phone states
  const [countryCode, setCountryCode] = useState(initialUser?.user_metadata?.phone_country_code || "+91");
  const [phone, setPhone] = useState(initialUser?.user_metadata?.phone_number || "");

  // Detect if user has a Google picture
  const googlePhoto = initialUser?.user_metadata?.picture || 
    (initialUser?.user_metadata?.avatar_url?.includes("googleusercontent.com") ? initialUser?.user_metadata?.avatar_url : null);

  const defaultAvatars = [
    ...(googlePhoto ? [{ id: "google-avatar", url: googlePhoto, isGoogle: true }] : []),
    ...DEFAULT_AVATARS,
  ];

  // Cropper states
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [cropScale, setCropScale] = useState(1);
  const [cropPosition, setCropPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const avatarInputRef = useRef<HTMLInputElement>(null);

  const toggle = (id: string) => {
    setDefaultPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
    setSaved(false);
  };

  const saveDefaultPlatforms = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/user-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ default_platforms: defaultPlatforms }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (file: File) => {
    setUploading(true);
    setProfileError(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const res = await fetch("/api/media-library", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setAvatarUrl(data.item.file_url);
    } catch (e) {
      setProfileError(e instanceof Error ? e.message : "Failed to upload avatar");
    } finally {
      setUploading(false);
    }
  };

  const saveProfile = async () => {
    setSavingProfile(true);
    setProfileError(null);
    try {
      const selectedCountry = COUNTRIES.find((c) => c.code === countryCode);
      const cleanedPhone = phone.replace(/\D/g, "");

      if (phone && selectedCountry && cleanedPhone.length !== selectedCountry.digits) {
        throw new Error(
          `Phone number for ${selectedCountry.label} must be exactly ${selectedCountry.digits} digits (you have ${cleanedPhone.length}).`
        );
      }

      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({
        data: {
          full_name: fullName,
          name: fullName,
          avatar_url: avatarUrl,
          phone_country_code: countryCode,
          phone_number: cleanedPhone,
        },
      });
      if (updateError) throw updateError;
      setProfileSaved(true);
      router.refresh();
      setTimeout(() => setProfileSaved(false), 3000);
    } catch (e) {
      setProfileError(e instanceof Error ? e.message : "Failed to update profile");
    } finally {
      setSavingProfile(false);
    }
  };

  // Image load & setup for Cropping Modal
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setImageSrc(reader.result as string);
      setCropScale(1);
      setCropPosition({ x: 0, y: 0 });
    };
    reader.readAsDataURL(file);
  };

  // Custom canvas-based cropping execution
  const cropImage = () => {
    if (!imageSrc) return;

    const imgElement = new Image();
    imgElement.src = imageSrc;
    imgElement.onload = () => {
      const canvas = document.createElement("canvas");
      const size = 250;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const viewSize = 288; // size of the container box
      const cropSize = 176; // size of the circle viewport

      // Scale ratio of the image render dimensions
      const aspect = imgElement.width / imgElement.height;
      let displayedWidth = viewSize;
      let displayedHeight = viewSize;
      
      if (aspect > 1) {
        displayedWidth = viewSize * aspect;
      } else {
        displayedHeight = viewSize / aspect;
      }

      // Calculate width and height in actual image pixels to crop
      const sw = (cropSize / cropScale) * (imgElement.width / displayedWidth);
      const sh = (cropSize / cropScale) * (imgElement.height / displayedHeight);

      // Translate offsets from screen pixels to raw image pixels
      const sx = (imgElement.width / 2) - (sw / 2) - (cropPosition.x * (imgElement.width / (displayedWidth * cropScale)));
      const sy = (imgElement.height / 2) - (sh / 2) - (cropPosition.y * (imgElement.height / (displayedHeight * cropScale)));

      ctx.drawImage(imgElement, sx, sy, sw, sh, 0, 0, size, size);

      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const croppedFile = new File([blob], "avatar.jpg", { type: "image/jpeg" });
        await handleAvatarUpload(croppedFile);
        setImageSrc(null); // close cropper
      }, "image/jpeg", 0.95);
    };
  };

  // Drag handlers for cropping image position adjust
  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - cropPosition.x, y: e.clientY - cropPosition.y });
  };

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setCropPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  return (
    <div className="mx-auto max-w-7xl w-full space-y-8 pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#1f2528]/10 pb-5">
        <div>
          <h1 className="text-3xl font-black tracking-[-0.04em] text-[#1f2528]">Settings & Account Preferences</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">Customize your creator profile, identity, default publishing platforms, and security.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#2f7867]/30 bg-[#eaf7ef] px-3.5 py-1.5 text-xs font-black text-[#2f7867]">
            <span className="h-2 w-2 rounded-full bg-[#2f7867] animate-pulse" /> Creator Active
          </span>
        </div>
      </div>

      {/* 2-Column Responsive Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Sidebar / Creator Identity Card (4 columns on lg screens) */}
        <div className="lg:col-span-4 space-y-6">
          <div className="rounded-2xl border border-[#1f2528]/10 bg-white p-6 shadow-[0_8px_32px_rgba(31,37,40,0.06)] relative overflow-hidden">
            <div className="absolute top-0 right-0 h-24 w-24 translate-x-8 -translate-y-8 rounded-full bg-gradient-to-br from-[#2f7867]/10 to-transparent blur-xl pointer-events-none" />
            
            <div className="flex flex-col items-center text-center">
              {/* Avatar */}
              <div className="relative group">
                {avatarUrl && !avatarLoadError ? (
                  <img
                    src={avatarUrl}
                    alt={fullName}
                    className="h-28 w-28 rounded-full object-cover border-4 border-white shadow-md ring-1 ring-slate-200"
                    onError={() => setFailedAvatarUrl(avatarUrl)}
                  />
                ) : (
                  <div className="flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-[#2f7867] to-[#1f4a3f] text-3xl font-black text-white shadow-md ring-4 ring-white">
                    {(fullName || "CR").slice(0, 2).toUpperCase()}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-[#1f2528] text-white shadow-lg hover:scale-110 transition-transform cursor-pointer"
                  title="Change Avatar"
                >
                  <Upload className="h-4 w-4" />
                </button>
                <input
                  ref={avatarInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*"
                  onChange={onFileChange}
                />
              </div>

              <h2 className="mt-4 text-xl font-black text-[#1f2528]">{fullName || "Creator Account"}</h2>
              <p className="text-xs font-semibold text-slate-400 truncate max-w-full">{initialUser?.email}</p>

              <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
                <span className="rounded-full bg-[#f4f9f7] border border-[#2f7867]/30 px-3 py-1 text-[11px] font-bold text-[#2f7867]">
                  Creator Tier
                </span>
                <span className="rounded-full bg-slate-100 border border-slate-200 px-3 py-1 text-[11px] font-bold text-slate-600">
                  {defaultPlatforms.length} Default Channels
                </span>
              </div>
            </div>

            <div className="mt-6 border-t border-slate-100 pt-5 space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400 font-medium">Primary Email</span>
                <span className="font-bold text-[#1f2528] truncate max-w-[170px]">{initialUser?.email}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400 font-medium">Phone Contact</span>
                <span className="font-bold text-[#1f2528]">{countryCode} {phone || "Not set"}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400 font-medium">Auth Provider</span>
                <span className="font-bold text-[#2f7867] capitalize">{initialUser?.app_metadata?.provider || "Email"}</span>
              </div>
            </div>
          </div>

          {/* Quick Tips Card */}
          <div className="rounded-2xl border border-[#2f7867]/20 bg-[#f4f9f7] p-5">
            <div className="flex items-center gap-2 mb-2">
              <Check className="h-4 w-4 text-[#2f7867]" />
              <span className="text-xs font-black uppercase tracking-wider text-[#2f7867]">Workflow Optimization</span>
            </div>
            <p className="text-xs leading-relaxed text-slate-600 font-medium">
              Selecting default channels ensures your primary social platforms are pre-loaded each time you create a post.
            </p>
          </div>
        </div>

        {/* Right Column / Main Cards (8 columns on lg screens) */}
        <div className="lg:col-span-8 space-y-8">
          
          {/* Profile Details Form Card */}
          <div className="rounded-2xl border border-[#1f2528]/10 bg-white p-6 shadow-[0_8px_32px_rgba(31,37,40,0.06)]">
            <div className="mb-6 flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-lg font-black text-[#1f2528]">Profile & Creator Credentials</h2>
                <p className="text-xs text-slate-400 mt-0.5">Update your display name, contact phone, and profile avatar.</p>
              </div>
            </div>

            <div className="space-y-6">
              {/* Avatar Selector */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Select Default Avatar Presets
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  {defaultAvatars.map((av) => (
                    <DefaultAvatarItem
                      key={av.id}
                      av={av}
                      isSelected={avatarUrl === av.url}
                      onClick={() => setAvatarUrl(av.url)}
                    />
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="text-xs font-bold"
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    Upload Custom Avatar
                  </Button>
                  {avatarUrl && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs font-bold border-rose-200 text-rose-600 hover:bg-rose-50"
                      onClick={() => setAvatarUrl("")}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Reset to Default
                    </Button>
                  )}
                </div>
              </div>

              {/* Inputs Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-[#1f2528]">Full Name</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full rounded-xl border border-[#1f2528]/12 bg-[#f9faf7] px-4 py-2.5 text-sm font-semibold text-[#1f2528] outline-none focus:border-[#2f7867] focus:bg-white transition-colors"
                    placeholder="Your full name"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold text-[#1f2528]">Phone Number</label>
                  <div className="flex gap-2">
                    <select
                      value={countryCode}
                      onChange={(e) => {
                        const newCode = e.target.value;
                        setCountryCode(newCode);
                        const selectedCountry = COUNTRIES.find((c) => c.code === newCode);
                        if (selectedCountry) {
                          setPhone((prev: string) => prev.replace(/\D/g, "").slice(0, selectedCountry.digits));
                        }
                      }}
                      className="rounded-xl border border-[#1f2528]/12 bg-[#f9faf7] px-3 py-2.5 text-xs font-bold text-[#1f2528] outline-none focus:border-[#2f7867]"
                    >
                      {COUNTRIES.map((c) => (
                        <option key={c.code} value={c.code}>{c.label}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={phone}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, "");
                        const selectedCountry = COUNTRIES.find((c) => c.code === countryCode);
                        const limit = selectedCountry ? selectedCountry.digits : 15;
                        setPhone(val.slice(0, limit));
                      }}
                      className="min-w-0 flex-1 rounded-xl border border-[#1f2528]/12 bg-[#f9faf7] px-4 py-2.5 text-sm font-semibold text-[#1f2528] outline-none focus:border-[#2f7867] focus:bg-white transition-colors"
                      placeholder="Phone number"
                    />
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-xs font-bold text-slate-400">Primary Email Address (Read-only)</label>
                  <input
                    type="text"
                    value={initialUser?.email || ""}
                    disabled
                    className="w-full rounded-xl border border-[#1f2528]/10 bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-500 cursor-not-allowed outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <Button variant="primary" disabled={savingProfile} onClick={saveProfile} className="px-6 py-2.5">
                  {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {savingProfile ? "Saving Profile..." : "Save Profile"}
                </Button>
                {profileSaved && (
                  <span className="flex items-center gap-1.5 text-sm font-bold text-[#2f7867]">
                    <Check className="h-4 w-4" /> Profile saved!
                  </span>
                )}
                {profileError && <span className="text-sm font-bold text-rose-500">{profileError}</span>}
              </div>
            </div>
          </div>

          {/* Default Publishing Channels Card */}
          <div className="rounded-2xl border border-[#1f2528]/10 bg-white p-6 shadow-[0_8px_32px_rgba(31,37,40,0.06)]">
            <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-lg font-black text-[#1f2528]">Default Publishing Channels</h2>
                <p className="text-xs text-slate-400 mt-0.5">Select which social platforms are pre-selected every time you open Create.</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDefaultPlatforms(ALL_PLATFORMS.map((p) => p.id))}
                  className="text-xs font-bold text-[#2f7867] hover:underline"
                >
                  Select All
                </button>
                <span className="text-slate-300">•</span>
                <button
                  type="button"
                  onClick={() => setDefaultPlatforms([])}
                  className="text-xs font-bold text-slate-400 hover:text-slate-600 hover:underline"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {ALL_PLATFORMS.map((p) => {
                const selected = defaultPlatforms.includes(p.id);
                const isThreads = p.id === "threads";
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggle(p.id)}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border px-4 py-3 text-xs font-black transition-all shadow-sm cursor-pointer text-left",
                      selected
                        ? isThreads
                          ? "bg-slate-950 text-white border-slate-950"
                          : "text-white border-transparent"
                        : "border-slate-200/80 bg-[#f9faf7] text-slate-600 hover:bg-[#f2f4ef]"
                    )}
                    style={selected && !isThreads ? { backgroundColor: p.color, borderColor: p.color } : undefined}
                  >
                    <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border shadow-sm", selected && isThreads ? "bg-white text-slate-950" : "bg-white")} style={{ color: selected && isThreads ? "#000000" : p.color }}>
                      <span className="text-[10px] font-black">{p.label.slice(0, 2).toUpperCase()}</span>
                    </span>
                    <span className="truncate flex-1">{p.label}</span>
                    {selected && <Check className="h-3.5 w-3.5 shrink-0 text-white" />}
                  </button>
                );
              })}
            </div>

            {defaultPlatforms.length === 0 && (
              <p className="mt-3 text-xs text-amber-500">
                No default channels selected — the Create page will start with no platforms pre-selected.
              </p>
            )}

            <div className="mt-6 flex items-center gap-3 border-t border-slate-100 pt-4">
              <Button variant="primary" disabled={saving} onClick={saveDefaultPlatforms} className="px-6 py-2.5">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? "Saving..." : "Save Preferences"}
              </Button>
              {saved && (
                <span className="flex items-center gap-1.5 text-sm font-bold text-[#2f7867]">
                  <Check className="h-4 w-4" /> Preferences saved!
                </span>
              )}
              {error && <span className="text-sm font-bold text-rose-500">{error}</span>}
            </div>
          </div>

          {/* Billing & Subscription Card */}
          <div className="rounded-2xl border border-[#1f2528]/10 bg-white p-6 shadow-[0_8px_32px_rgba(31,37,40,0.06)]">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-5">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-black text-[#1f2528]">Subscription & Billing</h2>
                  <PlanBadge tier={subData?.tier || "starter"} size="md" />
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Manage your subscription tier, monthly usage quotas, and account limits.
                </p>
              </div>

              {subData?.subscription?.billing_type === "lifetime" ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-bold text-emerald-700">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Lifetime VIP Access
                </span>
              ) : subData?.tier && subData.tier !== "starter" ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 border border-slate-200 px-3 py-1 text-xs font-bold text-slate-700">
                  Active Subscription
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 border border-slate-200 px-3 py-1 text-xs font-bold text-slate-500">
                  Starter Plan
                </span>
              )}
            </div>

            {/* Monthly Usage Counters */}
            <div className="mb-6 rounded-xl border border-slate-100 bg-[#f8faf9] p-5">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-4">
                Monthly Usage & Limits ({subData?.entitlements?.name || "Starter"} Tier)
              </h3>

              <div className="grid gap-4 sm:grid-cols-3">
                {/* Scheduled Posts */}
                <div>
                  <div className="flex justify-between text-xs font-bold mb-1.5">
                    <span className="text-slate-600">Scheduled Posts</span>
                    <span className="text-[#1f2528]">
                      {subData?.usage?.scheduled_posts_count || 0} / {subData?.entitlements?.maxScheduledPostsPerMonth || 10}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full bg-[#2f7867] transition-all"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.round(
                            ((subData?.usage?.scheduled_posts_count || 0) /
                              (subData?.entitlements?.maxScheduledPostsPerMonth || 10)) *
                              100
                          )
                        )}%`,
                      }}
                    />
                  </div>
                </div>

                {/* AI Words */}
                <div>
                  <div className="flex justify-between text-xs font-bold mb-1.5">
                    <span className="text-slate-600">AI Words</span>
                    <span className="text-[#1f2528]">
                      {(subData?.usage?.ai_words_generated || 0).toLocaleString()} /{" "}
                      {(subData?.entitlements?.maxAiWordsPerMonth || 1000).toLocaleString()}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full bg-violet-600 transition-all"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.round(
                            ((subData?.usage?.ai_words_generated || 0) /
                              (subData?.entitlements?.maxAiWordsPerMonth || 1000)) *
                              100
                          )
                        )}%`,
                      }}
                    />
                  </div>
                </div>

                {/* AI Images */}
                <div>
                  <div className="flex justify-between text-xs font-bold mb-1.5">
                    <span className="text-slate-600">AI Images</span>
                    <span className="text-[#1f2528]">
                      {subData?.usage?.ai_images_generated || 0} / {subData?.entitlements?.maxAiImagesPerMonth || 0}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full bg-fuchsia-600 transition-all"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.round(
                            ((subData?.usage?.ai_images_generated || 0) /
                              Math.max(1, subData?.entitlements?.maxAiImagesPerMonth || 1)) *
                              100
                          )
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Plan Actions & Upgrades */}
            {subData?.tier === "plus" ? (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4 text-center">
                <p className="text-sm font-bold text-emerald-800">
                  🎉 You are on the Plus / Agency tier with maximum capabilities and unlimited platform access.
                </p>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row gap-3">
                {subData?.tier !== "pro" && (
                  <RazorpayCheckoutButton
                    amount={149900}
                    name="PostSync Pro"
                    description="PostSync Pro — monthly subscription"
                    tier="pro"
                    prefill={{
                      name: initialUser?.user_metadata?.full_name,
                      email: initialUser?.email,
                    }}
                    variant="outline"
                    className="flex-1 py-3 font-bold"
                    onSuccess={(r) => {
                      setPaymentResult(`Pro upgrade successful — ${r.payment_id}`);
                      window.location.reload();
                    }}
                  >
                    <Sparkles className="h-4 w-4 text-[#2f7867]" />
                    Upgrade to Pro — ₹1,499 / mo
                  </RazorpayCheckoutButton>
                )}

                <RazorpayCheckoutButton
                  amount={399900}
                  name="PostSync Plus"
                  description="PostSync Plus / Agency — monthly subscription"
                  tier="plus"
                  prefill={{
                    name: initialUser?.user_metadata?.full_name,
                    email: initialUser?.email,
                  }}
                  variant="primary"
                  className="flex-1 py-3 font-bold"
                  onSuccess={(r) => {
                    setPaymentResult(`Plus upgrade successful — ${r.payment_id}`);
                    window.location.reload();
                  }}
                >
                  <Sparkles className="h-4 w-4" />
                  Upgrade to Plus — ₹3,999 / mo
                </RazorpayCheckoutButton>
              </div>
            )}

            {paymentResult && (
              <p className="mt-3 flex items-center gap-1.5 text-sm font-bold text-[#2f7867]">
                <Check className="h-4 w-4" /> {paymentResult}
              </p>
            )}
          </div>

        </div>
      </div>

      {/* Custom Avatar Cropper Modal */}
      <AnimatePresence>
        {imageSrc && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-sm rounded-3xl border border-[#1f2528]/10 bg-white p-5 text-center shadow-xl"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                <span className="text-sm font-black text-[#1f2528]">Position & Crop Avatar</span>
                <button
                  onClick={() => setImageSrc(null)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-[#1f2528] cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Viewport Box (288x288px) */}
              <div
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={() => setIsDragging(false)}
                onMouseLeave={() => setIsDragging(false)}
                className="w-72 h-72 mx-auto bg-slate-950 overflow-hidden relative cursor-grab active:cursor-grabbing rounded-2xl flex items-center justify-center"
              >
                {/* Circular Mask Frame overlay */}
                <div className="absolute w-44 h-44 rounded-full border-2 border-white pointer-events-none z-10 shadow-[0_0_0_9999px_rgba(15,23,42,0.65)]" />

                {/* Raw Image display */}
                <img
                  src={imageSrc}
                  alt="crop target"
                  draggable={false}
                  className="max-w-none origin-center pointer-events-none select-none transition-transform duration-75 ease-out"
                  style={{
                    transform: `translate(${cropPosition.x}px, ${cropPosition.y}px) scale(${cropScale})`,
                  }}
                />
              </div>

              {/* Zoom Control Slider */}
              <div className="mt-4 flex flex-col gap-1 text-left px-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Scale / Zoom</span>
                <input
                  type="range"
                  min="1"
                  max="4"
                  step="0.02"
                  value={cropScale}
                  onChange={(e) => setCropScale(parseFloat(e.target.value))}
                  className="w-full accent-[#2f7867] cursor-pointer"
                />
              </div>

              {/* Crop Modal Actions */}
              <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4">
                <Button variant="outline" className="h-9.5 text-xs" onClick={() => setImageSrc(null)}>
                  Cancel
                </Button>
                <Button variant="primary" className="h-9.5 text-xs" onClick={cropImage} disabled={uploading}>
                  {uploading ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <Crop className="h-4 w-4" />}
                  Crop & Save
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}