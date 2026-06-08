"use client";

// Attention Mining Component v2.0
// Last updated: 2026-06-06

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";

// ============================================================
// CONFIGURATION
// ============================================================

// API base URL for Cloudflare Worker
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";

// Bitmedia publisher ID from env
const BITMEDIA_PUBLISHER_ID = process.env.NEXT_PUBLIC_BITMEDIA_PUBLISHER_ID || "";

// Ad provider: auto-detect based on whether publisher ID is set
type AdProvider = "bitmedia" | "placeholder";
const ACTIVE_PROVIDER: AdProvider = BITMEDIA_PUBLISHER_ID ? "bitmedia" : "placeholder";

// Reward schedule
const REWARD_SCHEDULE = [2, 1, 0.5, 0.25, 0.125, 0.0625, 0.03125, 0.015625];
const COOLDOWN_HOURS = 24;
const COOLDOWN_MS = COOLDOWN_HOURS * 60 * 60 * 1000;
const MIN_AD_VIEW_TIME = 5000;

// Placeholder ads for demo mode
const PLACEHOLDER_ADS = [
  {
    id: "ad-1",
    title: "Building the Decentralized Future",
    description: "JGT powers the next generation of AI-operated smart contracts.",
    sponsor: "Junction Generator",
    duration: 5,
    cta: "Learn More",
    ctaUrl: "https://junctiongenerator.net/whitepaper",
  },
  {
    id: "ad-2",
    title: "Proof-of-Useful-Compute",
    description: "Every mined joule secures the network and earns you rewards.",
    sponsor: "Junction Generator",
    duration: 5,
    cta: "Read Whitepaper",
    ctaUrl: "https://junctiongenerator.net/whitepaper",
  },
  {
    id: "ad-3",
    title: "Open-Source Contributor Reward Protocol",
    description: "Earn JGT by contributing to the Junction Generator ecosystem.",
    sponsor: "Junction Generator",
    duration: 5,
    cta: "Explore OSCRP",
    ctaUrl: "#rewards",
  },
];

// ============================================================
// TYPES
// ============================================================

type MiningState = "disconnected" | "ready" | "watching" | "claiming" | "cooldown";

interface WalletData {
  address: string;
  totalEarned: number;
  sessionEarned: number;
  adsWatched: number;
  lastSessionStart: number | null;
  cooldownEnd: number | null;
}

// ============================================================
// HELPERS
// ============================================================

function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return "00:00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function getCurrentReward(adsWatched: number): number {
  if (adsWatched < REWARD_SCHEDULE.length) return REWARD_SCHEDULE[adsWatched];
  return REWARD_SCHEDULE[REWARD_SCHEDULE.length - 1] / Math.pow(2, adsWatched - REWARD_SCHEDULE.length + 1);
}

function getRewardBreakdown(adsWatched: number): { ad: number; reward: number; cumulative: number }[] {
  const breakdown: { ad: number; reward: number; cumulative: number }[] = [];
  let cumulative = 0;
  for (let i = adsWatched; i < adsWatched + 5 && i < adsWatched + REWARD_SCHEDULE.length; i++) {
    const reward = getCurrentReward(i);
    cumulative += reward;
    breakdown.push({ ad: i + 1, reward, cumulative });
  }
  return breakdown;
}

// ============================================================
// API CALLS
// ============================================================

async function recordAdView(
  walletAddress: string,
  adIndex: number,
  rewardAmount: number,
  sessionId: string
): Promise<boolean> {
  if (!API_BASE_URL) {
    console.warn("[JGT Mining] API_BASE_URL not set, skipping ad view recording");
    return true;
  }
  try {
    const res = await fetch(`${API_BASE_URL}/api/ad-view`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress, adIndex, rewardAmount, sessionId }),
    });
    return res.ok;
  } catch (err) {
    console.error("[JGT Mining] Failed to record ad view:", err);
    return false;
  }
}

// ============================================================
// COMPONENT
// ============================================================

