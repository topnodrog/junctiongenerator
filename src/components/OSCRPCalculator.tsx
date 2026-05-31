"use client";

import React, { useState } from "react";

interface SimulatedPR {
  description: string;
  complexity: number;
  security: number;
  gasEfficacy: number;
  jgtReward: number;
  aeStake: number;
  liquidValue: number;
}

interface LeaderboardEntry {
  rank: number;
  user: string;
  contribution: string;
  jgt: number;
  ae: number;
  category: "Core" | "Security" | "Gas Opt" | "Docs";
}

const INITIAL_LEADERBOARD: LeaderboardEntry[] = [
  { rank: 1, user: "jgordon.dev", contribution: "Core PoUC Allocation Protocol v1.5", jgt: 482000, ae: 0.4820, category: "Core" },
  { rank: 2, user: "elena_codes", contribution: "Adversarial AST Compiler Auditing Loop", jgt: 320000, ae: 0.3200, category: "Security" },
  { rank: 3, user: "gas_goblin", contribution: "EVM Storage Assembly Slot Refactor", jgt: 245000, ae: 0.2450, category: "Gas Opt" },
  { rank: 4, user: "doc_ninja", contribution: "PoUC Verification Math & Spec Docs", jgt: 110000, ae: 0.1100, category: "Docs" }
];

