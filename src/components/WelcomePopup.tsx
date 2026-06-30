"use client";
import React, { useEffect, useState } from "react";

const STORAGE_KEY = "jg_welcome_seen";

export default function WelcomePopup() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      setVisible(true);
    }
  }, []);

  function close() {
    localStorage.setItem(STORAGE_KEY, "1");
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

  if (!visible) return null;

  return (
    <>
      {/* Backdrop */}
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

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Welcome to Junction Generator"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 9999,
          width: "min(560px, calc(100vw - 40px))",
          background: "linear-gradient(135deg, rgba(10,8,30,0.97) 0%, rgba(20,10,40,0.97) 100%)",
          border: "1px solid rgba(0, 242, 254, 0.2)",
          borderRadius: "20px",
          padding: "48px 40px 40px",
          boxShadow: "0 0 60px rgba(0,242,254,0.08), 0 24px 64px rgba(0,0,0,0.6)",
          textAlign: "center",
        }}
      >
        {/* Close button */}
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
            transition: "background 0.15s, color 0.15s",
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.12)";
            (e.currentTarget as HTMLButtonElement).style.color = "var(--text-primary)";
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)";
            (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)";
          }}
        >
          ×
        </button>

        {/* Badge */}
        <div style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          background: "rgba(0, 242, 254, 0.08)",
          border: "1px solid rgba(0, 242, 254, 0.2)",
          padding: "5px 14px",
          borderRadius: "100px",
          color: "var(--color-cyan)",
          fontSize: "11px",
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          marginBottom: "24px",
        }}>
          <span style={{
            display: "inline-block",
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            background: "var(--color-cyan)",
            animation: "glow-pulse 1.5s infinite",
          }} />
          Testnet Live — Junctioning v1
        </div>

        {/* Heading */}
        <h2 className="text-gradient-cyber" style={{
          fontSize: "28px",
          fontWeight: 900,
          lineHeight: 1.15,
          marginBottom: "16px",
          letterSpacing: "-0.02em",
        }}>
          Welcome to Junction Generator
        </h2>

        {/* Body */}
        <p style={{
          color: "var(--text-secondary)",
          fontSize: "15px",
          lineHeight: 1.65,
          marginBottom: "12px",
        }}>
          A Layer-1 blockchain where miners earn <strong style={{ color: "var(--text-primary)" }}>$JGC</strong> by running verifiable AI inference — replacing wasteful hash puzzles with compute the world actually needs.
        </p>
        <p style={{
          color: "var(--text-muted)",
          fontSize: "13px",
          lineHeight: 1.6,
          marginBottom: "32px",
        }}>
          Proof-of-Useful-Compute (PoUC) • Deterministic-replay verification • Collusion-hardened quorum
        </p>

        {/* CTAs */}
        <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap", marginBottom: "24px" }}>
          <a
            href="/whitepaper"
            className="btn-glow-purple"
            style={{ textDecoration: "none", fontSize: "14px" }}
            onClick={close}
          >
            Read the Whitepaper
          </a>
          <button
            onClick={close}
            className="btn-glow-cyan"
            style={{
              background: "none",
              cursor: "pointer",
              fontSize: "14px",
              border: "none",
              padding: 0,
            }}
          >
            Explore the Site →
          </button>
        </div>

        {/* Dismiss hint */}
        <p style={{ color: "var(--text-muted)", fontSize: "12px" }}>
          Press <kbd style={{
            background: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: "4px",
            padding: "1px 6px",
            fontFamily: "var(--font-jetbrains-mono)",
            fontSize: "11px",
          }}>Esc</kbd> or click anywhere outside to close
        </p>
      </div>
    </>
  );
}
