"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  AgentName,
  AgentDetails,
  DialogueTurn,
  INITIAL_AGENT_DATA,
  SCENARIO_DIALOGUES,
  getFallbackDialogue,
} from "@/lib/constants";


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
      consoleEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [activeAgent, agents, typingAgent]);

  // Background passive logs simulator (paused during active user scenario runs)
  useEffect(() => {
    if (isProcessing) return;

    const interval = setInterval(() => {
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
    let turns: DialogueTurn[];

    if (lowerPrompt.includes("airdrop") || lowerPrompt.includes("campaign") || lowerPrompt.includes("1")) {
      turns = SCENARIO_DIALOGUES.airdrop;
    } else if (lowerPrompt.includes("security") || lowerPrompt.includes("audit") || lowerPrompt.includes("2")) {
      turns = SCENARIO_DIALOGUES.security;
    } else if (lowerPrompt.includes("yield") || lowerPrompt.includes("optimize") || lowerPrompt.includes("3")) {
      turns = SCENARIO_DIALOGUES.yield;
    } else if (lowerPrompt.includes("abstraction") || lowerPrompt.includes("account") || lowerPrompt.includes("4")) {
      turns = SCENARIO_DIALOGUES.abstraction;
    } else {
      turns = getFallbackDialogue(promptText);
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
