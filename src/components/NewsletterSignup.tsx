"use client";

import React, { useState } from "react";
import Turnstile, { useFormVerification } from "./Turnstile";

/**
 * Newsletter signup — posts to the live Worker endpoint POST /api/subscribe,
 * which validates the email and inserts into the newsletter_subscribers table.
 */

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "https://jgt-mining-api.james-gordon.workers.dev";

type State = { kind: "idle" | "loading" | "ok" | "error"; msg?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function NewsletterSignup() {
  const verification = useFormVerification();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!verification.token) return;
    const value = email.trim();
    if (!EMAIL_RE.test(value)) {
      setState({ kind: "error", msg: "Please enter a valid email address." });
      return;
    }
    setState({ kind: "loading" });
    try {
      const res = await fetch(`${API_BASE}/api/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value, turnstileToken: verification.token }),
      });
      const data: { message?: string; error?: string } = await res.json().catch(() => ({}));
      if (res.ok) {
        setState({ kind: "ok", msg: data.message || "You're on the list — thanks!" });
        setEmail("");
      } else {
        setState({ kind: "error", msg: data.error || "Something went wrong. Please try again." });
      }
    } catch {
      setState({ kind: "error", msg: "Network error — please try again in a moment." });
    } finally {
      verification.reset();
    }
  };

  return (
    <div className="glass-container" style={{ padding: "28px", textAlign: "center" }}>
      <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>
        <span style={{ marginRight: 8 }}>📨</span>Stay in the loop
      </h2>
      <p style={{ color: "var(--text-secondary)", fontSize: 14, lineHeight: 1.6, maxWidth: 560, margin: "0 auto 20px" }}>
        Get a short weekly update on Junction Generator&apos;s progress — testnet milestones, the
        Proof-of-Useful-Compute protocol, and what&apos;s next. No spam, unsubscribe anytime.
      </p>

      {state.kind === "ok" ? (
        <p style={{ color: "var(--color-neon-green)", fontWeight: 700, fontSize: 15 }}>✓ {state.msg}</p>
      ) : (
        <form
          onSubmit={submit}
          style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", maxWidth: 480, margin: "0 auto" }}
        >
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            aria-label="Email address"
            disabled={state.kind === "loading"}
            style={{
              flex: 1, minWidth: 220, padding: "12px 16px", borderRadius: 8,
              background: "rgba(255,255,255,0.04)", border: "1px solid var(--glass-border)",
              color: "var(--text-primary)", fontSize: 14, outline: "none",
            }}
          />
          <Turnstile action="newsletter" attempt={verification.attempt} onVerify={verification.setToken} />
          <button type="submit" className="btn-glow-purple" disabled={state.kind === "loading" || !verification.token} style={{ whiteSpace: "nowrap" }}>
            {state.kind === "loading" ? "Subscribing…" : "Subscribe"}
          </button>
        </form>
      )}

      {state.kind === "error" && (
        <p style={{ color: "#ff6b6b", fontSize: 13, marginTop: 12 }}>{state.msg}</p>
      )}
    </div>
  );
}
