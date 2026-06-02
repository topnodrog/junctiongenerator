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

const INITIAL_AGENT_DATA: Record<AgentName, AgentDetails> = {
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
  const [agents, setAgents] = useState(INITIAL_AGENT_DATA);
  const [customPrompt, setCustomPrompt] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [typingAgent, setTypingAgent] = useState<AgentName | null>(null);
  
  const consoleEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom of terminal when logs change or active agent changes
  useEffect(() => {
    if (consoleEndRef.current) {
      const container = consoleEndRef.current.closest('.console-terminal');
      if (container) {
        container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
      }
    }
  }, [activeAgent, agents, typingAgent]);

  // Background passive logs simulator (paused during active user scenario runs or when tab hidden)
  useEffect(() => {
    if (isProcessing) return;

    const interval = setInterval(() => {
      // Skip if tab is not visible (save resources)
      if (typeof document !== "undefined" && document.hidden) return;
      
      const agentNames: AgentName[] = ["helios", "daedalus", "hermes", "midas", "athena"];
      const randomAgent = agentNames[Math.floor(Math.random() * agentNames.length)];
      
      const newLogs = [...agents[randomAgent].logs];
      if (newLogs.length > 20) newLogs.shift();
      
      let newLogMsg = "";
      switch (randomAgent) {
        case "helios":
          newLogMsg = `Macro simulation step completed. Platform efficiency optimization running at 99.8% capacity.`;
          break;
        case "daedalus":
          newLogMsg = `EVM Compiler Node #${Math.floor(Math.random() * 8)}: Secure AST validation pipeline initialized successfully.`;
          break;
        case "hermes":
          newLogMsg = `Hermes Sentiment Daemon: Farcaster channel traffic is up 8.2% for PoUC related discussions.`;
          break;
        case "midas":
          newLogMsg = `Balancing treasury pools. Swapping transaction gas fees on Uniswap V3 smart routing.`;
          break;
        case "athena":
          newLogMsg = `Athena Relay: Community FAQ logs updated for new ERC-721 gas-optimized contract templates.`;
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
    }, 6000);

    return () => clearInterval(interval);
  }, [agents, isProcessing]);

  // Run Coordinated Multi-Agent operational scenario
  const handleRunScenario = async (promptText: string) => {
    if (isProcessing || !promptText.trim()) return;
    setIsProcessing(true);
    setCustomPrompt("");

    const lowerPrompt = promptText.toLowerCase();
    let turns: { agent: AgentName; message: string; status: string }[] = [];

    if (lowerPrompt.includes("airdrop") || lowerPrompt.includes("campaign") || lowerPrompt.includes("1")) {
      turns = [
        {
          agent: "helios",
          message: "Received strategic directive: Initialize airdrop distribution campaign. Commencing macro-feasibility assessment... CMO Hermes, formulate outreach and token distribution models.",
          status: "Assessing Campaign Feasibility"
        },
        {
          agent: "hermes",
          message: "Feasibility confirmed. viral outreach hooks prepared for developer channels on X and Farcaster. Allocating 500,000 $JGT. Midas, verify treasury capacity.",
          status: "Drafting Viral Outreach & Allocating $JGT"
        },
        {
          agent: "midas",
          message: "Treasury verified. swaped market reserves to match promotional allocation. Processing token escrow authorization of 500,000 $JGT. Daedalus, compile claiming mechanics.",
          status: "Funding Promotional Escrow"
        },
        {
          agent: "daedalus",
          message: "Escrow claiming contract compiled and deployed to testnet. Implemented verified gas-efficient Merkle proofs to reduce builder claim costs by 35%. Payload ready.",
          status: "Compiling Escrow claiming contract"
        },
        {
          agent: "athena",
          message: "Developer portal modules updated. Announcement webhooks primed. Dispatching Discord/Telegram launch notification to 12,000+ active builders.",
          status: "Broadcasting Campaign to Community"
        },
        {
          agent: "helios",
          message: "Operational status: Airdrop Escrow active. Sentiment monitoring live. Initial results showing +14% developer signup projection. Success.",
          status: "Monitoring Campaign Telemetry"
        }
      ];
    } else if (lowerPrompt.includes("security") || lowerPrompt.includes("audit") || lowerPrompt.includes("2")) {
      turns = [
        {
          agent: "helios",
          message: "Macro-objective active: Network security audit. Triggering system-wide operational review. Daedalus, launch static analysis sweeps on all EVM synthesis nodes.",
          status: "Triggering Full System Audit"
        },
        {
          agent: "daedalus",
          message: "Audit daemon initialized. Running symbolic execution on compiler models. Inspecting AST graphs for re-entrancy vulnerability vectors and privilege escalation bugs.",
          status: "Auditing EVM Compilation Trees"
        },
        {
          agent: "athena",
          message: "CCO standby: Bug bounty feedback channels opened in public developer circles. Coordinating real-time reporting queues. System health indicators stable.",
          status: "Opening Developer Bounty Queue"
        },
        {
          agent: "midas",
          message: "Midas Risk Registry updated. Funded bug bounty payout vault with 50,000 USDC. Securing rewards in multi-signature vault for zero-day disclosures.",
          status: "Funding Security Bounty Vault"
        },
        {
          agent: "daedalus",
          message: "Analysis results processed. 1,482 contracts tested. Zero high-severity vulnerabilities found. Static optimization rating: 99.8%. Auditor logs generated.",
          status: "Compiling Audit Reports"
        },
        {
          agent: "helios",
          message: "System health check: Complete. Audit report filed under hash JG-AUD-9821. Network security score locked at excellent. Proceeding with standard operations.",
          status: "Finalizing Security Audit Registry"
        }
      ];
    } else if (lowerPrompt.includes("yield") || lowerPrompt.includes("optimize") || lowerPrompt.includes("3")) {
      turns = [
        {
          agent: "helios",
          message: "Macroeconomics objective: Maximize treasury fee yields. CFO Midas, analyze capital allocations and yield-bearing collateral pools.",
          status: "Strategic Rebalancing Review"
        },
        {
          agent: "midas",
          message: "Strategic analysis complete. Rebalancing Uniswap V3 liquidity bounds. Swapping 12% stablecoin treasury into $JGC/ETH pools. Adjusting compounding weights.",
          status: "Rebalancing Liquidity Ranges"
        },
        {
          agent: "daedalus",
          message: "Upgrading automated compounder contracts. Integrated optimized loop logic to reduce automated transaction swap overheads by 18,200 gas units per execution.",
          status: "Optimizing Compounder Solidity"
        },
        {
          agent: "hermes",
          message: "Yield rebalancing broadcast ready. Landing page telemetry showing optimized yield rate: +12.4% projected APR. Crafting yield statistics marketing hooks.",
          status: "Updating Public Yield Telemetry"
        },
        {
          agent: "helios",
          message: "Capital efficiency optimized. Treasury rebalance finalized. Yield compounders running with high gas-efficiency. Operational metrics optimal.",
          status: "Securing High Capital Efficacy"
        }
      ];
    } else if (lowerPrompt.includes("abstraction") || lowerPrompt.includes("account") || lowerPrompt.includes("4")) {
      turns = [
        {
          agent: "athena",
          message: "Alert: High developer feedback volume requesting ERC-4337 Account Abstraction contract templates. Requesting priority development backlog allocation.",
          status: "Processing Community Requests"
        },
        {
          agent: "helios",
          message: "Directive approved. Developer satisfaction is a key metric. CTO Daedalus, implement account abstraction Paymaster and UserOperation contract templates.",
          status: "Adjusting Development Priorities"
        },
        {
          agent: "daedalus",
          message: "Synthesizing ERC-4337 templates. Standardizing secure EntryPoint, Paymaster logic, and multisig owner validations. Adjusting compiler heuristics.",
          status: "Drafting ERC-4337 Scaffolding"
        },
        {
          agent: "midas",
          message: "Funding developer gas subsidization wallet. Allocating 10 ETH to the Paymaster contract pool to sponsor dynamic gas fees for early builders using new templates.",
          status: "Funding Gas-Sponsor Paymaster"
        },
        {
          agent: "hermes",
          message: "Marketing hooks live: 'Junction account abstraction is active - build smart account wallets with zero deploy gas'. launching targeted developer challenge.",
          status: "Launching Developer Hack Challenge"
        },
        {
          agent: "helios",
          message: "ERC-4337 scaffolds successfully merged into compiler. Gas subsidies live. Developer ecosystem metrics locked and trending highly bullish.",
          status: "Finalizing ERC-4337 Deployment"
        }
      ];
    } else {
      // Custom query fallback scenario
      turns = [
        {
          agent: "helios",
          message: `Strategic operational directive received: "${promptText}". Initializing C-Suite analysis... CTO Daedalus, assess the technical integration parameters.`,
          status: "Analyzing Strategic Input"
        },
        {
          agent: "daedalus",
          message: `Technical specifications reviewed. Modifying dynamic compiler nodes and testing AST structures for "${promptText}". Commencing simulation.`,
          status: "Modeling Integration Mechanics"
        },
        {
          agent: "midas",
          message: "Capital resources verified. Swapping stable assets to allocate development grants for the proposed objective. Balances aligned.",
          status: "Securing Financial Allocation"
        },
        {
          agent: "hermes",
          message: "Coordinating narrative strategy. Crafting announcements outlining Junction Generator's automated support for the new integration.",
          status: "Deploying Narrative Strategy"
        },
        {
          agent: "athena",
          message: "Developer channels briefed. Aligning FAQ documentation logs to support incoming inquiries. Feedback loops are active.",
          status: "Synchronizing Community Support"
        },
        {
          agent: "helios",
          message: `Strategic directive "${promptText}" successfully modeled, audited, and processed into active C-Suite operational roadmap. Success.`,
          status: "Integrating into Active Roadmap"
        }
      ];
    }

    // Sequentially play out dialogue turns
    for (let i = 0; i < turns.length; i++) {
      const turn = turns[i];
      
      // Highlight speaker tab and show typing status
      setActiveAgent(turn.agent);
      setTypingAgent(turn.agent);
      
      // Update status text on the active agent
      setAgents((prev) => ({
        ...prev,
        [turn.agent]: {
          ...prev[turn.agent],
          status: turn.status
        }
      }));

      // Simulate network processing delay before log prints
      await new Promise<void>((resolve) => setTimeout(resolve, 2400));
      
      // Append the actual message to logs
      setAgents((prev) => {
        const agentLogs = [...prev[turn.agent].logs];
        if (agentLogs.length > 25) agentLogs.shift();
        agentLogs.push(turn.message);
        return {
          ...prev,
          [turn.agent]: {
            ...prev[turn.agent],
            logs: agentLogs
          }
        };
      });
      
      setTypingAgent(null);
    }
    
    // Set agents back to standard standby statuses
    setAgents((prev) => {
      const updated = { ...prev };
      (Object.keys(updated) as AgentName[]).forEach((key) => {
        updated[key].status = INITIAL_AGENT_DATA[key].status;
      });
      return updated;
    });
    
    setIsProcessing(false);
  };

  const currentAgent = agents[activeAgent];

  return (
    <div className="glass-container" style={{ gridColumn: "span 2" }}>
      <h3 style={{ fontSize: "18px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ color: "var(--color-cyan)" }}>🤖</span> Autonomous C-Suite Agent Console
      </h3>
      <p style={{ color: "var(--text-secondary)", fontSize: "13px", marginBottom: "20px" }}>
        Monitor active logs and reasoning traces of the interconnected multi-agent corporate system, recursively evolving on the DNCG compute grid. Send strategic orders to trigger real-time coordinated executive campaigns.
      </p>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "20px", borderBottom: "1px solid var(--glass-border)", paddingBottom: "12px" }}>
        {(Object.keys(agents) as AgentName[]).map((key) => {
          const agent = agents[key];
          const isActive = key === activeAgent;
          const isTyping = key === typingAgent;
          return (
            <button
              key={key}
              onClick={() => !isProcessing && setActiveAgent(key)}
              disabled={isProcessing && !isActive}
              style={{
                background: isActive ? agent.accent : "rgba(255,255,255,0.03)",
                border: "1px solid",
                borderColor: isActive ? agent.accent : "var(--glass-border)",
                borderRadius: "8px",
                padding: "8px 16px",
                color: isActive ? "#030209" : "#fff",
                fontWeight: "600",
                fontSize: "13px",
                cursor: isProcessing ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
                boxShadow: isActive ? `0 0 15px ${agent.accent}` : "none",
                opacity: isProcessing && !isActive ? 0.4 : 1
              }}
            >
              <span>{agent.avatar}</span>
              <span>{agent.name}</span>
              {isTyping && (
                <span 
                  style={{ 
                    display: "inline-block", 
                    width: "6px", 
                    height: "6px", 
                    borderRadius: "50%", 
                    background: "#030209", 
                    animation: "glow-pulse 0.8s infinite alternate" 
                  }} 
                />
              )}
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
            <span 
              style={{ 
                display: "inline-block", 
                width: "8px", 
                height: "8px", 
                borderRadius: "50%", 
                background: typingAgent === activeAgent ? "var(--color-cyan)" : "var(--color-neon-green)", 
                animation: "glow-pulse 1.5s infinite" 
              }}
            />
            <span style={{ fontSize: "12px", color: typingAgent === activeAgent ? "var(--color-cyan)" : "var(--color-neon-green)", fontWeight: "600" }}>
              {typingAgent === activeAgent ? "Coordinating System Logic..." : currentAgent.status}
            </span>
          </div>
        </div>
      </div>

      {/* Console Terminal */}
      <div style={{ marginBottom: "20px" }}>
        <h5 style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "8px", textTransform: "uppercase" }}>Agent Reasoning Traces & System Log</h5>
        <div className="console-terminal" style={{ height: "200px" }}>
          {currentAgent.logs.map((log, i) => (
            <div key={i} style={{ marginBottom: "6px", lineHeight: "1.4" }}>
              <span style={{ color: currentAgent.accent, fontWeight: "600", marginRight: "8px" }}>[{currentAgent.name}]</span>
              <span style={{ color: "#e2e8f0" }}>{log}</span>
            </div>
          ))}
          {typingAgent === activeAgent && (
            <div style={{ fontStyle: "italic", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "6px", marginTop: "8px" }}>
              <span className="dot-typing" />
              <span>Analyzing incoming directives and streaming responses...</span>
            </div>
          )}
          <div ref={consoleEndRef} />
        </div>
      </div>

      {/* Interactive Chat Prompts & Actions */}
      <div style={{ borderTop: "1px solid var(--glass-border)", paddingTop: "16px" }}>
        <h5 style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "10px", textTransform: "uppercase" }}>
          Send Coordinated C-Suite Directives
        </h5>
        
        {/* Quick action buttons */}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
          <button 
            disabled={isProcessing}
            onClick={() => handleRunScenario("airdrop")}
            className="btn-glow-cyan"
            style={{ padding: "6px 12px", fontSize: "11px", height: "auto" }}
          >
            🚀 Launch JGT Airdrop
          </button>
          <button 
            disabled={isProcessing}
            onClick={() => handleRunScenario("security")}
            className="btn-glow-purple"
            style={{ padding: "6px 12px", fontSize: "11px", height: "auto" }}
          >
            🛡️ Run Security Audit
          </button>
          <button 
            disabled={isProcessing}
            onClick={() => handleRunScenario("yield")}
            className="btn-glow-cyan"
            style={{ padding: "6px 12px", fontSize: "11px", height: "auto", borderColor: "var(--color-magenta)", color: "var(--color-magenta)" }}
          >
            📈 Optimize Treasury Yields
          </button>
          <button 
            disabled={isProcessing}
            onClick={() => handleRunScenario("abstraction")}
            className="btn-glow-purple"
            style={{ padding: "6px 12px", fontSize: "11px", height: "auto", background: "linear-gradient(135deg, rgba(57,255,20,0.1) 0%, rgba(57,255,20,0.05) 100%)", borderColor: "var(--color-neon-green)", color: "var(--color-neon-green)", boxShadow: "0 0 15px rgba(57,255,20,0.15)" }}
          >
            👥 Scaffolds Account Abstraction
          </button>
        </div>

        {/* Custom query prompt input */}
        <form 
          onSubmit={(e) => {
            e.preventDefault();
            handleRunScenario(customPrompt);
          }}
          style={{ display: "flex", gap: "10px" }}
        >
          <input
            type="text"
            className="playground-textarea"
            placeholder={isProcessing ? "Council is processing strategic request..." : "e.g., Integrate deep reinforcement learning trading agents, launch hackathon campaign..."}
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            disabled={isProcessing}
            style={{ height: "46px", padding: "12px", fontSize: "13px" }}
          />
          <button
            type="submit"
            className="btn-glow-purple"
            disabled={isProcessing || !customPrompt.trim()}
            style={{ height: "46px", padding: "0 20px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px" }}
          >
            {isProcessing ? "Processing..." : "Dispatch"}
          </button>
        </form>
      </div>
    </div>
  );
}
