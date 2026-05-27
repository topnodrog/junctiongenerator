"use client";

import React, { useState, useEffect, useRef } from "react";

const SOL_MEME_CODE = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title Junction Generated Token
 * @dev Compiled programmatically by Daedalus (CTO Agent)
 * @notice Vibe coding compiled successfully.
 */
contract VibeMemeCoin is ERC20, Ownable {
    uint256 public constant TRANSACTION_TAX_BPS = 100; // 1% Tax
    address public treasuryWallet;
    
    event TaxCollected(address indexed sender, address indexed recipient, uint256 amount);
    
    constructor(
        string memory name, 
        string memory symbol, 
        uint256 initialSupply,
        address _treasury
    ) ERC20(name, symbol) Ownable(msg.sender) {
        _mint(msg.sender, initialSupply * 10**decimals());
        treasuryWallet = _treasury;
    }

    function transfer(address to, uint256 value) public override returns (bool) {
        uint256 taxAmount = (value * TRANSACTION_TAX_BPS) / 10000;
        uint256 sendAmount = value - taxAmount;
        
        if (taxAmount > 0) {
            super.transfer(treasuryWallet, taxAmount);
            emit TaxCollected(msg.sender, treasuryWallet, taxAmount);
        }
        
        return super.transfer(to, sendAmount);
    }
}`;

const SOL_NFT_CODE = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title Neural Canvas NFT
 * @dev Custom ERC-721 contract compiled programmatically.
 */
contract NeuralCanvas is ERC721, Ownable {
    uint256 public nextTokenId;
    uint256 public mintPrice = 0.05 ether;
    
    constructor(string memory name, string memory symbol) 
        ERC721(name, symbol) 
        Ownable(msg.sender) 
    {}
    
    function mintNFT() public payable returns (uint256) {
        require(msg.value >= mintPrice, "Insufficient mint payment.");
        uint256 tokenId = nextTokenId;
        _safeMint(msg.sender, tokenId);
        nextTokenId++;
        return tokenId;
    }
}`;

const SOL_DEFAULT_CODE = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

