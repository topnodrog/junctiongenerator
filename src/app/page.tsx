"use client";
import React from "react";
import ConnectButton from "@/components/ConnectButton";
import VibePlayground from "@/components/VibePlayground";
import MiningTelemetry from "@/components/MiningTelemetry";
import AgentConsole from "@/components/AgentConsole";
import OSCRPCalculator from "@/components/OSCRPCalculator";
import BackTheProject from "@/components/BackTheProject";
import NewsletterSignup from "@/components/NewsletterSignup";
import NodeStatusPanel from "@/components/NodeStatusPanel";
import WelcomePopup from "@/components/WelcomePopup";
import HireMePopup from "@/components/HireMePopup";
import PartnerLinks from "@/components/PartnerLinks";

const MILESTONES = [
  { done: true,  label: "PoUC concept & cryptoeconomic design" },
  { done: true,  label: "Whitepaper & interactive demo site" },
  { done: true,  label: "Junctioning Layer-1 — local inference over Ollama, block production live" },
  { done: true,  label: "Honest FLOP measurement from real model parameter count" },
  { done: true,  label: "Deterministic-replay verification — cryptographic proof of compute" },
  { done: true,  label: "Sampling + slashing — economic incentive layer for honest miners" },
  { done: true,  label: "Multi-challenger quorum — collusion-hardened verification" },
  { done: true,  label: "Wallet & coinbase transactions — full block reward flow" },
  { done: false, label: "Public testnet — P2P sync, block explorer, public nodes" },
  { done: false, label: "GPU mining client & inference/training workload circuits" },
  { done: false, label: "Mainnet launch" },
];

