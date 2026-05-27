"use client";

import React, { useState, useEffect, useRef } from "react";

type AgentName = "helios" | "daedalus" | "hermes" | "midas" | "athena";

interface AgentDetails {
  name: string;
  role: string;
  status: string;
  avatar: string;
  accent: string;
  logs: string[];
}

const AGENT_DATA: Record<AgentName, AgentDetails> = {
  helios: {
    name: "Helios",
    role: "Chief Executive Officer (CEO)",
    status: "Simulating Macroeconomic Scenarios",
    avatar: "👑",
    accent: "var(--color-cyan)",
    logs: [
      "KPI Check: Platform transaction volume increased 12.8% week-over-week.",
      "Optimizing resource routing: Allocation parameters set to 84% Internal / 16% External compute marketplace.",
      "Analyzing JGT deflationary velocity coefficient... Burn rate is stable at 42.1K JGT/day.",
      "Helios Operational Objective: Target fully autonomous operational milestone by Q4 2026.",
      "System Audit: All C-Suite agents synchronized. Efficacy index: 99.8%"
    ]
  },
  daedalus: {
    name: "Daedalus",
    role: "Chief Technology Officer (CTO)",
    status: "Running Simulated Adversarial Contract Exploits",
    avatar: "🛠️",
    accent: "var(--color-purple)",
    logs: [
      "Compiling AST structures for user request: AstroCoin ERC-20...",
      "Symbolic execution run completed on compiler node #4. Vulnerability check: 0 issues.",
      "Daedalus Patch: Optimized ERC-721 token-uri resolution routine, saving 3,100 gas per mint.",
      "Integrating memory-hard PoUC modifications to prevent centralized ASIC rig pooling.",
      "AEFL Loop: Commencing model fine-tuning run on 1,200 newly audited secure contract schemas."
    ]
  },
  hermes: {
    name: "Hermes",
    role: "Chief Marketing Officer (CMO)",
    status: "Analyzing Social Media Sentiment Flywheels",
    avatar: "📢",
    accent: "var(--color-magenta)",
    logs: [
      "Hermes Crawl Daemon: Scraped 42,000 developer mentions on X and Farcaster.",
      "Narrative Radar: Meme coins and custom DAOs are trending in developer communities.",
      "Hermes Automated Campaign: Scheduled JGT promotion airdrop targeting active ERC-20 builders.",
      "Engaging with community feedback on new yield compiler templates.",
      "Hermes Prediction: Developer onboarding rate to increase by 18% following freemium launch."
    ]
  },
  midas: {
    name: "Midas",
    role: "Chief Financial Officer (CFO)",
    status: "Programmatically Balancing Treasury Pools",
    avatar: "💰",
    accent: "var(--color-blue)",
    logs: [
      "Midas Oracle: Fetching spot prices from decentralized liquidity networks...",
      "Fee Cycle Executed: Collected $14,200 USD platform fees. Exchanged to JGT.",
      "Programmatic Burn Initiated: 100% of collected fees ($JGT) sent to 0x00...dEaD.",
      "DNCG Market Liquidity: Excess compute sold. Credited $4,820 USDC to staking reward reserves.",
      "Rebalancing Treasury Portfolio: Maintaining 65% stable assets, 35% JGC liquidity backing."
    ]
  },
  athena: {
    name: "Athena",
    role: "Chief Community Officer (CCO)",
    status: "Monitoring Support Queues & Feedbacks",
    avatar: "🛡️",
    accent: "var(--color-neon-green)",
    logs: [
      "Athena Support Loop: Closed 34 developer tickets in Discord and Telegram.",
      "Aggregating user feedback: 12 requests received for ERC-4337 Account Abstraction scaffolds.",
      "Relaying feature requests directly to CTO Agent Daedalus compilation backlog.",
      "Welcome bot active: Greeted 182 new developers entering the Junction Generator network.",
      "Community health index: 98.4% Positive. Sentiment triggers remain highly bullish."
    ]
  }
};

