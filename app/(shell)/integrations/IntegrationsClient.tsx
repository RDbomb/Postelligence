"use client";

import { useState, useRef, useEffect, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  MoreHorizontal, Plus, X, Check, Loader2,
  WifiOff, Zap, Shield, RefreshCw, ExternalLink,
  Globe, Sparkles, Activity, Lock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PLATFORM_CONFIG } from "@/types";
import { useSubscription } from "@/components/billing/SubscriptionContext";
import { PaywallModal } from "@/components/billing/PaywallModal";
import type { SocialAccount } from "@/lib/integrations/social-accounts";
import {
  getConnectedFacebookAccount,
  getConnectedInstagramAccount,
  getConnectedYouTubeAccount,
  getConnectedThreadsAccount,
  getConnectedBlueskyAccount,
  getConnectedPinterestAccount,
  getConnectedLinkedInAccount,
  getConnectedDiscordAccount,
  getConnectedTelegramAccount,
} from "@/lib/integrations/social-accounts";

// ── Platform logo SVGs ────────────────────────────────────────────────────────
function PlatformLogo({ id, className }: { id: string; className?: string }) {
  if (id === "facebook") return (
    <svg className={className} viewBox="0 0 24 24"><path fill="currentColor" d="M14.2 8.4V6.7c0-.8.5-1 1.1-1h1.5V2.2A20 20 0 0 0 14 2c-2.9 0-4.8 1.7-4.8 4.9v1.5H6v3.9h3.2V22h4v-9.7h3.1l.6-3.9h-3.7Z" /></svg>
  );
  if (id === "instagram") return (
    <svg className={className} viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="17.4" cy="6.6" r="1.3" fill="currentColor" /></svg>
  );
  if (id === "linkedin") return (
    <svg className={className} viewBox="0 0 24 24"><path fill="currentColor" d="M5.1 8.9h3.6V20H5.1V8.9Zm1.8-5.5a2.1 2.1 0 1 1 0 4.2 2.1 2.1 0 0 1 0-4.2ZM10.8 8.9h3.5v1.5h.1c.5-.9 1.7-1.9 3.4-1.9 3.7 0 4.4 2.4 4.4 5.6V20h-3.6v-5.2c0-1.2 0-2.8-1.7-2.8s-2 1.3-2 2.7V20h-3.6V8.9Z" /></svg>
  );
  if (id === "youtube") return (
    <svg className={className} viewBox="0 0 24 24"><path fill="currentColor" d="M22 7.3a3 3 0 0 0-2.1-2.1C18 4.7 12 4.7 12 4.7s-6 0-7.9.5A3 3 0 0 0 2 7.3 31 31 0 0 0 1.5 12 31 31 0 0 0 2 16.7a3 3 0 0 0 2.1 2.1c1.9.5 7.9.5 7.9.5s6 0 7.9-.5a3 3 0 0 0 2.1-2.1c.5-1.9.5-4.7.5-4.7s0-2.8-.5-4.7ZM10 15.4V8.6l5.8 3.4-5.8 3.4Z" /></svg>
  );
  if (id === "threads") return (
    <svg className={className} viewBox="0 0 24 24"><path fill="currentColor" d="M12.1 22c-5.7 0-9.3-3.7-9.3-9.8C2.8 6.1 6.5 2 12 2c4.2 0 7.4 2.1 8.7 5.7l-3.4 1c-.8-2.3-2.7-3.6-5.2-3.6-3.3 0-5.4 2.7-5.4 7s2.1 6.8 5.5 6.8c2.6 0 4.3-1.3 4.3-3.2 0-1.1-.6-1.9-1.8-2.3-.6 2.2-2.3 3.5-4.6 3.5-2.6 0-4.4-1.6-4.4-3.9 0-2.4 2-4 5.1-4 .6 0 1.2 0 1.8.1-.3-1.2-1.2-1.8-2.6-1.8-1.1 0-2.1.4-3 1.2L5.6 6.2c1.2-1.1 2.8-1.7 4.6-1.7 3.3 0 5.2 1.8 5.6 5.4 2.8.8 4.4 2.8 4.4 5.5 0 4-3.1 6.6-8.1 6.6Zm-1.8-7.8c1.2 0 2-.8 2.3-2.3-.6-.1-1.1-.1-1.7-.1-1.4 0-2.2.5-2.2 1.3 0 .7.6 1.1 1.6 1.1Z" /></svg>
  );
  if (id === "pinterest") return (
    <svg className={className} viewBox="0 0 24 24"><path fill="currentColor" d="M12.1 2C6.6 2 3 5.6 3 10.3c0 3 1.7 5.3 4.2 6.2.4.1.6-.2.7-.5l.3-1.3c.1-.4.1-.5-.2-.9-.8-.9-1.2-2-1.2-3.2 0-3.5 2.6-6.5 6.8-6.5 3.7 0 5.7 2.3 5.7 5.3 0 4-1.8 7.3-4.4 7.3-1.4 0-2.5-1.2-2.1-2.7.4-1.8 1.2-3.7 1.2-5 0-1.2-.6-2.1-1.9-2.1-1.5 0-2.7 1.5-2.7 3.6 0 1.3.4 2.2.4 2.2l-1.8 7.4c-.4 1.8-.1 3.9 0 4.1.1.1.2.1.3 0 .1-.2 1.8-2.2 2.4-4.2l.7-2.7c.7 1.3 2 2.1 3.7 2.1 4.9 0 8.2-4.5 8.2-10.4C23 5 19.2 2 12.1 2Z" /></svg>
  );
  if (id === "discord") return (
    <svg className={className} viewBox="0 0 24 24"><path fill="currentColor" d="M19.27 4.73a.12.12 0 0 0-.07-.05A19.53 19.53 0 0 0 14.44 3a.09.09 0 0 0-.08.04c-.21.37-.45.87-.61 1.25a18.8 18.8 0 0 0-5.5 0c-.16-.38-.41-.88-.63-1.25a.09.09 0 0 0-.08-.04A19.53 19.53 0 0 0 2.8 4.68a.12.12 0 0 0-.07.05A19.73 19.73 0 0 0 .5 17.58a.12.12 0 0 0 .05.08A19.64 19.64 0 0 0 6 21a.1.1 0 0 0 .11-.04c.43-.59.82-1.22 1.15-1.88a.1.1 0 0 0-.05-.13 13.06 13.06 0 0 1-1.84-.87.1.1 0 0 1-.01-.17c.12-.09.24-.18.36-.28a.1.1 0 0 1 .1-.01c3.57 1.63 7.45 1.63 11 0a.1.1 0 0 1 .1.01c.12.1.24.19.36.28a.1.1 0 0 1-.01.17 12.23 12.23 0 0 1-1.84.87.1.1 0 0 0-.05.13c.33.66.72 1.29 1.15 1.88a.1.1 0 0 0 .11.04 19.64 19.64 0 0 0 5.48-3.34.12.12 0 0 0 .05-.08 19.73 19.73 0 0 0-2.28-12.85M8.02 15.33c-1.18 0-2.16-1.08-2.16-2.42S6.84 10.5 8.02 10.5s2.17 1.08 2.16 2.41S9.2 15.33 8.02 15.33m7.96 0c-1.18 0-2.16-1.08-2.16-2.42s.97-2.41 2.16-2.41 2.17 1.08 2.16 2.41-.98 2.42-2.16 2.42" /></svg>
  );
  if (id === "telegram") return (
    <svg className={className} viewBox="0 0 24 24"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.12.02-1.96 1.25-5.54 3.67-.52.36-.97.53-1.33.52-.4-.01-1.18-.23-1.76-.41-.71-.23-1.28-.35-1.23-.74.03-.2.3-.41.82-.62 3.2-1.39 5.34-2.31 6.42-2.76 3.06-1.27 3.69-1.49 4.11-1.5.09 0 .3.02.43.13.11.09.14.22.15.31 0 .06.01.12 0 .19z" /></svg>
  );
  return (
    <svg className={className} viewBox="0 0 24 24"><path fill="currentColor" d="M7.2 4.2c2 1.5 4.1 4.5 4.8 6.1.7-1.6 2.8-4.6 4.8-6.1 1.5-1.1 3.9-2 3.9.7 0 .5-.3 4.5-.9 5.2-1.1 1.3-4.9 1.2-6.2 1.1 4.5.7 5.7 3 3.2 5.3-4.7 4.3-6.8-1.1-7.3-2.5-.1-.3-.2-.5-.2-.5s-.1.2-.2.5c-.6 1.4-2.7 6.8-7.3 2.5-2.5-2.3-1.3-4.6 3.2-5.3-1.3.1-5.1.2-6.2-1.1C2.3 9.4 2 5.4 2 4.9c0-2.7 2.4-1.8 3.9-.7Z" /></svg>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface Platform {
  id: string;
  name: string;
  color: string;
  bgGradient: string;
  shadowColor: string;
  connected: boolean;
  handle: string;
  connectionDetails?: string[];
  avatarUrl?: string | null;
  lastSync: string;
  description: string;
  category: string;
  capabilities: string[];
}

interface Props {
  socialAccounts: SocialAccount[];
}

function discordConnectionDetails(account: SocialAccount) {
  const metadata = account.metadata || {};
  const serverName = typeof metadata.serverName === "string" ? metadata.serverName.trim()
    : typeof metadata.guildName === "string" ? metadata.guildName.trim() : "";
  const botName = typeof metadata.botName === "string" ? metadata.botName.trim() : "";
  const channelName = typeof metadata.channelName === "string" ? metadata.channelName.trim().replace(/^#/, "") : "";

  const details = [
    serverName && `Server: ${serverName}`,
    botName && `Bot: ${botName}`,
    channelName && `Channel: #${channelName}`,
  ].filter((detail): detail is string => Boolean(detail));
  if (details.length > 0) return details;

  // Connections made before Discord metadata was saved used this generic
  // label. Keep the actual bot/webhook name visible instead of that label.
  const legacyMatch = account.account_name.match(/^Discord Webhook\s*\(#(.+)\)$/i);
  if (legacyMatch?.[1]) return [`Bot: ${legacyMatch[1]}`];

  return [account.account_name];
}

// Returns false while server-rendering and during the first (hydrating) client
// render, then true afterwards. Reading it through useSyncExternalStore keeps
// the server and client markup identical without an extra state-setting effect.
const subscribeToNothing = () => () => {};
function useIsHydrated() {
  return useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false
  );
}

function PlatformAvatar({ platform, size = "lg" }: { platform: Platform; size?: "sm" | "lg" }) {
  const [imgError, setImgError] = useState(false);
  const mounted = useIsHydrated();

  const sizeClass = size === "lg" ? "h-14 w-14" : "h-9 w-9";
  const logoClass = size === "lg" ? "h-7 w-7" : "h-4 w-4";

  return (
    <div
      className={cn(
        "relative grid place-items-center overflow-hidden rounded-2xl shadow-lg flex-shrink-0 transition-transform duration-300",
        sizeClass
      )}
      style={{
        background: platform.bgGradient,
        color: "#fff",
      }}
    >
      {mounted && platform.connected && platform.avatarUrl && !imgError ? (
        <img
          src={platform.avatarUrl}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <PlatformLogo id={platform.id} className={logoClass} />
      )}
    </div>
  );
}



// ── Mini platform icon for the hero mosaic ───────────────────────────────────
function MosaicIcon({ platform, delay }: { platform: Platform; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, duration: 0.5, type: "spring", stiffness: 200 }}
      className={cn(
        "grid h-10 w-10 place-items-center rounded-xl shadow-md flex-shrink-0",
        platform.connected && "ring-2 ring-emerald-400 ring-offset-1 ring-offset-white"
      )}
      style={{ background: platform.bgGradient, color: "#ffffff" }}
    >
      <PlatformLogo id={platform.id} className="h-5 w-5" />
    </motion.div>
  );
}

// ── Platform Card ─────────────────────────────────────────────────────────────
function PlatformCard({
  platform,
  onConnect,
  onDisconnect,
  isDisconnecting,
  index,
  isLimitReached,
}: {
  platform: Platform;
  onConnect: () => void;
  onDisconnect: () => void;
  isDisconnecting: boolean;
  index: number;
  isLimitReached?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [menuOpen]);

  const profileUrls: Record<string, string> = {
    instagram: "https://instagram.com",
    facebook: "https://facebook.com",
    linkedin: "https://linkedin.com/feed",
    youtube: "https://youtube.com",
    threads: "https://threads.net",
    bluesky: "https://bsky.app",
    pinterest: "https://pinterest.com",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.4, type: "spring", stiffness: 180, damping: 22 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="relative flex flex-col rounded-3xl border border-slate-200 bg-white/80 backdrop-blur-sm transition-all duration-300"
      style={{
        transform: isHovered ? "translateY(-4px)" : "translateY(0px)",
        boxShadow: isHovered
          ? `0 8px 40px ${platform.shadowColor}45, 0 2px 12px ${platform.shadowColor}25`
          : platform.connected
          ? `0 2px 16px ${platform.shadowColor}18`
          : "0 1px 4px rgba(31,37,40,0.06)",
        borderColor: isHovered ? `${platform.shadowColor}40` : undefined,
      }}
    >
      {/* Coloured gradient wash at top of card */}
      <div
        className="h-16 w-full rounded-t-3xl flex-shrink-0 relative overflow-hidden"
        style={{ background: platform.bgGradient, opacity: isHovered ? 1 : 0.88, transition: "opacity 0.3s" }}
      >
        {/* Subtle dot pattern overlay */}
        <div className="absolute inset-0" style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.15) 1px, transparent 0)",
          backgroundSize: "16px 16px",
        }} />
        {/* Large faint icon watermark */}
        <div className="absolute -right-2 -bottom-3 opacity-20" style={{ color: "#fff" }}>
          <PlatformLogo id={platform.id} className="h-16 w-16" />
        </div>
        {/* Status badge top-left */}
        <div className="absolute top-3 left-3">
          {platform.connected ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-black/20 backdrop-blur-sm px-2 py-0.5 border border-white/20">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 animate-pulse" />
              <span className="text-[9px] font-black uppercase tracking-wider" style={{ color: "#fff" }}>Live</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-black/20 backdrop-blur-sm px-2 py-0.5 border border-white/20">
              <span className="h-1.5 w-1.5 rounded-full bg-white/50" />
              <span className="text-[9px] font-black uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.7)" }}>Offline</span>
            </span>
          )}
        </div>
        {/* 3-dot menu top-right */}
        <div className="absolute top-2.5 right-2.5" ref={menuRef}>
          <button
            type="button"
            className="grid h-7 w-7 place-items-center rounded-xl border border-white/25 bg-black/15 backdrop-blur-sm hover:bg-black/30 transition-all cursor-pointer"
            style={{ color: "#fff" }}
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((prev) => !prev);
            }}
            onTouchEnd={(e) => {
              e.stopPropagation();
            }}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
          <AnimatePresence>
            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.92, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: -4 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-8 z-50 min-w-[160px] rounded-2xl border border-slate-200 bg-white/95 backdrop-blur-md p-1.5 shadow-xl"
              >
                {platform.connected && (
                  <a
                    href={profileUrls[platform.id] ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setMenuOpen(false)}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                  >
                    <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                    View profile
                  </a>
                )}
                {platform.connected && platform.handle && (
                  <button
                    onClick={() => { navigator.clipboard.writeText(platform.handle); setMenuOpen(false); }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                  >
                    <Check className="h-3.5 w-3.5 text-slate-400" />
                    Copy handle
                  </button>
                )}
                {!platform.connected && (
                  <div className="px-3 py-2 text-xs text-slate-400 font-medium">No actions yet</div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Avatar overlapping the gradient */}
      <div className="px-4 -mt-7 mb-3 flex items-end justify-between">
        <div className="ring-4 ring-white rounded-2xl shadow-lg">
          <PlatformAvatar platform={platform} />
        </div>
        <span className="text-[10px] font-bold text-slate-400 bg-slate-50 border border-slate-100 rounded-full px-2 py-0.5 mb-1">
          {platform.category}
        </span>
      </div>

      <div className="px-4 pb-4">
        {/* Name */}
        <h3 className="text-sm font-black text-slate-800 mb-0.5">{platform.name}</h3>

        {/* Description */}
        <p className="text-[11px] text-slate-500 leading-relaxed mb-3 font-medium">{platform.description}</p>

        {/* Capability tags */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {platform.capabilities.map((cap) => (
            <span
              key={cap}
              className="inline-flex items-center rounded-lg px-2 py-0.5 text-[9px] font-black uppercase tracking-wide"
              style={{ background: `${platform.shadowColor}14`, color: platform.shadowColor }}
            >
              {cap}
            </span>
          ))}
        </div>

        {/* Divider */}
        <div className="border-t border-slate-100 mb-3" />

        {/* Account handle / status */}
        <div className="flex items-center gap-2 mb-2.5">
          {platform.connected ? (
            <div className="flex items-center justify-between rounded-xl bg-slate-50 border border-slate-100 px-3 py-2 flex-1 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <div className="h-5 w-5 rounded-lg flex-shrink-0 grid place-items-center" style={{ background: platform.bgGradient }}>
                  <Check className="h-3 w-3" style={{ color: "#fff" }} />
                </div>
                {platform.connectionDetails?.length ? (
                  <div className="min-w-0 space-y-0.5">
                    {platform.connectionDetails.map((detail) => (
                      <div key={detail} className="text-[10px] font-bold leading-tight text-slate-700 truncate">{detail}</div>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs font-bold text-slate-700 truncate">{platform.handle}</span>
                )}
              </div>
              <span className="text-[9px] font-black uppercase tracking-wider text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-full px-1.5 py-0.5 flex-shrink-0 ml-2">Auth ✓</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-xl bg-slate-50/50 border border-dashed border-slate-200 px-3 py-2 flex-1">
              <WifiOff className="h-3.5 w-3.5 text-slate-300 flex-shrink-0" />
              <span className="text-[11px] font-semibold text-slate-400">No account connected</span>
            </div>
          )}
        </div>

        {/* Sync info */}
        {platform.connected && (
          <div className="flex items-center gap-1.5 mb-3">
            <RefreshCw className="h-3 w-3 text-slate-300" />
            <span className="text-[10px] text-slate-400 font-medium">{platform.lastSync}</span>
          </div>
        )}

        {/* Action button */}
        {platform.connected ? (
          <button
            disabled={isDisconnecting}
            onClick={onDisconnect}
            className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white text-slate-500 font-bold text-xs py-2 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-600 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed mt-1"
          >
            {isDisconnecting ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Disconnecting…</>
            ) : (
              <><X className="h-3.5 w-3.5" /> Disconnect</>
            )}
          </button>
        ) : (
          <button
            onClick={onConnect}
            className="w-full flex items-center justify-center gap-1.5 rounded-xl font-bold text-xs py-2.5 transition-all duration-200 hover:opacity-90 hover:shadow-md active:scale-[0.98] shadow-sm mt-1"
            style={{ background: platform.bgGradient, color: "#ffffff" }}
          >
            {isLimitReached ? <Lock className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            Connect {platform.name}
          </button>
        )}
      </div>
    </motion.div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function IntegrationsClient({ socialAccounts }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { entitlements } = useSubscription();
  const maxConnected = entitlements?.maxConnectedPlatforms ?? 4;

  const [paywallOpen, setPaywallOpen] = useState(false);
  const [dismissedUrlError, setDismissedUrlError] = useState(false);
  const [paywallFeature, setPaywallFeature] = useState("Connected Platforms");
  const [paywallDescription, setPaywallDescription] = useState("");

  const [disconnectingPlatform, setDisconnectingPlatform] = useState<string | null>(null);
  const [blueskyModalOpen, setBlueskyModalOpen] = useState(false);
  const [blueskyHandle, setBlueskyHandle] = useState("");
  const [blueskyAppPassword, setBlueskyAppPassword] = useState("");
  const [blueskyConnecting, setBlueskyConnecting] = useState(false);
  const [blueskyError, setBlueskyError] = useState<string | null>(null);
  const [discordModalOpen, setDiscordModalOpen] = useState(false);
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState("");
  const [discordServerName, setDiscordServerName] = useState("");
  const [discordChannelName, setDiscordChannelName] = useState("");
  const [discordServerLogoUrl, setDiscordServerLogoUrl] = useState("");
  const [discordConnecting, setDiscordConnecting] = useState(false);
  const [discordError, setDiscordError] = useState<string | null>(null);

  const [telegramModalOpen, setTelegramModalOpen] = useState(false);
  const [telegramMethodTab, setTelegramMethodTab] = useState<"phone" | "bot">("phone");
  const [telegramStep, setTelegramStep] = useState<"phone" | "code">("phone");
  const [telegramPhoneNumber, setTelegramPhoneNumber] = useState("");
  const [telegramPhoneCode, setTelegramPhoneCode] = useState("");
  const [telegram2FAPassword, setTelegram2FAPassword] = useState("");
  const [telegramPhoneCodeHash, setTelegramPhoneCodeHash] = useState("");
  const [telegramSessionString, setTelegramSessionString] = useState("");
  const [telegramBotToken, setTelegramBotToken] = useState("");
  const [telegramChatId, setTelegramChatId] = useState("");
  const [telegramConnecting, setTelegramConnecting] = useState(false);
  const [telegramError, setTelegramError] = useState<string | null>(null);

  const [pinterestModalOpen, setPinterestModalOpen] = useState(false);
  const [pinterestAccessToken, setPinterestAccessToken] = useState("");
  const [pinterestConnecting, setPinterestConnecting] = useState(false);
  const [pinterestError, setPinterestError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<"all" | "connected" | "available">("all");

  const facebookAccount  = getConnectedFacebookAccount(socialAccounts);
  const instagramAccount = getConnectedInstagramAccount(socialAccounts);
  const youtubeAccount   = getConnectedYouTubeAccount(socialAccounts);
  const threadsAccount   = getConnectedThreadsAccount(socialAccounts);
  const blueskyAccount   = getConnectedBlueskyAccount(socialAccounts);
  const pinterestAccount = getConnectedPinterestAccount(socialAccounts);
  const linkedinAccount  = getConnectedLinkedInAccount(socialAccounts);
  const discordAccount   = getConnectedDiscordAccount(socialAccounts);
  const telegramAccount  = getConnectedTelegramAccount(socialAccounts);

  const platforms: Platform[] = [
    {
      id: "instagram", name: "Instagram",
      color: "#E1306C",
      bgGradient: "linear-gradient(135deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)",
      shadowColor: "#E1306C",
      connected: Boolean(instagramAccount),
      handle: instagramAccount?.account_name ? `@${instagramAccount.account_name.replace(/^@/, "")}` : "Not connected",
      avatarUrl: instagramAccount?.account_avatar_url,
      lastSync: instagramAccount ? "Synced just now" : "Not connected",
      description: "Share photos, reels, and stories to your audience.",
      category: "Photo & Video",
      capabilities: ["Posts", "Reels", "Stories", "Carousel"],
    },
    {
      id: "facebook", name: "Facebook",
      color: "#1877F2",
      bgGradient: "linear-gradient(135deg, #1877F2, #0C5FD4)",
      shadowColor: "#1877F2",
      connected: Boolean(facebookAccount),
      handle: facebookAccount?.account_name || "Not connected",
      avatarUrl: facebookAccount?.account_avatar_url,
      lastSync: facebookAccount ? "Synced just now" : "Not connected",
      description: "Reach billions on the world's largest social network.",
      category: "Social Network",
      capabilities: ["Posts", "Photos", "Videos", "Pages"],
    },
    {
      id: "linkedin", name: "LinkedIn",
      color: "#0A66C2",
      bgGradient: "linear-gradient(135deg, #0A66C2, #0077B5)",
      shadowColor: "#0A66C2",
      connected: Boolean(linkedinAccount),
      handle: linkedinAccount?.account_name || "Not connected",
      avatarUrl: linkedinAccount?.account_avatar_url,
      lastSync: linkedinAccount ? "Synced just now" : "Not connected",
      description: "Build your professional brand and engage your network.",
      category: "Professional",
      capabilities: ["Posts", "Articles", "Documents"],
    },
    {
      id: "youtube", name: "YouTube",
      color: "#FF0000",
      bgGradient: "linear-gradient(135deg, #FF0000, #CC0000)",
      shadowColor: "#FF0000",
      connected: Boolean(youtubeAccount),
      handle: youtubeAccount?.account_name || "Not connected",
      avatarUrl: youtubeAccount?.account_avatar_url,
      lastSync: youtubeAccount ? "Synced just now" : "Not connected",
      description: "Upload videos and grow your subscriber base.",
      category: "Video",
      capabilities: ["Videos", "Shorts", "Thumbnails"],
    },
    {
      id: "threads", name: "Threads",
      color: "#6e6e6e",
      bgGradient: "linear-gradient(135deg, #4a4a4a, #2a2a2a)",
      shadowColor: "#6e6e6e",
      connected: Boolean(threadsAccount),
      handle: threadsAccount?.account_name ? `@${threadsAccount.account_name.replace(/^@/, "")}` : "Not connected",
      avatarUrl: threadsAccount?.account_avatar_url,
      lastSync: threadsAccount ? "Synced just now" : "Not connected",
      description: "Join conversations and share text-first posts.",
      category: "Microblogging",
      capabilities: ["Posts", "Replies", "Quotes"],
    },
    {
      id: "bluesky", name: "Bluesky",
      color: "#0085FF",
      bgGradient: "linear-gradient(135deg, #0085FF, #0068CC)",
      shadowColor: "#0085FF",
      connected: Boolean(blueskyAccount),
      handle: blueskyAccount?.account_name ? `@${blueskyAccount.account_name}` : "Not connected",
      avatarUrl: blueskyAccount?.account_avatar_url,
      lastSync: blueskyAccount ? "Synced just now" : "Not connected",
      description: "The decentralized social platform built for creators.",
      category: "Decentralized",
      capabilities: ["Posts", "Images", "Threads"],
    },
    {
      id: "pinterest", name: "Pinterest",
      color: "#E60023",
      bgGradient: "linear-gradient(135deg, #E60023, #B80014)",
      shadowColor: "#E60023",
      connected: Boolean(pinterestAccount),
      handle: pinterestAccount?.account_name || "Not connected",
      avatarUrl: pinterestAccount?.account_avatar_url,
      lastSync: pinterestAccount ? "Synced just now" : "Not connected",
      description: "Inspire millions with visual boards and pins.",
      category: "Visual Discovery",
      capabilities: ["Pins", "Boards", "Images"],
    },
    {
      id: "discord", name: "Discord",
      color: "#5865F2",
      bgGradient: "linear-gradient(135deg, #5865F2, #4752C4)",
      shadowColor: "#5865F2",
      connected: Boolean(discordAccount),
      handle: discordAccount ? discordConnectionDetails(discordAccount).join(" · ") : "Not connected",
      connectionDetails: discordAccount ? discordConnectionDetails(discordAccount) : undefined,
      avatarUrl: discordAccount?.account_avatar_url,
      lastSync: discordAccount ? "Synced just now" : "Not connected",
      description: "Publish updates, media and rich embeds directly to your server channels.",
      category: "Community",
      capabilities: ["Messages", "Embeds", "Images"],
    },
    {
      id: "telegram", name: "Telegram",
      color: "#26A5E4",
      bgGradient: "linear-gradient(135deg, #26A5E4, #1E88C7)",
      shadowColor: "#26A5E4",
      connected: Boolean(telegramAccount),
      handle: telegramAccount?.account_name || "Not connected",
      avatarUrl: telegramAccount?.account_avatar_url,
      lastSync: telegramAccount ? "Synced just now" : "Not connected",
      description: "Broadcast instant posts, photos, and videos to your channels or groups.",
      category: "Messenger",
      capabilities: ["Messages", "Photos", "Videos"],
    },
  ];

  const connectedCount = platforms.filter(p => p.connected).length;
  const isLimitReached = connectedCount >= maxConnected;
  const totalCount = platforms.length;
  const connectedPercent = Math.round((connectedCount / totalCount) * 100);

  const urlLimitError = searchParams.get("error") === "limit_reached";
  const urlMessage = searchParams.get("message");
  const isPaywallOpen = paywallOpen || (urlLimitError && !dismissedUrlError);
  const activePaywallFeature = urlLimitError && !paywallOpen ? "Connected Platforms" : paywallFeature;
  const activePaywallDescription =
    urlLimitError && !paywallOpen
      ? (urlMessage ||
          `You have reached the maximum of ${maxConnected} connected platforms on the ${entitlements?.name || "Starter"} plan. Upgrade to Pro to connect up to 8 platforms, or Plus for unlimited platforms!`)
      : paywallDescription;

  const filteredPlatforms = platforms.filter(p => {
    if (activeFilter === "connected") return p.connected;
    if (activeFilter === "available") return !p.connected;
    return true;
  });

  const connectPinterest = async () => {
    if (isLimitReached) {
      setPinterestError(`Plan limit reached: maximum ${maxConnected} platforms on ${entitlements?.name || "Starter"} plan.`);
      setPaywallFeature("Connected Platforms");
      setPaywallDescription(`You have reached the limit of ${maxConnected} connected platforms on the ${entitlements?.name || "Starter"} plan. Upgrade to connect more accounts.`);
      setPaywallOpen(true);
      return;
    }
    if (!pinterestAccessToken.trim()) {
      setPinterestError("Please enter your Pinterest Access Token.");
      return;
    }

    setPinterestConnecting(true);
    setPinterestError(null);

    try {
      const res = await fetch("/api/integrations/pinterest/manual-connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: pinterestAccessToken.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to connect Pinterest.");
      }

      setPinterestModalOpen(false);
      setPinterestAccessToken("");
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to connect Pinterest.";
      setPinterestError(msg);
    } finally {
      setPinterestConnecting(false);
    }
  };

  const handleConnect = (platform: Platform) => {
    if (!platform.connected && isLimitReached) {
      setPaywallFeature("Connected Platforms");
      setPaywallDescription(
        `You have connected ${connectedCount} of ${maxConnected} platforms allowed on the ${entitlements?.name || "Starter"} plan. Upgrade to Pro to connect up to 8 platforms, or Plus for unlimited platforms!`
      );
      setPaywallOpen(true);
      return;
    }
    if (platform.id === "bluesky") {
      setBlueskyError(null);
      setBlueskyModalOpen(true);
      return;
    }
    if (platform.id === "discord") {
      window.location.assign("/api/integrations/discord/connect");
      return;
    }
    if (platform.id === "telegram") {
      setTelegramError(null);
      setTelegramModalOpen(true);
      return;
    }
    if (platform.id === "pinterest") {
      setPinterestError(null);
      setPinterestModalOpen(true);
      return;
    }
    if (platform.id === "linkedin") {
      window.location.assign("/api/integrations/linkedin/connect");
      return;
    }
    const routes: Record<string, string> = {
      instagram: "/api/integrations/instagram/connect",
      facebook:  "/api/integrations/meta/connect?platform=facebook",
      threads:   "/api/integrations/threads/connect",
      youtube:   "/api/integrations/youtube/connect",
    };
    if (routes[platform.id]) window.location.assign(routes[platform.id]);
  };

  const handleDisconnect = async (platform: Platform) => {
    setDisconnectingPlatform(platform.id);
    try {
      if (platform.id === "linkedin") {
        await fetch("/api/integrations/linkedin/disconnect", { method: "DELETE" });
      } else {
        const routes: Record<string, string> = {
          instagram: "/api/integrations/meta/disconnect?platform=instagram",
          facebook:  "/api/integrations/meta/disconnect?platform=facebook",
          threads:   "/api/integrations/threads/disconnect",
          bluesky:   "/api/integrations/bluesky/disconnect",
          pinterest: "/api/integrations/pinterest/disconnect",
          youtube:   "/api/integrations/youtube/disconnect",
          discord:   "/api/integrations/discord/disconnect",
          telegram:  "/api/integrations/telegram/disconnect",
        };
        if (routes[platform.id]) await fetch(routes[platform.id], { method: "DELETE" });
      }
      window.location.reload();
    } catch {
      window.location.reload();
    }
  };

  const connectBluesky = async () => {
    if (isLimitReached) {
      setBlueskyError(`Plan limit reached: maximum ${maxConnected} platforms on ${entitlements?.name || "Starter"} plan.`);
      setPaywallFeature("Connected Platforms");
      setPaywallDescription(`You have connected ${connectedCount} of ${maxConnected} platforms allowed on your ${entitlements?.name || "Starter"} plan. Upgrade to Pro to connect up to 8 platforms, or Plus for unlimited platforms!`);
      setPaywallOpen(true);
      return;
    }
    if (!blueskyHandle.trim() || !blueskyAppPassword.trim()) {
      setBlueskyError("Enter both your handle and app password.");
      return;
    }
    setBlueskyConnecting(true);
    setBlueskyError(null);
    try {
      const res = await fetch("/api/integrations/bluesky/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: blueskyHandle.trim(), appPassword: blueskyAppPassword.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBlueskyError(data?.error || "Couldn't connect to Bluesky. Check your handle and app password.");
        return;
      }
      setBlueskyModalOpen(false);
      setBlueskyHandle("");
      setBlueskyAppPassword("");
      window.location.reload();
    } catch {
      setBlueskyError("Couldn't reach the server. Try again.");
    } finally {
      setBlueskyConnecting(false);
    }
  };

  const connectDiscord = async () => {
    if (isLimitReached) {
      setDiscordError(`Plan limit reached: maximum ${maxConnected} platforms on ${entitlements?.name || "Starter"} plan.`);
      setPaywallFeature("Connected Platforms");
      setPaywallDescription(`You have connected ${connectedCount} of ${maxConnected} platforms allowed on your ${entitlements?.name || "Starter"} plan. Upgrade to Pro to connect up to 8 platforms, or Plus for unlimited platforms!`);
      setPaywallOpen(true);
      return;
    }
    if (!discordWebhookUrl.trim()) {
      setDiscordError("Enter your Discord Webhook URL.");
      return;
    }
    setDiscordConnecting(true);
    setDiscordError(null);
    try {
      const res = await fetch("/api/integrations/discord/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookUrl: discordWebhookUrl.trim(), serverName: discordServerName.trim(), channelName: discordChannelName.trim(), serverLogoUrl: discordServerLogoUrl.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDiscordError(data?.error || "Couldn't connect to Discord. Check your Webhook URL.");
        return;
      }
      setDiscordModalOpen(false);
      setDiscordWebhookUrl("");
      setDiscordServerName("");
      setDiscordChannelName("");
      setDiscordServerLogoUrl("");
      window.location.reload();
    } catch {
      setDiscordError("Couldn't reach the server. Try again.");
    } finally {
      setDiscordConnecting(false);
    }
  };

  const sendTelegramCode = async () => {
    if (isLimitReached) {
      setTelegramError(`Plan limit reached: maximum ${maxConnected} platforms on ${entitlements?.name || "Starter"} plan.`);
      setPaywallFeature("Connected Platforms");
      setPaywallDescription(`You have connected ${connectedCount} of ${maxConnected} platforms allowed on your ${entitlements?.name || "Starter"} plan. Upgrade to Pro to connect up to 8 platforms, or Plus for unlimited platforms!`);
      setPaywallOpen(true);
      return;
    }
    if (!telegramPhoneNumber.trim()) {
      setTelegramError("Please enter your Telegram phone number with country code (e.g. +1234567890).");
      return;
    }
    setTelegramConnecting(true);
    setTelegramError(null);
    try {
      const res = await fetch("/api/integrations/telegram/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send_code", phoneNumber: telegramPhoneNumber.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTelegramError(data?.error || "Failed to send code to Telegram.");
        return;
      }
      setTelegramPhoneCodeHash(data.phoneCodeHash || "");
      setTelegramSessionString(data.sessionString || "");
      setTelegramStep("code");
    } catch {
      setTelegramError("Couldn't reach the server. Try again.");
    } finally {
      setTelegramConnecting(false);
    }
  };

  const verifyTelegramCode = async () => {
    if (!telegramPhoneCode.trim()) {
      setTelegramError("Please enter the 5-digit code sent to your Telegram app.");
      return;
    }
    setTelegramConnecting(true);
    setTelegramError(null);
    try {
      const res = await fetch("/api/integrations/telegram/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "verify_code",
          phoneNumber: telegramPhoneNumber.trim(),
          phoneCode: telegramPhoneCode.trim(),
          phoneCodeHash: telegramPhoneCodeHash,
          sessionString: telegramSessionString,
          password: telegram2FAPassword.trim() || undefined,
          chatId: telegramChatId.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTelegramError(data?.error || "Verification failed. Check your code.");
        return;
      }
      setTelegramModalOpen(false);
      window.location.reload();
    } catch {
      setTelegramError("Couldn't reach the server. Try again.");
    } finally {
      setTelegramConnecting(false);
    }
  };

  const connectTelegramBot = async () => {
    if (isLimitReached) {
      setTelegramError(`Plan limit reached: maximum ${maxConnected} platforms on ${entitlements?.name || "Starter"} plan.`);
      setPaywallFeature("Connected Platforms");
      setPaywallDescription(`You have connected ${connectedCount} of ${maxConnected} platforms allowed on your ${entitlements?.name || "Starter"} plan. Upgrade to Pro to connect up to 8 platforms, or Plus for unlimited platforms!`);
      setPaywallOpen(true);
      return;
    }
    if (!telegramBotToken.trim() || !telegramChatId.trim()) {
      setTelegramError("Enter both your Bot Token and Chat/Channel ID.");
      return;
    }
    setTelegramConnecting(true);
    setTelegramError(null);
    try {
      const res = await fetch("/api/integrations/telegram/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botToken: telegramBotToken.trim(), chatId: telegramChatId.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTelegramError(data?.error || "Couldn't connect to Telegram. Check your Token and Chat/Channel ID.");
        return;
      }
      setTelegramModalOpen(false);
      setTelegramBotToken("");
      setTelegramChatId("");
      window.location.reload();
    } catch {
      setTelegramError("Couldn't reach the server. Try again.");
    } finally {
      setTelegramConnecting(false);
    }
  };

  return (
    <div className="min-h-full">
      {/* ── Hero Header Section ─────────────────────────────────────────────── */}
      <div className="relative overflow-hidden border-b border-slate-100 bg-gradient-to-br from-white via-slate-50/50 to-white">
        {/* Background decoration */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-gradient-to-br from-emerald-100/60 to-teal-50/40 blur-3xl" />
          <div className="absolute -bottom-12 -left-12 w-64 h-64 rounded-full bg-gradient-to-tr from-slate-100/80 to-emerald-50/30 blur-2xl" />
          {/* Grid dot pattern */}
          <div
            className="absolute inset-0 opacity-40"
            style={{
              backgroundImage: "radial-gradient(circle at 1px 1px, rgba(31, 37, 40, 0.06) 1px, transparent 0)",
              backgroundSize: "28px 28px",
            }}
          />
        </div>

        <div className="relative px-6 md:px-10 py-10 md:py-12">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
            {/* Left: title + subtitle */}
            <div>
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="flex items-center gap-2 mb-3"
              >
                <div className="flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1">
                  <Globe className="h-3 w-3 text-emerald-600" />
                  <span className="text-[10px] font-black uppercase tracking-[0.15em] text-emerald-700">Platform Hub</span>
                </div>
              </motion.div>
              <motion.h1
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05, duration: 0.4 }}
                className="text-4xl md:text-5xl font-black tracking-tight text-slate-900 leading-none"
              >
                Integrations
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.4 }}
                className="mt-2.5 text-slate-500 text-sm font-medium max-w-md leading-relaxed"
              >
                Connect your social accounts and publish everywhere from one place — faster than ever.
              </motion.p>

              {/* Feature pills */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, duration: 0.4 }}
                className="flex flex-wrap gap-2 mt-5"
              >
                {[
                  { icon: Shield, label: "OAuth Secured" },
                  { icon: Zap, label: "Instant Sync" },
                  { icon: Activity, label: "Live Status" },
                ].map(({ icon: Icon, label }) => (
                  <div key={label} className="flex items-center gap-1.5 rounded-full bg-white border border-slate-200 px-3 py-1.5 shadow-sm">
                    <Icon className="h-3 w-3 text-[#2f7867]" />
                    <span className="text-[10px] font-bold text-slate-600">{label}</span>
                  </div>
                ))}
              </motion.div>
            </div>

            {/* Right: Stats + platform mosaic */}
            <motion.div
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="flex flex-col items-start lg:items-end gap-5 w-full lg:w-auto"
            >
              {/* Connected channels counter card */}
              <div className="rounded-2xl border border-slate-200 bg-white/90 backdrop-blur-sm px-5 py-4 shadow-md flex items-center gap-5 w-full sm:w-auto">
                {/* Progress ring */}
                <div className="relative w-16 h-16 flex-shrink-0">
                  <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                    <circle cx="32" cy="32" r="26" fill="none" stroke="#f1f5f9" strokeWidth="6" />
                    <motion.circle
                      cx="32" cy="32" r="26"
                      fill="none"
                      stroke="url(#ringGrad)"
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 26}`}
                      initial={{ strokeDashoffset: 2 * Math.PI * 26 }}
                      animate={{ strokeDashoffset: 2 * Math.PI * 26 * (1 - connectedPercent / 100) }}
                      transition={{ delay: 0.4, duration: 1, ease: "easeOut" }}
                    />
                    <defs>
                      <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#2f7867" />
                        <stop offset="100%" stopColor="#4ade80" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-lg font-black text-slate-800">{connectedCount}</span>
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 leading-none">Connected</p>
                    {isLimitReached && (
                      <span className="text-[9px] font-black uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5">
                        Limit Reached
                      </span>
                    )}
                  </div>
                  <p className="text-2xl font-black text-slate-900 mt-1 leading-none">
                    {connectedCount}
                    <span className="text-sm font-bold text-slate-400 ml-1">/ {maxConnected}</span>
                  </p>
                  <p className="text-[10px] text-slate-400 font-medium mt-1">
                    {connectedCount === 0
                      ? "Connect your first account →"
                      : isLimitReached
                      ? `${entitlements?.name || "Starter"} plan limit reached (max ${maxConnected})`
                      : `${maxConnected - connectedCount} platform slot${maxConnected - connectedCount === 1 ? "" : "s"} left`}
                  </p>
                </div>
              </div>

              {/* Platform icons mosaic */}
              <div className="flex items-center gap-2 max-w-full overflow-x-auto pb-1 no-scrollbar sm:flex-wrap">
                {platforms.map((p, i) => (
                  <MosaicIcon key={p.id} platform={p} delay={0.25 + i * 0.05} />
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* ── Filter Bar ──────────────────────────────────────────────────────── */}
      <div className="px-6 md:px-10 py-5 flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 bg-white/60 backdrop-blur-sm sticky top-0 z-20">
        <div className="flex items-center gap-2">
          {(["all", "connected", "available"] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={cn(
                "px-4 py-1.5 rounded-xl text-xs font-bold transition-all duration-200",
                activeFilter === filter
                  ? "shadow-sm border border-[#2f7867]/30"
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
              )}
              style={activeFilter === filter ? { background: "rgba(47,120,103,0.10)", color: "#1a4a3a" } : undefined}
            >
              {filter === "all" ? `All (${totalCount})` : filter === "connected" ? `Connected (${connectedCount})` : `Available (${totalCount - connectedCount})`}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-slate-300" />
          <span className="text-xs text-slate-400 font-medium">More integrations coming soon</span>
        </div>
      </div>

      {/* ── Platform Cards Grid ──────────────────────────────────────────────── */}
      <div className="px-6 md:px-10 py-8">
        {isLimitReached && (
          <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
                <Lock className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-amber-900">
                  Platform Connection Limit Reached ({connectedCount}/{maxConnected})
                </h4>
                <p className="text-xs text-amber-700">
                  Your {entitlements?.name || "Starter"} plan allows up to {maxConnected} connected platforms. Upgrade to Pro to connect up to 8 platforms, or Plus for unlimited platforms.
                </p>
              </div>
            </div>
            <Button
              onClick={() => {
                setPaywallFeature("Connected Platforms");
                setPaywallDescription(
                  `Upgrade to Pro to connect up to 8 platforms, or Plus for unlimited platforms!`
                );
                setPaywallOpen(true);
              }}
              className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-sm"
            >
              <Sparkles className="h-3.5 w-3.5 mr-1" />
              Upgrade to Pro
            </Button>
          </div>
        )}

        <AnimatePresence mode="wait">
          {filteredPlatforms.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-20 text-center"
            >
              <div className="h-16 w-16 rounded-2xl bg-slate-100 grid place-items-center mb-4">
                <WifiOff className="h-7 w-7 text-slate-400" />
              </div>
              <p className="text-slate-600 font-bold">No platforms in this filter</p>
              <p className="text-slate-400 text-sm mt-1">Try switching to &quot;All&quot; to see everything.</p>
            </motion.div>
          ) : (
            <motion.div
              key="grid"
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
            >
              {filteredPlatforms.map((platform, index) => {
                const platformCfg = PLATFORM_CONFIG.find((c) => c.id === platform.id);
                const isAvailable = !platformCfg || platformCfg.available;

                if (!isAvailable) {
                  // Coming soon card
                  return (
                    <motion.div
                      key={platform.id}
                      initial={{ opacity: 0, y: 24 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.06, duration: 0.4 }}
                      className="relative flex flex-col rounded-3xl border border-dashed border-slate-200 bg-slate-50/50 p-5 opacity-70"
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <div
                          className="h-14 w-14 rounded-2xl grid place-items-center text-white flex-shrink-0 opacity-60"
                          style={{ background: platform.bgGradient }}
                        >
                          <PlatformLogo id={platform.id} className="h-7 w-7" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-black text-slate-600">{platform.name}</h3>
                            <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-700">Soon</span>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-0.5">{platform.category}</p>
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed mb-4">{platform.description}</p>
                      {platformCfg?.comingSoonReason && (
                        <p className="text-[10px] text-amber-600 font-semibold bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mb-3">
                          {platformCfg.comingSoonReason}
                        </p>
                      )}
                      <button disabled className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100 text-slate-400 font-bold text-xs py-2.5 cursor-not-allowed">
                        🔒 Coming Soon
                      </button>
                    </motion.div>
                  );
                }

                return (
                  <PlatformCard
                    key={platform.id}
                    platform={platform}
                    index={index}
                    onConnect={() => handleConnect(platform)}
                    onDisconnect={() => void handleDisconnect(platform)}
                    isDisconnecting={disconnectingPlatform === platform.id}
                    isLimitReached={isLimitReached}
                  />
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Bottom info banner ─────────────────────────────────────────────── */}
      </div>

      {/* ── Bluesky Modal ───────────────────────────────────────────────────── */}
      <AnimatePresence>
        {blueskyModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] grid place-items-center bg-slate-900/40 backdrop-blur-md p-4"
            onClick={() => !blueskyConnecting && setBlueskyModalOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 16 }}
              transition={{ type: "spring", stiffness: 300, damping: 28 }}
              className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-7 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal header */}
              <div className="flex items-center gap-3 mb-5">
                <div
                  className="h-12 w-12 rounded-2xl grid place-items-center text-white shadow-lg flex-shrink-0"
                  style={{ background: "linear-gradient(135deg, #0085FF, #0068CC)" }}
                >
                  <PlatformLogo id="bluesky" className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-800 leading-none">Connect Bluesky</h3>
                  <p className="text-xs text-slate-400 font-medium mt-1">Use an app password for security</p>
                </div>
              </div>

              <p className="text-xs text-slate-500 font-medium leading-relaxed mb-5">
                Use an app password, not your main account password.{" "}
                <a
                  href="https://bsky.app/settings/app-passwords"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-sky-600 hover:underline"
                >
                  Create one here →
                </a>
              </p>

              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Handle</label>
                  <input
                    type="text"
                    value={blueskyHandle}
                    onChange={(e) => setBlueskyHandle(e.target.value)}
                    placeholder="yourname.bsky.social"
                    disabled={blueskyConnecting}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm font-bold text-slate-800 outline-none focus:bg-white focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">App Password</label>
                  <input
                    type="password"
                    value={blueskyAppPassword}
                    onChange={(e) => setBlueskyAppPassword(e.target.value)}
                    placeholder="xxxx-xxxx-xxxx-xxxx"
                    disabled={blueskyConnecting}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm font-bold text-slate-800 outline-none focus:bg-white focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition"
                  />
                </div>
              </div>

              {blueskyError && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 text-xs font-bold text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-4 py-2.5"
                >
                  {blueskyError}
                </motion.p>
              )}

              <div className="mt-6 flex gap-2.5">
                <Button
                  variant="secondary"
                  size="sm"
                  className="flex-1 rounded-xl h-10 text-xs font-bold"
                  disabled={blueskyConnecting}
                  onClick={() => setBlueskyModalOpen(false)}
                >
                  Cancel
                </Button>
                <button
                  disabled={blueskyConnecting}
                  onClick={() => void connectBluesky()}
                  className="flex-1 text-white font-bold transition rounded-xl text-xs h-10 flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50 hover:opacity-90 active:scale-[0.98]"
                  style={{ background: "linear-gradient(135deg, #0085FF, #0068CC)" }}
                >
                  {blueskyConnecting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {blueskyConnecting ? "Connecting…" : "Connect Account"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* ── Discord Modal ───────────────────────────────────────────────────── */}
      <AnimatePresence>
        {discordModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] grid place-items-center bg-slate-900/40 backdrop-blur-md p-4"
            onClick={() => !discordConnecting && setDiscordModalOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 16 }}
              transition={{ type: "spring", stiffness: 300, damping: 28 }}
              className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-7 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal header */}
              <div className="flex items-center gap-3 mb-5">
                <div
                  className="h-12 w-12 rounded-2xl grid place-items-center text-white shadow-lg flex-shrink-0"
                  style={{ background: "linear-gradient(135deg, #5865F2, #4752C4)" }}
                >
                  <PlatformLogo id="discord" className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-800 leading-none">Connect Discord</h3>
                  <p className="text-xs text-slate-400 font-medium mt-1">Use a Webhook integration URL</p>
                </div>
              </div>

              <p className="text-xs text-slate-500 font-medium leading-relaxed mb-5">
                Go to Discord Channel Settings → Integrations → Webhooks, create a Webhook, and copy its URL here.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Webhook URL</label>
                  <input
                    type="text"
                    value={discordWebhookUrl}
                    onChange={(e) => setDiscordWebhookUrl(e.target.value)}
                    placeholder="https://discord.com/api/webhooks/..."
                    disabled={discordConnecting}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm font-bold text-slate-800 outline-none focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Server name</label>
                  <input
                    type="text"
                    value={discordServerName}
                    onChange={(e) => setDiscordServerName(e.target.value)}
                    placeholder="Your Discord server"
                    disabled={discordConnecting}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm font-bold text-slate-800 outline-none focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Channel name</label>
                  <input
                    type="text"
                    value={discordChannelName}
                    onChange={(e) => setDiscordChannelName(e.target.value)}
                    placeholder="#announcements"
                    disabled={discordConnecting}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm font-bold text-slate-800 outline-none focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Server logo URL <span className="normal-case font-medium">(optional)</span></label>
                  <input
                    type="url"
                    value={discordServerLogoUrl}
                    onChange={(e) => setDiscordServerLogoUrl(e.target.value)}
                    placeholder="https://…/server-logo.png"
                    disabled={discordConnecting}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm font-bold text-slate-800 outline-none focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition"
                  />
                  <p className="mt-1 text-[10px] leading-4 text-slate-400">Webhook connections do not always expose the server icon. Add a public image URL to show it on this card.</p>
                </div>
              </div>

              {discordError && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 text-xs font-bold text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-4 py-2.5"
                >
                  {discordError}
                </motion.p>
              )}

              <div className="mt-6 flex gap-2.5">
                <Button
                  variant="secondary"
                  size="sm"
                  className="flex-1 rounded-xl h-10 text-xs font-bold"
                  disabled={discordConnecting}
                  onClick={() => setDiscordModalOpen(false)}
                >
                  Cancel
                </Button>
                <button
                  disabled={discordConnecting}
                  onClick={() => void connectDiscord()}
                  className="flex-1 text-white font-bold transition rounded-xl text-xs h-10 flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50 hover:opacity-90 active:scale-[0.98]"
                  style={{ background: "linear-gradient(135deg, #5865F2, #4752C4)" }}
                >
                  {discordConnecting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {discordConnecting ? "Connecting…" : "Connect Account"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Telegram Modal ───────────────────────────────────────────────────── */}
      <AnimatePresence>
        {telegramModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] grid place-items-center bg-slate-900/40 backdrop-blur-md p-4"
            onClick={() => !telegramConnecting && setTelegramModalOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 16 }}
              transition={{ type: "spring", stiffness: 300, damping: 28 }}
              className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-7 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal header */}
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="h-12 w-12 rounded-2xl grid place-items-center text-white shadow-lg flex-shrink-0"
                  style={{ background: "linear-gradient(135deg, #26A5E4, #1E88C7)" }}
                >
                  <PlatformLogo id="telegram" className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-800 leading-none">Connect Telegram</h3>
                  <p className="text-xs text-slate-400 font-medium mt-1">Option 4: Phone & App Code Login</p>
                </div>
              </div>

              {/* Method Switcher Tabs */}
              <div className="flex rounded-xl bg-slate-100 p-1 mb-5">
                <button
                  type="button"
                  onClick={() => { setTelegramMethodTab("phone"); setTelegramError(null); }}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${telegramMethodTab === "phone" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                >
                  📱 Phone + Code (Option 4)
                </button>
                <button
                  type="button"
                  onClick={() => { setTelegramMethodTab("bot"); setTelegramError(null); }}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${telegramMethodTab === "bot" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                >
                  🤖 Bot Token
                </button>
              </div>

              {telegramMethodTab === "phone" ? (
                <>
                  {telegramStep === "phone" ? (
                    <div className="space-y-4">
                      <div>
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Telegram Phone Number</label>
                        <input
                          type="text"
                          value={telegramPhoneNumber}
                          onChange={(e) => setTelegramPhoneNumber(e.target.value)}
                          placeholder="+1234567890 (with country code)"
                          disabled={telegramConnecting}
                          className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm font-bold text-slate-800 outline-none focus:bg-white focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Target Channel Handle (Optional)</label>
                        <input
                          type="text"
                          value={telegramChatId}
                          onChange={(e) => setTelegramChatId(e.target.value)}
                          placeholder="@mychannel (or leave empty for personal profile)"
                          disabled={telegramConnecting}
                          className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm font-bold text-slate-800 outline-none focus:bg-white focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="rounded-xl border border-sky-100 bg-sky-50 px-3.5 py-2.5 text-xs font-semibold text-sky-800 flex items-center justify-between">
                        <span>Code sent to <strong>{telegramPhoneNumber}</strong></span>
                        <button type="button" onClick={() => setTelegramStep("phone")} className="text-[11px] underline text-sky-600 font-bold">Change</button>
                      </div>
                      <div>
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">5-Digit Telegram App Code</label>
                        <input
                          type="text"
                          value={telegramPhoneCode}
                          onChange={(e) => setTelegramPhoneCode(e.target.value)}
                          placeholder="e.g. 54321"
                          disabled={telegramConnecting}
                          className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-base font-black tracking-widest text-slate-800 outline-none focus:bg-white focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">2FA Password (If Enabled on your account)</label>
                        <input
                          type="password"
                          value={telegram2FAPassword}
                          onChange={(e) => setTelegram2FAPassword(e.target.value)}
                          placeholder="Leave blank if no 2FA password set"
                          disabled={telegramConnecting}
                          className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm font-bold text-slate-800 outline-none focus:bg-white focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition"
                        />
                      </div>
                    </div>
                  )}

                  {telegramError && (
                    <motion.p
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-4 text-xs font-bold text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-4 py-2.5"
                    >
                      {telegramError}
                    </motion.p>
                  )}

                  <div className="mt-6 flex gap-2.5">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="flex-1 rounded-xl h-10 text-xs font-bold"
                      disabled={telegramConnecting}
                      onClick={() => setTelegramModalOpen(false)}
                    >
                      Cancel
                    </Button>
                    <button
                      disabled={telegramConnecting}
                      onClick={() => void (telegramStep === "phone" ? sendTelegramCode() : verifyTelegramCode())}
                      className="flex-1 text-white font-bold transition rounded-xl text-xs h-10 flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50 hover:opacity-90 active:scale-[0.98]"
                      style={{ background: "linear-gradient(135deg, #26A5E4, #1E88C7)" }}
                    >
                      {telegramConnecting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      {telegramConnecting ? "Processing…" : telegramStep === "phone" ? "Send Code to App 📩" : "Verify & Connect"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="rounded-2xl border border-sky-100 bg-sky-50/60 p-3.5 mb-4 text-xs text-slate-600 leading-relaxed space-y-1.5">
                    <p className="font-bold text-slate-800">Quick 3-Step Setup:</p>
                    <ol className="list-decimal list-inside space-y-1 font-medium text-slate-600">
                      <li>Open Telegram & search for <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="font-bold text-sky-600 underline">@BotFather ↗</a></li>
                      <li>Send <code className="bg-white px-1 py-0.5 rounded text-[11px] font-bold text-slate-800">/newbot</code> to get your <strong>Bot Token</strong></li>
                      <li>Add your bot as an <strong>Admin</strong> in your Telegram Channel</li>
                    </ol>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Bot API Token</label>
                      <input
                        type="text"
                        value={telegramBotToken}
                        onChange={(e) => setTelegramBotToken(e.target.value)}
                        placeholder="123456789:ABCdefGhIJKlmNoPQRsT..."
                        disabled={telegramConnecting}
                        className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm font-bold text-slate-800 outline-none focus:bg-white focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Telegram Channel Handle / ID</label>
                      <input
                        type="text"
                        value={telegramChatId}
                        onChange={(e) => setTelegramChatId(e.target.value)}
                        placeholder="@mychannel or -100xxxxxxxxx"
                        disabled={telegramConnecting}
                        className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm font-bold text-slate-800 outline-none focus:bg-white focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition"
                      />
                    </div>
                  </div>

                  {telegramError && (
                    <motion.p
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-4 text-xs font-bold text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-4 py-2.5"
                    >
                      {telegramError}
                    </motion.p>
                  )}

                  <div className="mt-6 flex gap-2.5">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="flex-1 rounded-xl h-10 text-xs font-bold"
                      disabled={telegramConnecting}
                      onClick={() => setTelegramModalOpen(false)}
                    >
                      Cancel
                    </Button>
                    <button
                      disabled={telegramConnecting}
                      onClick={() => void connectTelegramBot()}
                      className="flex-1 text-white font-bold transition rounded-xl text-xs h-10 flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50 hover:opacity-90 active:scale-[0.98]"
                      style={{ background: "linear-gradient(135deg, #26A5E4, #1E88C7)" }}
                    >
                      {telegramConnecting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      {telegramConnecting ? "Connecting…" : "Connect Account"}
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}

        {/* Pinterest Modal */}
        {pinterestModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
            onClick={() => !pinterestConnecting && setPinterestModalOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 16 }}
              transition={{ type: "spring", stiffness: 300, damping: 28 }}
              className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-7 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal header */}
              <div className="flex items-center gap-3 mb-5">
                <div
                  className="h-12 w-12 rounded-2xl grid place-items-center text-white shadow-lg flex-shrink-0"
                  style={{ background: "linear-gradient(135deg, #E60023, #BD081C)" }}
                >
                  <PlatformLogo id="pinterest" className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-800 leading-none">Connect Pinterest</h3>
                  <p className="text-xs text-slate-400 font-medium mt-1">Via Developer Access Token</p>
                </div>
              </div>

              <p className="text-xs text-slate-500 font-medium leading-relaxed mb-5">
                Generate an <strong>Access Token</strong> in your Pinterest Developer Portal (My Apps → Generate access tokens) and paste it below to connect immediately.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Pinterest Access Token</label>
                  <input
                    type="text"
                    value={pinterestAccessToken}
                    onChange={(e) => setPinterestAccessToken(e.target.value)}
                    placeholder="pina_..."
                    disabled={pinterestConnecting}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm font-bold text-slate-800 outline-none focus:bg-white focus:border-red-400 focus:ring-2 focus:ring-red-100 transition"
                  />
                </div>
              </div>

              {pinterestError && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 text-xs font-bold text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-4 py-2.5"
                >
                  {pinterestError}
                </motion.p>
              )}

              <div className="mt-6 flex gap-2.5">
                <Button
                  variant="secondary"
                  size="sm"
                  className="flex-1 rounded-xl h-10 text-xs font-bold"
                  disabled={pinterestConnecting}
                  onClick={() => setPinterestModalOpen(false)}
                >
                  Cancel
                </Button>
                <button
                  disabled={pinterestConnecting}
                  onClick={() => void connectPinterest()}
                  className="flex-1 text-white font-bold transition rounded-xl text-xs h-10 flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50 hover:opacity-90 active:scale-[0.98]"
                  style={{ background: "linear-gradient(135deg, #E60023, #BD081C)" }}
                >
                  {pinterestConnecting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {pinterestConnecting ? "Connecting…" : "Connect Account"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <PaywallModal
        isOpen={isPaywallOpen}
        onClose={() => {
          setPaywallOpen(false);
          setDismissedUrlError(true);
        }}
        featureName={activePaywallFeature}
        description={activePaywallDescription}
        requiredTier="pro"
      />
    </div>
  );
}