export default function Home() {
  return (
    <>
      <WelcomePopup />
      <HireMePopup />

      {/* Navigation Header */}
      <header className="nav-header">
        <a href="#" className="nav-logo">
          <div className="nav-logo-symbol">JG</div>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 800 }}>Junction Generator</span>
        </a>
        <nav>
          <ul className="nav-links">
            <li className="nav-link-item"><a href="#technology">Technology</a></li>
            <li className="nav-link-item"><a href="#telemetry">Compute Grid</a></li>
            <li className="nav-link-item"><a href="#rewards">OSCRP</a></li>
            <li className="nav-link-item"><a href="/whitepaper">Whitepaper</a></li>
            <li className="nav-link-item"><a href="/blog">Blog</a></li>
            <li className="nav-link-item"><a href="#newsletter">Newsletter</a></li>
            <li className="nav-link-item"><a href="#partners">Get Crypto</a></li>
            <li className="nav-link-item"><a href="#support">Support</a></li>
          </ul>
        </nav>
        <div style={{ position: "relative" }}>
          <ConnectButton />
        </div>
      </header>

      {/* Main Container */}
      <main style={{ maxWidth: "1200px", margin: "0 auto", padding: "120px 24px 80px", position: "relative" }}>

        {/* Floating Ambient background orb */}
        <div className="ambient-orb-2"></div>

        {/* Hero Section */}
        <section style={{ textAlign: "center", marginBottom: "80px", paddingTop: "20px" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "rgba(0, 242, 254, 0.08)", border: "1px solid rgba(0, 242, 254, 0.2)", padding: "6px 16px", borderRadius: "100px", color: "var(--color-cyan)", fontSize: "12px", fontWeight: "600", marginBottom: "24px" }}>
            <span style={{ display: "inline-block", width: "6px", height: "6px", borderRadius: "50%", background: "var(--color-cyan)", animation: "glow-pulse 1.5s infinite" }}></span>
            Layer-1 Testnet Live — Junctioning v1
          </div>

          <h1 className="text-gradient-cyber" style={{ fontSize: "56px", lineHeight: "1.1", marginBottom: "20px", fontWeight: "900", letterSpacing: "-0.03em" }}>
            Mining Compute<br />Redirected to Real AI Work
          </h1>

          <p style={{ color: "var(--text-secondary)", fontSize: "18px", maxWidth: "680px", margin: "0 auto 12px", lineHeight: "1.6" }}>
            Junction Generator is a Layer-1 blockchain where miners earn <strong style={{ color: "var(--text-primary)" }}>$JGC</strong> by running verifiable AI inference — replacing hash puzzles with productive compute that the world actually needs.
          </p>
          <p style={{ color: "var(--text-muted)", fontSize: "15px", maxWidth: "580px", margin: "0 auto 36px", lineHeight: "1.6" }}>
            Proof-of-Useful-Compute (PoUC) • Deterministic-replay verification • Collusion-hardened quorum
          </p>

          <div style={{ display: "flex", gap: "16px", justifyContent: "center", marginBottom: "48px" }}>
            <a href="/whitepaper" className="btn-glow-purple" style={{ textDecoration: "none", display: "inline-block" }}>
              Read the Whitepaper
            </a>
            <a href="https://github.com/topnodrog/junctiongenerator" target="_blank" rel="noopener noreferrer" className="btn-glow-cyan" style={{ textDecoration: "none", display: "inline-block" }}>
              View on GitHub
            </a>
          </div>

          {/* Live local-node status — real data when the operator runs a node */}
          <NodeStatusPanel />
        </section>

        {/* Technology / Milestones Section */}
        <section id="technology" style={{ marginBottom: "80px", scrollMarginTop: "100px" }}>
          <div className="glass-container" style={{ padding: "40px" }}>
            <div style={{ textAlign: "center", marginBottom: "36px" }}>
              <h2 style={{ fontSize: "28px", fontWeight: 800, marginBottom: "10px" }}>
                <span className="text-gradient-blue">What We've Built</span>
              </h2>
              <p style={{ color: "var(--text-secondary)", fontSize: "15px", maxWidth: "540px", margin: "0 auto" }}>
                A full proof-of-concept Layer-1 with a working verification model — no trusted hardware, no ZK circuits, no re-execution of every block.
              </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              {MILESTONES.map((m, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "12px",
                    padding: "14px 16px",
                    borderRadius: "10px",
                    background: m.done
                      ? "rgba(0, 242, 254, 0.04)"
                      : "rgba(255,255,255,0.02)",
                    border: `1px solid ${m.done ? "rgba(0,242,254,0.12)" : "rgba(255,255,255,0.04)"}`,
                  }}
                >
                  <span style={{
                    flexShrink: 0,
                    width: "20px",
                    height: "20px",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "11px",
                    fontWeight: 700,
                    background: m.done ? "rgba(0,242,254,0.15)" : "rgba(255,255,255,0.05)",
                    color: m.done ? "var(--color-cyan)" : "var(--text-muted)",
                    border: `1px solid ${m.done ? "rgba(0,242,254,0.3)" : "rgba(255,255,255,0.08)"}`,
                  }}>
                    {m.done ? "✓" : "·"}
                  </span>
                  <span style={{
                    fontSize: "14px",
                    lineHeight: "1.4",
                    color: m.done ? "var(--text-primary)" : "var(--text-muted)",
                  }}>
                    {m.label}
                  </span>
                </div>
              ))}
            </div>

            {/* Three pillars */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px", marginTop: "36px", borderTop: "1px solid var(--glass-border)", paddingTop: "36px" }}>
              {[
                {
                  color: "var(--color-cyan)",
                  title: "Deterministic Replay",
                  body: "Any validator can re-run a miner's inference workload from a deterministic seed and compare outputs — no trusted execution environment required.",
                },
                {
                  color: "var(--color-purple)",
                  title: "Sampling + Slashing",
                  body: "Validators randomly sample blocks and challenge suspect miners. Caught cheaters are slashed proportionally, making dishonest compute economically irrational.",
                },
                {
                  color: "var(--color-magenta)",
                  title: "Quorum Collusion Resistance",
                  body: "Multiple independent challengers must agree before a slash is applied. No single validator can frame a miner; collusion requires coordinating an implausible majority.",
                },
              ].map((p, i) => (
                <div key={i} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: p.color, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "8px" }}>
                    {p.title}
                  </div>
                  <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                    {p.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Run a Node CTA Section */}
        <section id="run-node" style={{ marginBottom: "80px", scrollMarginTop: "100px" }}>
          <div className="glass-container" style={{ padding: "48px", textAlign: "center", background: "linear-gradient(135deg, rgba(0, 242, 254, 0.06) 0%, rgba(155, 81, 224, 0.06) 100%)", border: "1px solid rgba(0, 242, 254, 0.15)" }}>
            <h2 style={{ fontSize: "32px", fontWeight: 800, marginBottom: "12px", color: "var(--text-primary)" }}>
              Be One of the First
            </h2>
            <p style={{ color: "var(--text-secondary)", fontSize: "16px", maxWidth: "640px", margin: "0 auto 32px", lineHeight: 1.6 }}>
              Junction Generator is recruiting early developers to run testnet nodes. Validate compute, earn $JGC tokens, and help prove the protocol before mainnet.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px", marginBottom: "32px" }}>
              {[
                {
                  label: "Run a Validator",
                  desc: "Challenge suspect blocks, earn rewards for honest validation",
                },
                {
                  label: "Mine Compute",
                  desc: "Run inference on GPU hardware, earn $JGC per verified FLOP",
                },
                {
                  label: "Shape the Protocol",
                  desc: "Contribute code and research, claim OSCRP governance rewards",
                },
              ].map((item, i) => (
                <div key={i} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--color-cyan)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px" }}>
                    {item.label}
                  </div>
                  <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
              <a href="https://github.com/topnodrog/junctiongenerator" target="_blank" rel="noopener noreferrer" className="btn-glow-cyan" style={{ textDecoration: "none", fontSize: "14px" }}>
                View Node Setup Guide
              </a>
              <a href="/#support" className="btn-glow-purple" style={{ textDecoration: "none", fontSize: "14px" }}>
                Join the Community
              </a>
            </div>
          </div>
        </section>

        {/* Newsletter signup */}
        <section id="newsletter" style={{ marginBottom: "60px", scrollMarginTop: "100px" }}>
          <NewsletterSignup />
        </section>

        {/* Grid Sections */}
        <div className="section-grid">
          {/* Section 1: NLP Vibe Playground */}
          <div id="playground" style={{ gridColumn: "span 2", scrollMarginTop: "100px" }}>
            <VibePlayground />
          </div>

          {/* Section 2: JGT Mining Telemetry */}
          <div id="telemetry" style={{ scrollMarginTop: "100px" }}>
            <MiningTelemetry />
          </div>

          {/* Section 3: OSCRP Rewards Simulator */}
          <div id="rewards" style={{ scrollMarginTop: "100px" }}>
            <OSCRPCalculator />
          </div>

          {/* Section 4: C-Suite Agent Console */}
          <div id="agents" style={{ gridColumn: "span 2", scrollMarginTop: "100px" }}>
            <AgentConsole />
          </div>

          {/* Partner / affiliate links */}
          <div id="partners" style={{ gridColumn: "span 2", scrollMarginTop: "100px" }}>
            <PartnerLinks />
          </div>

          {/* Support / donations */}
          <div id="support" style={{ gridColumn: "span 2", scrollMarginTop: "100px" }}>
            <BackTheProject />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid var(--glass-border)", padding: "40px 24px", textAlign: "center", background: "rgba(3,2,9,0.8)", position: "relative", zIndex: 10 }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-muted)", fontSize: "14px" }}>
            <div className="nav-logo-symbol" style={{ width: "24px", height: "24px", fontSize: "12px", borderRadius: "4px" }}>JG</div>
            <span>© 2026 Junction Generator. Open Source under OSCRP.</span>
          </div>
          <div style={{ display: "flex", gap: "24px", fontSize: "14px", flexWrap: "wrap" }}>
            <a href="https://junctiongenerator.net" target="_blank" rel="noopener noreferrer" className="footer-link">
              junctiongenerator.net
            </a>
            <a href="/whitepaper" className="footer-link">Whitepaper</a>
            <a href="/blog" className="footer-link">Blog</a>
            <a href="https://github.com/topnodrog/junctiongenerator" target="_blank" rel="noopener noreferrer" className="footer-link">
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </>
  );
}