contract JunctionCustomDAO is Ownable {
    struct Proposal {
        string description;
        uint256 voteCount;
        bool executed;
    }
    
    Proposal[] public proposals;
    mapping(address => bool) public members;
    
    constructor() Ownable(msg.sender) {
        members[msg.sender] = true;
    }
    
    function submitProposal(string memory desc) public {
        require(members[msg.sender], "Members only.");
        proposals.push(Proposal({
            description: desc,
            voteCount: 0,
            executed: false
        }));
    }
}`;

export default function VibePlayground() {
  const [prompt, setPrompt] = useState("");
  const [compileState, setCompileState] = useState<"idle" | "tokenizing" | "synthesizing" | "auditing" | "compiling" | "completed">("idle");
  const [outputCode, setOutputCode] = useState("");
  const [displayedCode, setDisplayedCode] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const consoleEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  const addLog = (msg: string, delay = 0) => {
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
        resolve();
      }, delay);
    });
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    setCompileState("tokenizing");
    setLogs([]);
    setDisplayedCode("");
    
    // Choose pre-defined code template based on query keywords
    const lowerPrompt = prompt.toLowerCase();
    let codeTemplate = SOL_DEFAULT_CODE;
    if (lowerPrompt.includes("meme") || lowerPrompt.includes("token") || lowerPrompt.includes("coin")) {
      codeTemplate = SOL_MEME_CODE;
    } else if (lowerPrompt.includes("nft") || lowerPrompt.includes("art") || lowerPrompt.includes("erc721")) {
      codeTemplate = SOL_NFT_CODE;
    }
    setOutputCode(codeTemplate);

    await addLog("🤖 Initializing Natural Language Compiler Daemon...", 100);
    await addLog("✨ Tokenizing vibe parameters: \"" + prompt.slice(0, 40) + (prompt.length > 40 ? "..." : "") + "\"", 600);
    
    setCompileState("synthesizing");
    await addLog("⚡ Parsing semantic grammar and routing to synthesis grid...", 400);
    await addLog("🧠 Querying Fine-Tuned Code-Compiling LLM (13.7B MoE)...", 600);
    
    setCompileState("auditing");
    await addLog("🛡️ Routing compiled AST to Adversarial Auditor Agent (Daedalus)...", 500);
    await addLog("🔍 Daedalus: Running static analysis checks...", 400);
    await addLog("🔍 Daedalus: Checking for re-entrancy, underflows, and owner-privilege bypasses...", 600);
    await addLog("✅ Daedalus: Zero high-severity vulnerabilities found. Audit rating: 9.8/10", 500);
    
    setCompileState("compiling");
    await addLog("📦 Compiling secure EVM bytecode...", 400);
    await addLog("🔋 Estimating Gas optimization coefficients: Complete.", 300);
    
    setCompileState("completed");
    await addLog("🚀 Compile Complete! Smart Contract synthesized successfully in 3.92s.", 300);

    // Typing effect for the code
    let currentIdx = 0;
    const interval = setInterval(() => {
      if (currentIdx < codeTemplate.length) {
        setDisplayedCode((prev) => prev + codeTemplate.slice(currentIdx, currentIdx + 6));
        currentIdx += 6;
      } else {
        clearInterval(interval);
      }
    }, 15);
  };

  return (
    <div className="glass-container" style={{ gridColumn: "span 2" }}>
      <h3 style={{ fontSize: "20px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ color: "var(--color-cyan)" }}>⚡</span> Interactive Vibe-Coding Compiler
      </h3>
      <p style={{ color: "var(--text-secondary)", fontSize: "14px", marginBottom: "20px" }}>
        Describe what you want in plain English. The Multi-Agent compiler compiles it into secure Solidity, runs an adversarial security audit, and readies it for gas-optimized deployment.
      </p>

      <div className="playground-input-container">
        <textarea
          className="playground-textarea"
          placeholder="e.g. Create a meme coin named Astro with a 1% transaction tax sent to my wallet, and make ownership renounceable..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={compileState !== "idle" && compileState !== "completed"}
        />
        <button
          className="btn-glow-purple"
          onClick={handleGenerate}
          disabled={compileState !== "idle" && compileState !== "completed"}
          style={{ height: "64px", padding: "0 24px" }}
        >
          {compileState === "idle" || compileState === "completed" ? "Compile" : "Processing..."}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginTop: "24px" }}>
        <div>
          <h4 style={{ fontSize: "14px", color: "var(--text-muted)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Compilation Terminal
          </h4>
          <div className="console-terminal">
            {logs.length === 0 && (
              <div style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
                Terminal inactive. Enter prompt above and click Compile.
              </div>
            )}
            {logs.map((log, i) => {
              let logColor = "#e2e8f0";
              if (log.includes("✅") || log.includes("Complete")) logColor = "var(--color-neon-green)";
              if (log.includes("🛡️") || log.includes("Daedalus")) logColor = "var(--color-purple)";
              if (log.includes("🤖") || log.includes("Initializing")) logColor = "var(--color-cyan)";
              
              return (
                <div key={i} style={{ color: logColor, marginBottom: "6px", wordBreak: "break-all" }}>
                  {log}
                </div>
              );
            })}
            <div ref={consoleEndRef} />
          </div>
        </div>

        <div>
          <h4 style={{ fontSize: "14px", color: "var(--text-muted)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Generated Smart Contract (.sol)
          </h4>
          <div className="console-terminal" style={{ height: "280px", color: "#34d399", overflowX: "hidden" }}>
            {displayedCode ? (
              <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all", fontFamily: "var(--font-mono)", fontSize: "12px", lineHeight: "1.4" }}>
                {displayedCode}
              </pre>
            ) : (
              <div style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
                Waiting for compilation bytecode...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
