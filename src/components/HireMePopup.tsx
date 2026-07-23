"use client";
import React, { useEffect, useState } from "react";

const STORAGE_KEY = "jg_hire_popup_dismissed_at_v2";
const DISMISSAL_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "https://jgt-mining-api.james-gordon.workers.dev";

type State = { kind: "idle" | "loading" | "ok" | "error"; msg?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function HireMePopup() {
  const [visible, setVisible] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  useEffect(() => {
    const dismissedAt = Number(localStorage.getItem(STORAGE_KEY) || 0);
    if (!dismissedAt || Date.now() - dismissedAt > DISMISSAL_COOLDOWN_MS) {
      const t = setTimeout(() => setVisible(true), 4000);
      return () => clearTimeout(t);
    }
  }, []);

  function close() {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
    setVisible(false);
  }

  useEffect(() => {
    if (!visible) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const emailVal = email.trim();
    const phoneVal = phone.trim();

    if (!emailVal && !phoneVal) {
      setState({ kind: "error", msg: "Please leave an email or phone number." });
      return;
    }
    if (emailVal && !EMAIL_RE.test(emailVal)) {
      setState({ kind: "error", msg: "Please enter a valid email address." });
      return;
    }

    setState({ kind: "loading" });
    try {
      const res = await fetch(`${API_BASE}/api/hire-lead`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailVal, phone: phoneVal }),
      });
      const data: { message?: string; error?: string } = await res.json().catch(() => ({}));
      if (res.ok) {
        setState({ kind: "ok", msg: data.message || "Thanks — I'll be in touch soon!" });
        localStorage.setItem(STORAGE_KEY, String(Date.now()));
      } else {
        setState({ kind: "error", msg: data.error || "Something went wrong. Please try again." });
      }
    } catch {
      setState({ kind: "error", msg: "Network error — please try again in a moment." });
    }
  }

  if (!visible) return null;

  return (
    <>
      <div
        onClick={close}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(3, 2, 9, 0.75)",
          backdropFilter: "blur(6px)",
          zIndex: 9998,
        }}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Hire James Gordon"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 9999,
          width: "min(520px, calc(100vw - 40px))",
          background: "linear-gradient(135deg, rgba(10,8,30,0.97) 0%, rgba(20,10,40,0.97) 100%)",
          border: "1px solid rgba(0, 242, 254, 0.2)",
          borderRadius: "20px",
          padding: "44px 36px 32px",
          boxShadow: "0 0 60px rgba(0,242,254,0.08), 0 24px 64px rgba(0,0,0,0.6)",
          textAlign: "center",
        }}
      >
        <button
          onClick={close}
          aria-label="Close"
          style={{
            position: "absolute",
            top: "16px",
            right: "16px",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "8px",
            width: "32px",
            height: "32px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: "var(--text-muted)",
            fontSize: "18px",
            lineHeight: 1,
          }}
        >
          ×
        </button>

        <div style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          background: "rgba(155, 81, 224, 0.1)",
          border: "1px solid rgba(155, 81, 224, 0.25)",
          padding: "5px 14px",
          borderRadius: "100px",
          color: "var(--color-purple)",
          fontSize: "11px",
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          marginBottom: "20px",
        }}>
          This Project Needs Funding
        </div>

        <h2 className="text-gradient-cyber" style={{
          fontSize: "24px",
          fontWeight: 900,
          lineHeight: 1.2,
          marginBottom: "14px",
          letterSpacing: "-0.02em",
        }}>
          Hire me — it funds Junction Generator
        </h2>

        <p style={{
          color: "var(--text-secondary)",
          fontSize: "14px",
          lineHeight: 1.65,
          marginBottom: "16px",
          textAlign: "left",
        }}>
          I&apos;m an experienced web developer and the engineer behind this project. Every job I take
          goes straight toward funding Junction Generator&apos;s development. I can:
        </p>

        <ul style={{
          textAlign: "left",
          color: "var(--text-secondary)",
          fontSize: "13.5px",
          lineHeight: 1.7,
          marginBottom: "20px",
          paddingLeft: "20px",
        }}>
          <li><strong style={{ color: "var(--text-primary)" }}>Build you a website</strong> — one-time fee, or a monthly fee to maintain your existing site.</li>
          <li><strong style={{ color: "var(--text-primary)" }}>Develop an AI assistant agent</strong> for your business — one-time fee.</li>
          <li><strong style={{ color: "var(--text-primary)" }}>Maintain an AI agent</strong> you already have — billed monthly.</li>
        </ul>

        {state.kind === "ok" ? (
          <p style={{ color: "var(--color-neon-green)", fontWeight: 700, fontSize: 14 }}>✓ {state.msg}</p>
        ) : (
          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              aria-label="Email address"
              disabled={state.kind === "loading"}
              style={{
                padding: "12px 16px", borderRadius: 8,
                background: "rgba(255,255,255,0.04)", border: "1px solid var(--glass-border)",
                color: "var(--text-primary)", fontSize: 14, outline: "none",
              }}
            />
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone number (optional)"
              aria-label="Phone number"
              disabled={state.kind === "loading"}
              style={{
                padding: "12px 16px", borderRadius: 8,
                background: "rgba(255,255,255,0.04)", border: "1px solid var(--glass-border)",
                color: "var(--text-primary)", fontSize: 14, outline: "none",
              }}
            />
            <button
              type="submit"
              className="btn-glow-purple"
              disabled={state.kind === "loading"}
              style={{ marginTop: "4px" }}
            >
              {state.kind === "loading" ? "Sending…" : "I'm interested — contact me"}
            </button>
          </form>
        )}

        {state.kind === "error" && (
          <p style={{ color: "#ff6b6b", fontSize: 13, marginTop: 12 }}>{state.msg}</p>
        )}

        <p style={{ color: "var(--text-muted)", fontSize: "11px", marginTop: "16px" }}>
          No spam — your info is only used to follow up about hiring me.
        </p>
      </div>
    </>
  );
}
