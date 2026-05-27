"use client";

import React, { useState } from "react";

export default function OSCRPCalculator() {
  const [score, setScore] = useState(75);
  const [treasuryPool, setTreasuryPool] = useState(2500000); // $2.5M default simulated reserves

  // Calculator Logic
  const jgtReward = score * 1000;
  const aeStakePercentage = +(score * 0.0001).toFixed(4); // e.g. 75 * 0.0001 = 0.0075% stake
  const estStakeValue = +((treasuryPool * aeStakePercentage) / 100).toFixed(2);

  return (
    <div className="glass-container">
      <h3 style={{ fontSize: "18px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ color: "var(--color-magenta)" }}>👐</span> OSCRP Contributor Reward Simulator
      </h3>
      <p style={{ color: "var(--text-secondary)", fontSize: "13px", marginBottom: "20px" }}>
        Estimate your reward structures and liquid treasury stakes based on the complexity, gas-efficiency, and security score of your pull requests.
      </p>

      {/* Sliders */}
      <div style={{ marginBottom: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px", color: "var(--text-secondary)" }}>
          <span>Pull-Request Contribution Score</span>
          <span style={{ color: "var(--color-cyan)", fontWeight: "700", fontSize: "15px" }}>{score}/100</span>
        </div>
        <input
          type="range"
          min="10"
          max="100"
          value={score}
          onChange={(e) => setScore(+e.target.value)}
          className="slider-input"
        />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "var(--text-muted)", marginTop: "-6px" }}>
          <span>Doc Update (10)</span>
          <span>Security Patch (60)</span>
          <span>Core Refactor (100)</span>
        </div>
      </div>

      <div style={{ marginBottom: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px", color: "var(--text-secondary)" }}>
          <span>Simulated CFO Treasury Pool Value</span>
          <span style={{ color: "var(--color-purple)", fontWeight: "700", fontSize: "15px" }}>
            ${treasuryPool.toLocaleString()} USD
          </span>
        </div>
        <input
          type="range"
          min="500000"
          max="10000000"
          step="100000"
          value={treasuryPool}
          onChange={(e) => setTreasuryPool(+e.target.value)}
          className="slider-input"
        />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "var(--text-muted)", marginTop: "-6px" }}>
          <span>$500K</span>
          <span>$5M</span>
          <span>$10M (High Autonomy)</span>
        </div>
      </div>

      {/* Yield Projections */}
      <h4 style={{ fontSize: "12px", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "12px" }}>
        Projected Reward Structures
      </h4>

      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <div style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.02)", padding: "14px", borderRadius: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Immediate Payout</div>
            <div style={{ fontSize: "18px", fontWeight: "700", color: "#fff", marginTop: "2px" }}>
              {jgtReward.toLocaleString()} $JGT
            </div>
          </div>
          <span style={{ fontSize: "10px", color: "var(--text-muted)", background: "rgba(255,255,255,0.05)", padding: "4px 8px", borderRadius: "4px" }}>
            Liquid Utility
          </span>
        </div>

        <div style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.02)", padding: "14px", borderRadius: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Autonomy Equity (AE) Stake</div>
            <div style={{ fontSize: "18px", fontWeight: "700", color: "var(--color-purple)", marginTop: "2px" }}>
              {aeStakePercentage}% of Treasury
            </div>
          </div>
          <span style={{ fontSize: "10px", color: "var(--text-muted)", background: "rgba(255,255,255,0.05)", padding: "4px 8px", borderRadius: "4px" }}>
            Redeemable Stake
          </span>
        </div>

        <div style={{ background: "rgba(12, 11, 32, 0.4)", border: "1px solid rgba(138,43,226,0.15)", padding: "14px", borderRadius: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Est. Stake Liquidation Value</div>
            <div style={{ fontSize: "18px", fontWeight: "700", color: "var(--color-cyan)", marginTop: "2px" }}>
              ${estStakeValue.toLocaleString()} USD
            </div>
          </div>
          <span style={{ fontSize: "10px", color: "var(--color-cyan)", background: "rgba(0, 242, 254, 0.1)", padding: "4px 8px", borderRadius: "4px", fontWeight: "600" }}>
            Tradeable Claim
          </span>
        </div>
      </div>

      <p style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "16px", fontStyle: "italic", textAlign: "center" }}>
        *Autonomy Equity represents a non-voting claim on the automated CFO Agent treasury, tradeable on secondary markets or redeemable directly for stablecoins.
      </p>
    </div>
  );
}
