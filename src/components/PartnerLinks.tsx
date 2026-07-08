"use client";
import React from "react";

// Affiliate/referral IDs. Each program requires signing up first — replace the
// PLACEHOLDER values with the real codes from each partner dashboard:
//   Coinbase:  https://www.coinbase.com/affiliates  (or Refer & Earn code)
//   Kraken:    https://www.kraken.com/features/affiliate-program
//   Ledger:    https://www.ledger.com/affiliates
//   Koinly:    https://koinly.io/affiliates/
const AFFILIATE_IDS = {
  coinbase: "PLACEHOLDER_COINBASE_CODE",
  kraken: "PLACEHOLDER_KRAKEN_CODE",
  ledger: "PLACEHOLDER_LEDGER_ID",
  koinly: "PLACEHOLDER_KOINLY_ID",
};

const PARTNERS = [
  {
    name: "Coinbase",
    color: "var(--color-cyan)",
    tagline: "Buy your first crypto",
    body: "The most beginner-friendly regulated US exchange. Publicly traded, insured custody, and the easiest on-ramp from a bank account.",
    cta: "Sign up on Coinbase",
    url: `https://www.coinbase.com/join/${AFFILIATE_IDS.coinbase}`,
  },
  {
    name: "Kraken",
    color: "var(--color-purple)",
    tagline: "Trade with pro tools",
    body: "A security-first exchange running since 2011 with proof-of-reserves audits, low fees, and serious trading infrastructure.",
    cta: "Sign up on Kraken",
    url: `https://invite.kraken.com/${AFFILIATE_IDS.kraken}`,
  },
  {
    name: "Ledger",
    color: "var(--color-magenta)",
    tagline: "Self-custody your keys",
    body: "Hardware wallets that keep your private keys offline. If you hold coins you don't actively trade, they belong in cold storage.",
    cta: "Get a Ledger wallet",
    url: `https://shop.ledger.com/?r=${AFFILIATE_IDS.ledger}`,
  },
  {
    name: "Koinly",
    color: "var(--color-cyan)",
    tagline: "Sort your crypto taxes",
    body: "Imports trades from every major exchange and wallet and generates ready-to-file tax reports in minutes.",
    cta: "Try Koinly",
    url: `https://koinly.io/?via=${AFFILIATE_IDS.koinly}`,
  },
];

export default function PartnerLinks() {
  return (
    <div className="glass-container" style={{ padding: "40px" }}>
      <div style={{ textAlign: "center", marginBottom: "32px" }}>
        <h2 style={{ fontSize: "28px", fontWeight: 800, marginBottom: "10px" }}>
          <span className="text-gradient-blue">Getting Started with Crypto?</span>
        </h2>
        <p style={{ color: "var(--text-secondary)", fontSize: "15px", maxWidth: "560px", margin: "0 auto" }}>
          Trusted platforms we recommend for buying, securing, and reporting crypto —
          the same regulated services we&apos;d point friends and family to.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        {PARTNERS.map((p) => (
          <div
            key={p.name}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              padding: "22px",
              borderRadius: "12px",
              background: "rgba(255,255,255,0.02)",
              border: "1px solid var(--glass-border)",
            }}
          >
            <div style={{ fontSize: "13px", fontWeight: 700, color: p.color, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              {p.tagline}
            </div>
            <div style={{ fontSize: "18px", fontWeight: 800, color: "var(--text-primary)" }}>
              {p.name}
            </div>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.6, flexGrow: 1 }}>
              {p.body}
            </p>
            <a
              href={p.url}
              target="_blank"
              rel="noopener noreferrer sponsored"
              className="btn-glow-cyan"
              style={{ textDecoration: "none", fontSize: "13px", textAlign: "center" }}
            >
              {p.cta} →
            </a>
          </div>
        ))}
      </div>

      <p style={{ marginTop: "24px", fontSize: "12px", color: "var(--text-muted)", textAlign: "center", lineHeight: 1.6 }}>
        Affiliate disclosure: the links above are referral links. Junction Generator may earn a
        commission when you sign up or make a purchase through them, at no extra cost to you.
        We only list regulated, established services — never send funds to platforms you
        haven&apos;t independently verified.
      </p>
    </div>
  );
}
