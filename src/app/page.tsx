import React from "react";
import VibePlayground from "@/components/VibePlayground";
import MiningTelemetry from "@/components/MiningTelemetry";
import AgentConsole from "@/components/AgentConsole";
import OSCRPCalculator from "@/components/OSCRPCalculator";

export default function Home() {
  return (
    <>
      {/* Navigation Header */}
      <header className="nav-header">
        <a href="#" className="nav-logo">
          <div className="nav-logo-symbol">JG</div>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 800 }}>Junction Generator</span>
        </a>
        <nav>
          <ul className="nav-links">
            <li className="nav-link-item"><a href="#playground">Compiler Sandbox</a></li>
            <li className="nav-link-item"><a href="#telemetry">Compute Grid</a></li>
            <li className="nav-link-item"><a href="#agents">C-Suite Console</a></li>
            <li className="nav-link-item"><a href="#rewards">OSCRP Stake</a></li>
          </ul>
        </nav>
        <div style={{ position: "relative" }}>
          <button 
            className="btn-glow-cyan" 
            style={{ padding: "8px 20px", fontSize: "14px" }}
            title="Wallet integration coming in Phase 6"
            onClick={() => alert("Wallet connection coming soon! Junction Generator is currently in Phase 2. Mainnet launch with full wallet integration is planned for Phase 6.")}
          >
            Connect Wallet
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main style={{ maxWidth: "1200px", margin: "0 auto", padding: "120px 24px 80px", position: "relative" }}>
        
        {/* Floating Ambient background orbs */}
        <div className="ambient-orb-2"></div>

        {/* Hero Section */}
        <section style={{ textAlign: "center", marginBottom: "80px", paddingTop: "20px" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "rgba(155, 81, 224, 0.1)", border: "1px solid rgba(155, 81, 224, 0.2)", padding: "6px 16px", borderRadius: "100px", color: "var(--color-purple)", fontSize: "12px", fontWeight: "600", marginBottom: "24px" }}>
            <span style={{ display: "inline-block", width: "6px", height: "6px", borderRadius: "50%", background: "var(--color-purple)", animation: "glow-pulse 1.5s infinite" }}></span>
            Web3 Autonomy Engine • v1.5 Live
          </div>
          
          <h1 className="text-gradient-cyber" style={{ fontSize: "56px", lineHeight: "1.1", marginBottom: "20px", fontWeight: "900", letterSpacing: "-0.03em" }}>
            We Turn Your Vibe<br />Into Verifiable Web3 Code
          </h1>
          
          <p style={{ color: "var(--text-secondary)", fontSize: "18px", maxWidth: "680px", margin: "0 auto 36px", lineHeight: "1.6" }}>
            Junction Generator is the world's first AI-operated, mined-compute Web3 factory. Speak in plain English to compile smart contracts, and secure the network using Proof-of-Useful-Compute.
          </p>

          <div style={{ display: "flex", gap: "16px", justifyContent: "center" }}>
            <a href="#playground" className="btn-glow-purple" style={{ textDecoration: "none", display: "inline-block" }}>
              Start Vibe Coding
            </a>
            <a href="#telemetry" className="btn-glow-cyan" style={{ textDecoration: "none", display: "inline-block" }}>
              Explore Mining Grid
            </a>
          </div>
        </section>

        {/* Grid Sections */}
        <div className="section-grid">
          {/* Section 1: NLP Vibe Playground */}
          <div id="playground" style={{ gridColumn: "span 2", scrollMarginTop: "100px" }}>
            <VibePlayground />
          </div>

          {/* Section 2: JGC Mining Telemetry */}
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
            <a href="/whitepaper" className="footer-link">
              Whitepaper
            </a>
            <a href="https://github.com/topnodrog/Junction_Generator" target="_blank" rel="noopener noreferrer" className="footer-link">
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </>
  );
}