export default function AgentConsole() {
  const [activeAgent, setActiveAgent] = useState<AgentName>("helios");
  const [agents, setAgents] = useState(AGENT_DATA);
  const consoleEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [activeAgent, agents]);

  useEffect(() => {
    const interval = setInterval(() => {
      // Simulate live random updates to the logs of one of the agents
      const agentNames: AgentName[] = ["helios", "daedalus", "hermes", "midas", "athena"];
      const randomAgent = agentNames[Math.floor(Math.random() * agentNames.length)];
      
      const newLogs = [...agents[randomAgent].logs];
      if (newLogs.length > 20) newLogs.shift();
      
      let newLogMsg = "";
      const timeStr = new Date().toLocaleTimeString();
      
      switch (randomAgent) {
        case "helios":
          newLogMsg = `Macro simulation step completed. Agent parameters running optimally.`;
          break;
        case "daedalus":
          newLogMsg = `EVM Compiler Node #${Math.floor(Math.random() * 8)}: Received compilation payload.`;
          break;
        case "hermes":
          newLogMsg = `Adjusting ad-spend metrics based on dynamic community conversion telemetry.`;
          break;
        case "midas":
          newLogMsg = `Programmatically balancing Uniswap V3 liquidity ranges to optimize swap slippage.`;
          break;
        case "athena":
          newLogMsg = `Relayed structural query regarding EVM gas optimization from user #2942 to Daedalus.`;
          break;
      }
      
      newLogs.push(newLogMsg);
      
      setAgents((prev) => ({
        ...prev,
        [randomAgent]: {
          ...prev[randomAgent],
          logs: newLogs
        }
      }));
    }, 4500);

    return () => clearInterval(interval);
  }, [agents]);

  const currentAgent = agents[activeAgent];

  return (
    <div className="glass-container" style={{ gridColumn: "span 2" }}>
      <h3 style={{ fontSize: "18px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ color: "var(--color-cyan)" }}>🤖</span> Autonomous C-Suite Agent Console
      </h3>
      <p style={{ color: "var(--text-secondary)", fontSize: "13px", marginBottom: "20px" }}>
        Monitor active logs and processing traces of the interconnected multi-agent corporate system, recursively evolving on the DNCG compute grid.
      </p>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "20px", borderBottom: "1px solid var(--glass-border)", paddingBottom: "12px" }}>
        {(Object.keys(agents) as AgentName[]).map((key) => {
          const agent = agents[key];
          const isActive = key === activeAgent;
          return (
            <button
              key={key}
              onClick={() => setActiveAgent(key)}
              style={{
                background: isActive ? agent.accent : "rgba(255,255,255,0.03)",
                border: "1px solid",
                borderColor: isActive ? agent.accent : "var(--glass-border)",
                borderRadius: "8px",
                padding: "8px 16px",
                color: isActive ? "#030209" : "#fff",
                fontWeight: "600",
                fontSize: "13px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
                boxShadow: isActive ? `0 0 15px ${agent.accent}` : "none"
              }}
            >
              <span>{agent.avatar}</span>
              <span>{agent.name}</span>
            </button>
          );
        })}
      </div>

      {/* Agent details */}
      <div style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.02)", padding: "16px", borderRadius: "10px", marginBottom: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
          <div>
            <h4 style={{ fontSize: "16px", fontWeight: "700" }}>{currentAgent.name}</h4>
            <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>{currentAgent.role}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: "var(--color-neon-green)", animation: "glow-pulse 1.5s infinite" }}></span>
            <span style={{ fontSize: "12px", color: "var(--color-neon-green)", fontWeight: "600" }}>{currentAgent.status}</span>
          </div>
        </div>
      </div>

      {/* Console Terminal */}
      <div>
        <h5 style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "8px", textTransform: "uppercase" }}>Agent Reasoning Traces & System Log</h5>
        <div className="console-terminal" style={{ height: "200px" }}>
          {currentAgent.logs.map((log, i) => (
            <div key={i} style={{ marginBottom: "6px", lineHeight: "1.4" }}>
              <span style={{ color: currentAgent.accent, fontWeight: "600", marginRight: "8px" }}>[{currentAgent.name}]</span>
              <span style={{ color: "#e2e8f0" }}>{log}</span>
            </div>
          ))}
          <div ref={consoleEndRef} />
        </div>
      </div>
    </div>
  );
}
