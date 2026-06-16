"use client";

import React, { useState } from "react";

/**
 * Back the Project — honest donation section.
 * Donations only; explicitly NOT an investment and not tied to any token.
 */

interface Wallet { key: string; label: string; symbol: string; address: string; }

const WALLETS: Wallet[] = [
  { key: "eth", label: "Ethereum / Base (EVM)", symbol: "Ξ", address: "0x3f3e604eA29bfA66d0e6CA07f4B6BCA5e36ce7C8" },
  { key: "btc", label: "Bitcoin",               symbol: "₿", address: "bc1q4crtxa5lng0nq9s7y2u9h0ml2egus95p833xf0" },
  { key: "sol", label: "Solana",                symbol: "◎", address: "43mBkQPgTz3XbM6wBz5RXkzMLuCM1KB3xRTqeE8mTj1E" },
];

export default function BackTheProject() {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = (key: string, value: string): void => {
    void navigator.clipboard.writeText(value);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="glass-container" style={{ padding: "28px" }}>
      <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>
        <span style={{ marginRight: 8 }}>🤝</span>Back the Project
      </h2>
      <p style={{ color: "var(--text-secondary)", fontSize: 14, lineHeight: 1.6, marginBottom: 8 }}>
        Junction Generator is open-source and self-funded. If you&apos;d like to help fund development of the
        Proof-of-Useful-Compute protocol, donations go directly to the project and are genuinely appreciated.
      </p>
      <p style={{ color: "var(--text-muted)", fontSize: 12, lineHeight: 1.6, marginBottom: 20 }}>
        Donations are voluntary support — <strong>not an investment</strong>. No tokens, returns, equity, or future
        value are offered or implied in exchange.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {WALLETS.map((w) => (
          <div
            key={w.key}
            style={{
              display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
              background: "rgba(255,255,255,0.02)", border: "1px solid var(--glass-border)",
              borderRadius: 10, padding: "12px 16px",
            }}
          >
            <span style={{ fontSize: 18, width: 24, textAlign: "center", color: "var(--color-purple)" }}>{w.symbol}</span>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 2 }}>{w.label}</div>
              <code style={{ fontSize: 12, color: "var(--text-primary)", wordBreak: "break-all", fontFamily: "var(--font-jetbrains-mono), monospace" }}>
                {w.address}
              </code>
            </div>
            <button
              onClick={() => copy(w.key, w.address)}
              style={{
                background: copied === w.key ? "rgba(57,255,136,0.15)" : "rgba(155,81,224,0.12)",
                border: `1px solid ${copied === w.key ? "rgba(57,255,136,0.4)" : "rgba(155,81,224,0.3)"}`,
                color: copied === w.key ? "var(--color-neon-green)" : "var(--color-purple)",
                padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {copied === w.key ? "Copied ✓" : "Copy"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
