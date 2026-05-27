"use client";

import React, { useState, useEffect } from "react";

export default function MiningTelemetry() {
  const [flops, setFlops] = useState(8.42);
  const [miners, setMiners] = useState(12842);
  const [blockHeight, setBlockHeight] = useState(389421);
  const [workloads, setWorkloads] = useState({
    internal: 84,
    external: 16
  });

  useEffect(() => {
    const interval = setInterval(() => {
      // Add slight random fluctuations to mimic actual real-time telemetry
      setFlops((prev) => +(prev + (Math.random() - 0.5) * 0.05).toFixed(2));
      setMiners((prev) => prev + Math.floor((Math.random() - 0.48) * 3));
      
      if (Math.random() > 0.85) {
        setBlockHeight((prev) => prev + 1);
      }
      
      if (Math.random() > 0.9) {
        setWorkloads(() => {
          const internal = Math.floor(80 + Math.random() * 8);
          return { internal, external: 100 - internal };
        });
      }
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="glass-container">
      <h3 style={{ fontSize: "18px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ color: "var(--color-purple)" }}>⛏️</span> DNCG Proof-of-Useful-Compute Telemetry
      </h3>
      <p style={{ color: "var(--text-secondary)", fontSize: "13px", marginBottom: "20px" }}>
        Real-time telemetry showing computational cycles harvested from the global $JGC GPU mining rig network and prioritized dynamically.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "24px" }}>
        <div style={{ background: "rgba(0,0,0,0.2)", padding: "12px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.03)" }}>
          <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase" }}>Grid Computational Power</div>
          <div style={{ fontSize: "20px", fontWeight: "700", color: "var(--color-cyan)", marginTop: "4px" }}>
            {flops} PFLOPS
          </div>
        </div>

        <div style={{ background: "rgba(0,0,0,0.2)", padding: "12px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.03)" }}>
          <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase" }}>Active Mining Rigs</div>
          <div style={{ fontSize: "20px", fontWeight: "700", color: "#fff", marginTop: "4px" }}>
            {miners.toLocaleString()} Nodes
          </div>
        </div>

        <div style={{ background: "rgba(0,0,0,0.2)", padding: "12px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.03)" }}>
          <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase" }}>Block Height (JGC)</div>
          <div style={{ fontSize: "20px", fontWeight: "700", color: "var(--color-purple)", marginTop: "4px" }}>
            #{blockHeight.toLocaleString()}
          </div>
        </div>

        <div style={{ background: "rgba(0,0,0,0.2)", padding: "12px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.03)" }}>
          <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase" }}>Network Difficulty</div>
          <div style={{ fontSize: "20px", fontWeight: "700", color: "var(--color-magenta)", marginTop: "4px" }}>
            14.82 M
          </div>
        </div>
      </div>

      <div style={{ marginTop: "16px" }}>
        <h4 style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "8px", display: "flex", justifyContent: "space-between" }}>
          <span>DNCG Compute Allocation Engine</span>
          <span style={{ color: "var(--color-cyan)" }}>Priority Enabled</span>
        </h4>
        
        {/* Progress Bar of allocations */}
        <div style={{ display: "flex", height: "24px", borderRadius: "6px", overflow: "hidden", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.05)" }}>
          <div 
            style={{ 
              width: `${workloads.internal}%`, 
              background: "linear-gradient(90deg, var(--color-purple), #7b2cbf)", 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "center", 
              fontSize: "10px", 
              fontWeight: "600",
              textShadow: "0 1px 2px rgba(0,0,0,0.4)",
              transition: "width 0.8s cubic-bezier(0.16, 1, 0.3, 1)"
            }}
          >
            {workloads.internal}% Internal AI
          </div>
          <div 
            style={{ 
              width: `${workloads.external}%`, 
              background: "linear-gradient(90deg, var(--color-cyan), var(--color-blue))", 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "center", 
              fontSize: "10px", 
              fontWeight: "600",
              color: "#030209",
              transition: "width 0.8s cubic-bezier(0.16, 1, 0.3, 1)"
            }}
          >
            {workloads.external}% Marketplace
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginTop: "12px", fontSize: "11px", color: "var(--text-muted)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: "var(--color-purple)" }}></span>
            <span>Priority 1: Core C-Suite & Compiling</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: "var(--color-cyan)" }}></span>
            <span>Priority 2: External Model Arbitrage</span>
          </div>
        </div>
      </div>
    </div>
  );
}