export default function AttentionMining() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();

  const [state, setState] = useState<MiningState>("disconnected");
  const [wallet, setWallet] = useState<WalletData | null>(null);

  // Sync wagmi address with local wallet state
  useEffect(() => {
    if (isConnected && address) {
      if (!wallet) {
        setWallet({ address, totalEarned: 0, sessionEarned: 0, adsWatched: 0, lastSessionStart: null, cooldownEnd: null });
      }
      if (state === "disconnected") setState("ready");
    } else {
      setWallet(null);
      setState("disconnected");
    }
  }, [isConnected, address]);
  const [currentAd, setCurrentAd] = useState<typeof PLACEHOLDER_ADS[0] | null>(null);
  const [adProgress, setAdProgress] = useState(0);
  const [adIndex, setAdIndex] = useState(0);
  const [showRules, setShowRules] = useState(false);
  const [showConstruction, setShowConstruction] = useState(false);
  const [adCompleted, setAdCompleted] = useState(false);
  const [adProviderReady, setAdProviderReady] = useState(false);
  const [apiStatus, setApiStatus] = useState<"connected" | "disconnected" | "unknown">("unknown");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const adContainerRef = useRef<HTMLDivElement>(null);
  const adImpressionRef = useRef<boolean>(false);
  const sessionIdRef = useRef<string>(`session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

  // Check if user has previously dismissed the construction overlay
  useEffect(() => {
    if (typeof window !== "undefined") {
      const dismissed = localStorage.getItem("jg_mining_preview_dismissed");
      setShowConstruction(!dismissed && ACTIVE_PROVIDER === "placeholder");
    }
  }, []);

  // Check API health on mount
  useEffect(() => {
    if (!API_BASE_URL) {
      setApiStatus("disconnected");
      return;
    }
    fetch(`${API_BASE_URL}/api/health`)
      .then((r) => r.ok ? setApiStatus("connected") : setApiStatus("disconnected"))
      .catch(() => setApiStatus("disconnected"));
  }, []);

  // Load Bitmedia ad script
  useEffect(() => {
    if (ACTIVE_PROVIDER === "placeholder") {
      setAdProviderReady(true);
      return;
    }
    if (ACTIVE_PROVIDER === "bitmedia") {
      const script = document.createElement("script");
      script.src = `https://cdn.bitmedia.io/ads/${BITMEDIA_PUBLISHER_ID}.js`;
      script.async = true;
      script.onload = () => {
        setAdProviderReady(true);
        console.log("[JGT Mining] Bitmedia ad provider loaded");
      };
      script.onerror = () => {
        console.error("[JGT Mining] Failed to load Bitmedia script");
        setAdProviderReady(true);
      };
      document.head.appendChild(script);
      return () => {
        if (script.parentNode) document.head.removeChild(script);
      };
    }
  }, []);

  // Render Bitmedia ad in container when watching
  useEffect(() => {
    if (state !== "watching" || !adContainerRef.current) return;
    adImpressionRef.current = false;

    if (ACTIVE_PROVIDER === "placeholder" || !adProviderReady) return;

    if (ACTIVE_PROVIDER === "bitmedia" && adContainerRef.current) {
      const container = adContainerRef.current;
      container.innerHTML = "";
      const adUnit = document.createElement("div");
      adUnit.id = `bitmedia-ad-${Date.now()}`;
      adUnit.className = "bitmedia-ad-unit";
      adUnit.style.width = "100%";
      adUnit.style.minHeight = "250px";
      adUnit.style.display = "flex";
      adUnit.style.alignItems = "center";
      adUnit.style.justifyContent = "center";
      container.appendChild(adUnit);

      const w = window as unknown as Record<string, unknown>;
      if (typeof w.bitmediaInit === "function") {
        (w.bitmediaInit as (opts: { containerId: string; publisherId: string }) => void)({
          containerId: adUnit.id,
          publisherId: BITMEDIA_PUBLISHER_ID,
        });
      }

      // Detect ad rendering by checking container content
      const checkInterval = setInterval(() => {
        if (container.children.length > 1 || container.innerHTML.length > 200) {
          clearInterval(checkInterval);
        }
      }, 500);

      const impressionTimer = setTimeout(() => {
        if (!adImpressionRef.current) {
          adImpressionRef.current = true;
          setAdCompleted(true);
          setState("claiming");
        }
      }, MIN_AD_VIEW_TIME);

      return () => {
        clearTimeout(impressionTimer);
        clearInterval(checkInterval);
      };
    }
  }, [state, adProviderReady]);

  // Clean up timers
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  // Cooldown countdown
  useEffect(() => {
    if (state === "cooldown" && wallet?.cooldownEnd) {
      cooldownRef.current = setInterval(() => {
        const now = Date.now();
        if (wallet.cooldownEnd && now >= wallet.cooldownEnd) {
          setState("ready");
          if (wallet) {
            setWallet({ ...wallet, adsWatched: 0, sessionEarned: 0, lastSessionStart: null, cooldownEnd: null });
          }
          if (cooldownRef.current) clearInterval(cooldownRef.current);
        }
      }, 1000);
    }
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, [state, wallet]);

  // Connect wallet via wagmi
  const connectWallet = useCallback(() => {
    connect({ connector: injected() });
  }, [connect]);

  // Start watching an ad
  const startAd = useCallback(() => {
    if (!wallet || state !== "ready") return;
    const ad = PLACEHOLDER_ADS[adIndex % PLACEHOLDER_ADS.length];
    setCurrentAd(ad);
    setAdProgress(0);
    setAdCompleted(false);
    setState("watching");

    if (ACTIVE_PROVIDER === "placeholder") {
      const duration = ad.duration;
      let elapsed = 0;
      timerRef.current = setInterval(() => {
        elapsed += 0.1;
        setAdProgress((elapsed / duration) * 100);
        if (elapsed >= duration) {
          if (timerRef.current) clearInterval(timerRef.current);
          setAdProgress(100);
          setAdCompleted(true);
          setState("claiming");
        }
      }, 100);
    }
  }, [wallet, state, adIndex]);

  // Claim reward — records to backend API
  const claimReward = useCallback(async () => {
    if (!wallet || !adCompleted) return;
    const reward = getCurrentReward(wallet.adsWatched);
    await recordAdView(wallet.address, wallet.adsWatched, reward, sessionIdRef.current);
    setWallet({
      ...wallet,
      totalEarned: wallet.totalEarned + reward,
      sessionEarned: wallet.sessionEarned + reward,
      adsWatched: wallet.adsWatched + 1,
      lastSessionStart: wallet.lastSessionStart || Date.now(),
    });
    setAdIndex((prev) => prev + 1);
    setCurrentAd(null);
    setAdProgress(0);
    setAdCompleted(false);
    setState("ready");
  }, [wallet, adCompleted]);

  // Start cooldown
  const startCooldown = useCallback(() => {
    if (!wallet) return;
    setWallet({ ...wallet, cooldownEnd: Date.now() + COOLDOWN_MS });
    setState("cooldown");
  }, [wallet]);

  // Dismiss construction overlay
  const dismissConstruction = useCallback(() => {
    setShowConstruction(false);
    if (typeof window !== "undefined") {
      localStorage.setItem("jg_mining_preview_dismissed", "true");
    }
  }, []);

  const timeRemaining = wallet?.cooldownEnd ? Math.max(0, wallet.cooldownEnd - Date.now()) : 0;
  const nextReward = wallet ? getCurrentReward(wallet.adsWatched) : 2;
  const rewardBreakdown = wallet ? getRewardBreakdown(wallet.adsWatched) : getRewardBreakdown(0);

  return (
    <div style={{ position: "relative" }}>
      {/* UNDER CONSTRUCTION OVERLAY */}
      {showConstruction && (
        <div style={{ position: "absolute", inset: 0, zIndex: 50, background: "rgba(3, 2, 9, 0.92)", backdropFilter: "blur(8px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", borderRadius: 16, border: "2px dashed rgba(155, 81, 224, 0.4)", gap: 16, padding: 32, minHeight: 400 }}>
          <div style={{ fontSize: 48, animation: "float 3s infinite ease-in-out" }}>🚧</div>
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, color: "var(--color-purple)", textAlign: "center" }}>Attention Mining — Coming Soon</h3>
          <p style={{ color: "var(--text-secondary)", textAlign: "center", maxWidth: 400, lineHeight: 1.6, fontSize: 14 }}>Watch advertisements, earn JGT tokens. This section is under active development and will go live soon.</p>
          <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
            <span style={{ background: "rgba(155, 81, 224, 0.15)", border: "1px solid rgba(155, 81, 224, 0.3)", padding: "4px 12px", borderRadius: 100, fontSize: 11, color: "var(--color-purple)", fontWeight: 600 }}>Ad Provider: {ACTIVE_PROVIDER === "bitmedia" ? "Bitmedia" : "TBA"}</span>
            <span style={{ background: "rgba(0, 242, 254, 0.1)", border: "1px solid rgba(0, 242, 254, 0.25)", padding: "4px 12px", borderRadius: 100, fontSize: 11, color: "var(--color-cyan)", fontWeight: 600 }}>Chain: Base</span>
          </div>
          <button onClick={dismissConstruction} style={{ background: "transparent", border: "1px solid var(--glass-border)", borderRadius: 8, color: "var(--text-muted)", padding: "8px 20px", cursor: "pointer", fontSize: 13, marginTop: 8 }}>Preview UI (Demo Mode)</button>
        </div>
      )}

      {/* MAIN MINING SECTION */}
      <div className="glass-container">
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
          <div>
            <h3 style={{ fontSize: 20, fontWeight: 800, display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-display)" }}>
              <span style={{ color: "var(--color-neon-green)" }}>⛏️</span> Attention Mining
            </h3>
            <p style={{ color: "var(--text-secondary)", fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>Watch advertisements to earn JGT tokens. Your attention has value.</p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {API_BASE_URL && (
              <span style={{ fontSize: 10, color: apiStatus === "connected" ? "var(--color-neon-green)" : "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: apiStatus === "connected" ? "var(--color-neon-green)" : "var(--text-muted)", display: "inline-block" }} />
                {apiStatus === "connected" ? "API Live" : "API Offline"}
              </span>
            )}
            <button onClick={() => setShowRules(!showRules)} style={{ background: "rgba(155, 81, 224, 0.1)", border: "1px solid rgba(155, 81, 224, 0.25)", borderRadius: 8, color: "var(--color-purple)", padding: "6px 14px", cursor: "pointer", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>
              {showRules ? "Hide Rules" : "📋 How It Works"}
            </button>
          </div>
        </div>

        {/* RULES PANEL */}
        {showRules && (
          <div style={{ background: "rgba(155, 81, 224, 0.05)", border: "1px solid rgba(155, 81, 224, 0.15)", borderRadius: 12, padding: 20, marginBottom: 20 }}>
            <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: "var(--color-purple)" }}>How Attention Mining Works</h4>
            <div style={{ display: "grid", gap: 10 }}>
              {[
                { step: "1", title: "Connect Wallet", desc: "Connect your Web3 wallet to start earning." },
                { step: "2", title: "Watch Advertisements", desc: "Click Start Mining to watch a short ad. You must watch the full duration." },
                { step: "3", title: "Earn JGT Tokens", desc: "After each completed ad, JGT tokens are credited to your pending rewards." },
                { step: "4", title: "Diminishing Returns", desc: "Each consecutive ad earns half the previous: 2 → 1 → 0.5 → 0.25 → ..." },
                { step: "5", title: "Daily Batch Distribution", desc: "Rewards are batched and distributed once per day to minimize gas fees." },
                { step: "6", title: "24-Hour Cooldown", desc: "After your session, a 24h timer starts. When it expires, rewards reset to 2 JGT per ad." },
              ].map((rule) => (
                <div key={rule.step} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <div style={{ minWidth: 28, height: 28, borderRadius: "50%", background: "rgba(155, 81, 224, 0.2)", border: "1px solid rgba(155, 81, 224, 0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "var(--color-purple)", flexShrink: 0 }}>{rule.step}</div>
                  <div><div style={{ fontWeight: 600, fontSize: 13 }}>{rule.title}</div><div style={{ color: "var(--text-secondary)", fontSize: 12, lineHeight: 1.5 }}>{rule.desc}</div></div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16, padding: "12px 16px", background: "rgba(0,0,0,0.2)", borderRadius: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "var(--text-secondary)" }}>Reward Schedule (per ad):</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {REWARD_SCHEDULE.map((reward, i) => (
                  <span key={i} style={{ background: "rgba(57, 255, 20, 0.08)", border: "1px solid rgba(57, 255, 20, 0.2)", padding: "3px 10px", borderRadius: 6, fontSize: 11, color: "var(--color-neon-green)", fontWeight: 600 }}>#{i + 1}: {reward} JGT</span>
                ))}
                <span style={{ background: "rgba(255, 255, 255, 0.05)", border: "1px solid rgba(255, 255, 255, 0.1)", padding: "3px 10px", borderRadius: 6, fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>#9+: continues halving...</span>
              </div>
            </div>
          </div>
        )}

        {/* WALLET CONNECTION */}
        {state === "disconnected" && (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🔗</div>
            <h4 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Connect Your Wallet</h4>
            <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 20, maxWidth: 350, margin: "0 auto 20px" }}>Connect your Web3 wallet to start earning JGT tokens by watching advertisements.</p>
            <button onClick={connectWallet} className="btn-glow-purple" style={{ fontSize: 15 }}>Connect Wallet</button>
          </div>
        )}

        {/* READY STATE */}
        {state === "ready" && wallet && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(0,0,0,0.25)", borderRadius: 10, padding: "12px 16px", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--color-neon-green)", boxShadow: "0 0 8px var(--color-neon-green)" }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-secondary)" }}>{wallet.address}</span>
              </div>
              <div style={{ display: "flex", gap: 16 }}>
                <div style={{ textAlign: "right" }}><div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Session</div><div style={{ fontSize: 15, fontWeight: 700, color: "var(--color-cyan)" }}>{wallet.sessionEarned.toFixed(4)} JGT</div></div>
                <div style={{ textAlign: "right" }}><div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Total</div><div style={{ fontSize: 15, fontWeight: 700, color: "var(--color-neon-green)" }}>{wallet.totalEarned.toFixed(4)} JGT</div></div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: "12px 14px", textAlign: "center" }}><div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Next Reward</div><div style={{ fontSize: 18, fontWeight: 800, color: "var(--color-neon-green)", marginTop: 2 }}>{nextReward} JGT</div></div>
              <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: "12px 14px", textAlign: "center" }}><div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Ads Watched</div><div style={{ fontSize: 18, fontWeight: 800, color: "var(--color-cyan)", marginTop: 2 }}>{wallet.adsWatched}</div></div>
              <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: "12px 14px", textAlign: "center" }}><div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Est. Session Value</div><div style={{ fontSize: 18, fontWeight: 800, color: "var(--color-purple)", marginTop: 2 }}>{rewardBreakdown[0]?.cumulative.toFixed(2)} JGT</div></div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Upcoming Rewards</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {rewardBreakdown.map((r) => (
                  <div key={r.ad} style={{ background: "rgba(57, 255, 20, 0.06)", border: "1px solid rgba(57, 255, 20, 0.12)", borderRadius: 6, padding: "4px 10px", fontSize: 11, color: "var(--color-neon-green)" }}>Ad #{r.ad}: <strong>{r.reward}</strong> JGT</div>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={startAd} className="btn-glow-purple" style={{ flex: 1, fontSize: 15 }}>⛏️ Start Mining (Watch Ad)</button>
              {wallet.adsWatched > 0 && (
                <button onClick={startCooldown} style={{ background: "rgba(255, 255, 255, 0.05)", border: "1px solid var(--glass-border)", borderRadius: 8, color: "var(--text-secondary)", padding: "12px 20px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>End Session</button>
              )}
            </div>
          </div>
        )}

        {/* WATCHING AD STATE */}
        {state === "watching" && currentAd && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{ACTIVE_PROVIDER === "bitmedia" ? "Loading advertisement..." : "Watching advertisement..."}</span>
                <span style={{ fontSize: 12, color: "var(--color-cyan)", fontWeight: 600 }}>{Math.round(adProgress)}%</span>
              </div>
              <div style={{ width: "100%", height: 6, background: "rgba(255,255,255,0.05)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${adProgress}%`, height: "100%", background: "linear-gradient(90deg, var(--color-cyan), var(--color-purple))", borderRadius: 3, transition: "width 0.1s linear" }} />
              </div>
            </div>
            <div ref={adContainerRef} style={{ background: "rgba(0,0,0,0.3)", border: "1px solid var(--glass-border)", borderRadius: 12, padding: ACTIVE_PROVIDER !== "placeholder" ? 0 : 24, textAlign: "center", minHeight: ACTIVE_PROVIDER !== "placeholder" ? 250 : 180, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, overflow: "hidden" }}>
              {(ACTIVE_PROVIDER === "placeholder" || !adProviderReady) && (
                <>
                  <div style={{ fontSize: 32 }}>{currentAd?.sponsor === "Junction Generator" ? "⚡" : "📺"}</div>
                  <h4 style={{ fontSize: 16, fontWeight: 700 }}>{currentAd?.title}</h4>
                  <p style={{ color: "var(--text-secondary)", fontSize: 13, maxWidth: 350, lineHeight: 1.5 }}>{currentAd?.description}</p>
                  <div style={{ background: "rgba(155, 81, 224, 0.1)", border: "1px solid rgba(155, 81, 224, 0.2)", borderRadius: 6, padding: "4px 12px", fontSize: 11, color: "var(--color-purple)" }}>Sponsored by {currentAd?.sponsor}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>Ad completes in {Math.max(0, Math.round((100 - adProgress) / 100 * 5))}s • Earn {nextReward} JGT</div>
                </>
              )}
            </div>
            <div style={{ textAlign: "center", marginTop: 8 }}>
              <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{ACTIVE_PROVIDER === "placeholder" ? "Demo Mode — No ads loaded" : "Ads provided by Bitmedia"}</span>
            </div>
          </div>
        )}

        {/* CLAIMING STATE */}
        {state === "claiming" && (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <h4 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Advertisement Complete!</h4>
            <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 16 }}>You earned <strong style={{ color: "var(--color-neon-green)" }}>{nextReward} JGT</strong> for watching that ad.</p>
            <p style={{ color: "var(--text-muted)", fontSize: 11, marginBottom: 16 }}>Rewards are batched and distributed daily to minimize gas fees.</p>
            <button onClick={claimReward} className="btn-glow-cyan" style={{ fontSize: 15 }}>Claim {nextReward} JGT</button>
          </div>
        )}

        {/* COOLDOWN STATE */}
        {state === "cooldown" && wallet && (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
            <h4 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Mining Session Cooldown</h4>
            <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 16 }}>Your 24-hour cooldown is active. When it expires, your rewards will reset to 2 JGT per ad.</p>
            <div style={{ background: "rgba(0,0,0,0.3)", border: "1px solid var(--glass-border)", borderRadius: 12, padding: 20, marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Time Until Reset</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 36, fontWeight: 800, color: "var(--color-purple)", letterSpacing: "0.05em" }}>{formatTimeRemaining(timeRemaining)}</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: 14 }}><div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Session Earned</div><div style={{ fontSize: 20, fontWeight: 800, color: "var(--color-cyan)", marginTop: 2 }}>{wallet.sessionEarned.toFixed(4)} JGT</div></div>
              <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: 14 }}><div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Total Earned</div><div style={{ fontSize: 20, fontWeight: 800, color: "var(--color-neon-green)", marginTop: 2 }}>{wallet.totalEarned.toFixed(4)} JGT</div></div>
            </div>
            <p style={{ color: "var(--text-muted)", fontSize: 11 }}>Come back after the timer expires to start earning again at full rate.</p>
          </div>
        )}

        {/* Footer disclaimer */}
        <div style={{ marginTop: 20, padding: "10px 14px", background: "rgba(255,255,255,0.02)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.04)" }}>
          <p style={{ fontSize: 10, color: "var(--text-muted)", lineHeight: 1.5 }}>
            <strong>Disclaimer:</strong> Attention Mining rewards are distributed as JGT tokens on the Base network. Token values may fluctuate. Advertisements are provided by third-party partners. By participating, you agree to the Junction Generator Token Distribution Terms. Rewards are subject to a 24-hour cooldown cycle per wallet address and are batched for daily distribution.
          </p>
        </div>
      </div>
    </div>
  );
}