export default function OSCRPCalculator() {
  const [prDesc, setPrDesc] = useState("");
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [prResult, setPrResult] = useState<SimulatedPR | null>(null);
  const [treasuryPool, setTreasuryPool] = useState(2500000); // $2.5M USD default simulated reserves
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>(INITIAL_LEADERBOARD);

  // Auto calculate values if result is present and treasury changes
  const computedStakeValue = prResult ? +((treasuryPool * prResult.aeStake) / 100).toFixed(2) : 0;

  const handleEvaluatePR = async () => {
    if (!prDesc.trim() || isEvaluating) return;
    setIsEvaluating(true);
    setPrResult(null);

    // Dynamic assessment based on keywords in user input
    const lowerDesc = prDesc.toLowerCase();
    
    let complexity = 50 + Math.floor(Math.random() * 20); // Default mid range
    let securityScore = 95 + Math.floor(Math.random() * 6);
    let gasEfficacy = 0;

    if (lowerDesc.includes("gas") || lowerDesc.includes("optimize") || lowerDesc.includes("assembly")) {
      gasEfficacy = 8 + Math.floor(Math.random() * 15);
      complexity += 15;
    } else if (lowerDesc.includes("security") || lowerDesc.includes("audit") || lowerDesc.includes("reentrancy")) {
      securityScore = 100;
      complexity += 10;
    } else if (lowerDesc.includes("core") || lowerDesc.includes("protocol") || lowerDesc.includes("refactor")) {
      complexity = 85 + Math.floor(Math.random() * 16);
      gasEfficacy = 3 + Math.floor(Math.random() * 6);
    } else if (lowerDesc.includes("doc") || lowerDesc.includes("readme") || lowerDesc.includes("comment")) {
      complexity = 20 + Math.floor(Math.random() * 20);
      securityScore = 100;
    }

    // Caps
    complexity = Math.min(100, complexity);
    securityScore = Math.min(100, securityScore);

    // Multipliers for payout calculations
    const jgtReward = complexity * 1000 + (gasEfficacy * 1500);
    const aeStake = +(complexity * 0.0001 + (gasEfficacy * 0.00015)).toFixed(4); // AE stake percentage
    const liquidValue = +((treasuryPool * aeStake) / 100).toFixed(2);

    // Simulate AI audit delay
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const newResult = {
      description: prDesc,
      complexity,
      security: securityScore,
      gasEfficacy,
      jgtReward,
      aeStake,
      liquidValue
    };

    setPrResult(newResult);
    setIsEvaluating(false);

    // Add user contribution to leaderboard dynamically!
    setLeaderboard((prev) => {
      const userEntry: LeaderboardEntry = {
        rank: 0, // Assigned later
        user: "you.builder",
        contribution: prDesc.slice(0, 36) + (prDesc.length > 36 ? "..." : ""),
        jgt: jgtReward,
        ae: aeStake,
        category: gasEfficacy > 8 ? "Gas Opt" : complexity > 70 ? "Core" : "Security"
      };
      
      const combined = [...prev, userEntry];
      // Sort descending by JGT
      combined.sort((a, b) => b.jgt - a.jgt);
      // Re-assign ranks
      return combined.map((entry, idx) => ({ ...entry, rank: idx + 1 }));
    });
  };

  return (
    <div className="glass-container">
      <h3 style={{ fontSize: "18px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ color: "var(--color-magenta)" }}>👐</span> OSCRP Contributor Hub & Calculator
      </h3>
      <p style={{ color: "var(--text-secondary)", fontSize: "13px", marginBottom: "20px" }}>
        Simulate submitting a pull request to the Junction Generator repository. Our AI-operated CFO assessment agent scores contribution complexity, gas efficacy, and security to calculate immediate liquid $JGT rewards and Autonomy Equity (AE) stakes.
      </p>

      {/* Grid Simulator Layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginBottom: "24px" }}>
        
        {/* Left Side: Mock PR Submission */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          
          <div>
            <h4 style={{ fontSize: "12px", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "8px", letterSpacing: "0.03em" }}>
              1. Mock Pull-Request Claims Portal
            </h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <input
                type="text"
                className="playground-textarea"
                placeholder="e.g. Optimize EntryPoint loops to reduce gas fees by 14% on smart wallets..."
                value={prDesc}
                onChange={(e) => setPrDesc(e.target.value)}
                disabled={isEvaluating}
                style={{ height: "42px", padding: "10px", fontSize: "13px" }}
              />
              <button
                className="btn-glow-cyan"
                onClick={handleEvaluatePR}
                disabled={isEvaluating || !prDesc.trim()}
                style={{ width: "100%", height: "42px", borderStyle: "solid" }}
              >
                {isEvaluating ? "Analyzing Code Changes..." : "🔬 Submit & Score PR"}
              </button>
            </div>
          </div>

          {/* Treasury Reserve Configuration Slider */}
          <div>
            <h4 style={{ fontSize: "12px", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "4px", letterSpacing: "0.03em" }}>
              2. Simulated CFO Treasury Reserves Value
            </h4>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px", color: "var(--text-secondary)", marginBottom: "4px" }}>
              <span>Midas Backed Assets Pool:</span>
              <span style={{ color: "var(--color-purple)", fontWeight: "700" }}>
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
            
            {/* Dynamic visual portfolio backing */}
            <div style={{ display: "flex", gap: "4px", height: "6px", borderRadius: "3px", overflow: "hidden", marginTop: "12px", background: "rgba(255,255,255,0.05)" }}>
              <div style={{ width: "65%", background: "var(--color-cyan)" }} title="Stablecoins Reserves" />
              <div style={{ width: "20%", background: "var(--color-purple)" }} title="JGC Liquidity Backing" />
              <div style={{ width: "15%", background: "var(--color-magenta)" }} title="Secondary Market DEX LP" />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px", color: "var(--text-muted)", marginTop: "4px" }}>
              <span>65% Stablecoins</span>
              <span>20% JGC Backing</span>
              <span>15% DEX LP Pool</span>
            </div>
          </div>

        </div>

        {/* Right Side: Dynamic AI Impact Assessment Output */}
        <div style={{ background: "rgba(12, 11, 32, 0.25)", border: "1px solid var(--glass-border)", padding: "16px", borderRadius: "10px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <h4 style={{ fontSize: "12px", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "12px", letterSpacing: "0.03em" }}>
            🛡️ AI Contributor Assessment Report
          </h4>

          {!prResult && !isEvaluating && (
            <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "24px 0", fontStyle: "italic", fontSize: "12px" }}>
              Awaiting pull request submission payload. Enter PR description to review impact assessment...
            </div>
          )}

          {isEvaluating && (
            <div style={{ textAlign: "center", color: "var(--color-cyan)", padding: "24px 0", fontSize: "12px", display: "flex", flexDirection: "column", gap: "8px", alignItems: "center" }}>
              <div className="dot-typing" />
              <span>Static Heuristics Analysis Running...</span>
              <span style={{ fontSize: "9px", color: "var(--text-muted)" }}>Evaluating gas changes and security vectors.</span>
            </div>
          )}

          {prResult && !isEvaluating && (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              
              {/* Score Ratings Indicators */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", background: "rgba(0,0,0,0.2)", padding: "10px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.02)" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "9px", color: "var(--text-muted)" }}>Complexity</div>
                  <div style={{ fontSize: "14px", fontWeight: "800", color: "#fff" }}>{prResult.complexity}/100</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "9px", color: "var(--text-muted)" }}>Security</div>
                  <div style={{ fontSize: "14px", fontWeight: "800", color: "var(--color-neon-green)" }}>{prResult.security}/100</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "9px", color: "var(--text-muted)" }}>Gas Saving</div>
                  <div style={{ fontSize: "14px", fontWeight: "800", color: "var(--color-cyan)" }}>{prResult.gasEfficacy > 0 ? `+${prResult.gasEfficacy}%` : "Stable"}</div>
                </div>
              </div>

              {/* Reward claims display */}
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                
                <div style={{ background: "rgba(0,0,0,0.3)", padding: "10px", borderRadius: "6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <span style={{ fontSize: "10px", color: "var(--text-secondary)" }}>Immediate Payout</span>
                    <div style={{ fontSize: "16px", fontWeight: "800", color: "#fff", marginTop: "2px" }}>
                      {prResult.jgtReward.toLocaleString()} $JGT
                    </div>
                  </div>
                  <span style={{ fontSize: "8px", color: "var(--text-muted)", background: "rgba(255,255,255,0.05)", padding: "3px 6px", borderRadius: "3px", textTransform: "uppercase" }}>
                    Liquid Utility
                  </span>
                </div>

                <div style={{ background: "rgba(0,0,0,0.3)", padding: "10px", borderRadius: "6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <span style={{ fontSize: "10px", color: "var(--text-secondary)" }}>Autonomy Equity (AE) Stake</span>
                    <div style={{ fontSize: "16px", fontWeight: "800", color: "var(--color-purple)", marginTop: "2px" }}>
                      {prResult.aeStake}% of Treasury
                    </div>
                  </div>
                  <span style={{ fontSize: "8px", color: "var(--color-purple)", background: "rgba(155, 81, 224, 0.1)", padding: "3px 6px", borderRadius: "3px", textTransform: "uppercase", fontWeight: "600" }}>
                    Vested Claim
                  </span>
                </div>

                <div style={{ background: "rgba(0, 242, 254, 0.05)", border: "1px solid rgba(0, 242, 254, 0.15)", padding: "10px", borderRadius: "6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <span style={{ fontSize: "10px", color: "var(--text-secondary)" }}>Est. Liquidation Value</span>
                    <div style={{ fontSize: "16px", fontWeight: "800", color: "var(--color-cyan)", marginTop: "2px" }}>
                      ${computedStakeValue.toLocaleString()} USD
                    </div>
                  </div>
                  <span style={{ fontSize: "8px", color: "var(--color-cyan)", background: "rgba(0, 242, 254, 0.12)", padding: "3px 6px", borderRadius: "3px", textTransform: "uppercase", fontWeight: "700" }}>
                    Redeemable
                  </span>
                </div>

              </div>

            </div>
          )}

        </div>

      </div>

      {/* Leaderboard Table section */}
      <div style={{ borderTop: "1px solid var(--glass-border)", paddingTop: "16px" }}>
        <h4 style={{ fontSize: "12px", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "10px", letterSpacing: "0.03em" }}>
          🌐 OSCRP Network Contributor Leaderboard (Verified Claims)
        </h4>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", textAlign: "left" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", color: "var(--text-muted)", fontSize: "11px" }}>
                <th style={{ padding: "8px" }}>Rank</th>
                <th style={{ padding: "8px" }}>Contributor</th>
                <th style={{ padding: "8px" }}>Verified Merged Pull Request</th>
                <th style={{ padding: "8px", textAlign: "right" }}>Liquid $JGT</th>
                <th style={{ padding: "8px", textAlign: "right" }}>Equity Stake</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((dev) => {
                const isUser = dev.user === "you.builder";
                return (
                  <tr 
                    key={dev.rank} 
                    style={{ 
                      borderBottom: "1px solid rgba(255,255,255,0.02)", 
                      background: isUser ? "rgba(0, 242, 254, 0.03)" : "transparent",
                      color: isUser ? "var(--color-cyan)" : "#fff",
                      transition: "all 0.3s ease"
                    }}
                  >
                    <td style={{ padding: "10px 8px", fontWeight: "700", color: isUser ? "var(--color-cyan)" : "var(--text-muted)" }}>
                      #{dev.rank}
                    </td>
                    <td style={{ padding: "10px 8px", fontWeight: "600" }}>
                      {dev.user}
                    </td>
                    <td style={{ padding: "10px 8px", color: isUser ? "#fff" : "var(--text-secondary)" }}>
                      <span style={{ 
                        display: "inline-block", 
                        fontSize: "9px", 
                        background: dev.category === "Gas Opt" ? "rgba(0, 242, 254, 0.08)" : 
                                    dev.category === "Security" ? "rgba(155, 81, 224, 0.1)" : "rgba(255,255,255,0.05)",
                        color: dev.category === "Gas Opt" ? "var(--color-cyan)" : 
                               dev.category === "Security" ? "var(--color-purple)" : "var(--text-secondary)",
                        padding: "1px 4px",
                        borderRadius: "3px",
                        marginRight: "6px",
                        fontWeight: "700"
                      }}>
                        {dev.category}
                      </span>
                      {dev.contribution}
                    </td>
                    <td style={{ padding: "10px 8px", textAlign: "right", fontWeight: "700" }}>
                      {dev.jgt.toLocaleString()}
                    </td>
                    <td style={{ padding: "10px 8px", textAlign: "right", color: "var(--color-purple)", fontWeight: "600" }}>
                      {dev.ae}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
