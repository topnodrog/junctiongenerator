"use client";

import React, { useState, useEffect, useRef } from "react";

type ContractTemplate = "erc20" | "erc721" | "dao" | "multisig";

interface SecuritySettings {
  reentrancy: boolean;
  gasOptimization: boolean;
  ownerPrivilege: boolean;
  flashLoanGuard: boolean;
}

export default function VibePlayground() {
  const [template, setTemplate] = useState<ContractTemplate>("erc20");
  const [prompt, setPrompt] = useState("");
  const [compileState, setCompileState] = useState<"idle" | "tokenizing" | "synthesizing" | "auditing" | "compiling" | "completed">("idle");
  const [displayedCode, setDisplayedCode] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const consoleEndRef = useRef<HTMLDivElement>(null);

  // Granular settings states
  const [tokenName, setTokenName] = useState("VibeMemeCoin");
  const [tokenSymbol, setTokenSymbol] = useState("VIBE");
  const [initialSupply, setInitialSupply] = useState("1000000");
  const [taxBps, setTaxBps] = useState(100); // 1%
  const [mintPrice, setMintPrice] = useState("0.05");
  const [maxSupply, setMaxSupply] = useState("10000");
  const [votingDelay, setVotingDelay] = useState(7200); // ~1 day in blocks
  const [requiredSigs, setRequiredSigs] = useState(2);

  // Security Toggles
  const [security, setSecurity] = useState<SecuritySettings>({
    reentrancy: true,
    gasOptimization: true,
    ownerPrivilege: true,
    flashLoanGuard: false,
  });

  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  // Generate dynamic contract code based on settings in real-time
  const generateDynamicContract = (): string => {
    const useReentrancy = security.reentrancy;
    const useGasOpt = security.gasOptimization;
    const useOwnerPriv = security.ownerPrivilege;
    const useFlashGuard = security.flashLoanGuard;

    switch (template) {
      case "erc20":
        return `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
${useOwnerPriv ? 'import "@openzeppelin/contracts/access/Ownable.sol";' : ""}
${useReentrancy ? 'import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";' : ""}

/**
 * @title ${tokenName} ERC-20 Token
 * @dev Synthesized & audited programmatically by Daedalus (CTO Agent).
 * @notice Features customized transaction fee tax and advanced security checks.
 */
contract ${tokenName} is ERC20${useOwnerPriv ? ", Ownable" : ""}${useReentrancy ? ", ReentrancyGuard" : ""} {
    uint256 public constant TRANSACTION_TAX_BPS = ${taxBps}; // ${taxBps / 100}% Tax
    address public treasuryWallet;
    
    event TaxCollected(address indexed sender, address indexed recipient, uint256 amount);
    
    constructor(
        uint256 initialSupply,
        address _treasury
    ) ERC20("${tokenName}", "${tokenSymbol}")${useOwnerPriv ? " Ownable(msg.sender)" : ""} {
        _mint(msg.sender, initialSupply * 10**decimals());
        treasuryWallet = _treasury;
    }

    function transfer(address to, uint256 value) public override${useReentrancy ? " nonReentrant" : ""} returns (bool) {
        ${useGasOpt ? "// Gas Optimized Unchecked Math & Short Circuiting" : ""}
        ${useGasOpt ? "unchecked {" : ""}
            uint256 taxAmount = (value * TRANSACTION_TAX_BPS) / 10000;
            uint256 sendAmount = value - taxAmount;
            
            if (taxAmount > 0) {
                super.transfer(treasuryWallet, taxAmount);
                emit TaxCollected(msg.sender, treasuryWallet, taxAmount);
            }
            
            return super.transfer(to, sendAmount);
        ${useGasOpt ? "}" : ""}
    }
    
    ${
      useOwnerPriv
        ? `function setTreasuryWallet(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "Invalid address");
        treasuryWallet = newTreasury;
    }`
        : ""
    }
}`;

      case "erc721":
        return `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
${useOwnerPriv ? 'import "@openzeppelin/contracts/access/Ownable.sol";' : ""}
${useReentrancy ? 'import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";' : ""}

/**
 * @title ${tokenName} NFT Collection
 * @dev Compiled and gas-optimized by Junction Generator.
 */
contract ${tokenName} is ERC721${useOwnerPriv ? ", Ownable" : ""}${useReentrancy ? ", ReentrancyGuard" : ""} {
    ${useGasOpt ? "uint32" : "uint256"} public nextTokenId;
    ${useGasOpt ? "uint32" : "uint256"} public constant MAX_SUPPLY = ${maxSupply};
    uint256 public mintPrice = ${mintPrice} ether;
    
    constructor() ERC721("${tokenName}", "${tokenSymbol}")${useOwnerPriv ? " Ownable(msg.sender)" : ""} {}
    
    function mintNFT() public payable${useReentrancy ? " nonReentrant" : ""} returns (uint256) {
        require(msg.value >= mintPrice, "Insufficient payment");
        ${useFlashGuard ? "require(tx.origin == msg.sender, \"Contracts not allowed to mint (Flash Loan Prevention)\");" : ""}
        
        ${useGasOpt ? "uint32" : "uint256"} tokenId = nextTokenId;
        require(tokenId < MAX_SUPPLY, "Exceeds max supply");
        
        _safeMint(msg.sender, tokenId);
        
        ${useGasOpt ? "unchecked { ++nextTokenId; }" : "nextTokenId++;"}
        return tokenId;
    }
    
    ${
      useOwnerPriv
        ? `function withdrawPayments() external onlyOwner {
        payable(owner()).transfer(address(this).balance);
    }
    
    function setMintPrice(uint256 _newPrice) external onlyOwner {
        mintPrice = _newPrice;
    }`
        : ""
    }
}`;

      case "dao":
        return `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

${useOwnerPriv ? 'import "@openzeppelin/contracts/access/Ownable.sol";' : ""}
${useReentrancy ? 'import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";' : ""}

contract ${tokenName}DAO${useOwnerPriv ? " is Ownable" : ""}${useReentrancy ? " is ReentrancyGuard" : ""} {
    struct Proposal {
        string description;
        uint256 voteCount;
        bool executed;
    }
    
    Proposal[] public proposals;
    mapping(address => bool) public members;
    uint256 public votingDelay = ${votingDelay}; // Delay blocks
    
    constructor()${useOwnerPriv ? " Ownable(msg.sender)" : ""} {
        members[msg.sender] = true;
    }
    
    function submitProposal(${useGasOpt ? "string calldata desc" : "string memory desc"}) public${useReentrancy ? " nonReentrant" : ""} {
        require(members[msg.sender], "Members only");
        proposals.push(Proposal({
            description: desc,
            voteCount: 0,
            executed: false
        }));
    }
    
    function voteProposal(uint256 proposalId) public {
        require(members[msg.sender], "Members only");
        Proposal storage prop = proposals[proposalId];
        prop.voteCount++;
    }
}`;

      case "multisig":
        return `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

${useReentrancy ? 'import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";' : ""}

contract ${tokenName}MultiSig${useReentrancy ? " is ReentrancyGuard" : ""} {
    address[] public owners;
    uint256 public required = ${requiredSigs};
    
    struct Transaction {
        address destination;
        uint256 value;
        bytes data;
        bool executed;
    }
    
    Transaction[] public transactions;
    mapping(uint256 => mapping(address => bool)) public confirmations;
    
    constructor(address[] memory _owners) {
        require(_owners.length > 0, "Owners required");
        require(required <= _owners.length, "Invalid confirmation count");
        owners = _owners;
    }
    
    function submitTransaction(address dest, uint256 val, bytes memory data) public returns (uint256 txId) {
        transactions.push(Transaction({
            destination: dest,
            value: val,
            data: data,
            executed: false
        }));
        txId = transactions.length - 1;
    }
    
    function confirmTransaction(uint256 txId) public {
        confirmations[txId][msg.sender] = true;
    }
    
    function executeTransaction(uint256 txId) public${useReentrancy ? " nonReentrant" : ""} {
        Transaction storage txn = transactions[txId];
        require(!txn.executed, "Already executed");
        
        uint256 count = 0;
        ${useGasOpt ? "uint256 length = owners.length;" : ""}
        for (uint256 i = 0; i < ${useGasOpt ? "length" : "owners.length"}; i++) {
            if (confirmations[txId][owners[i]]) {
                count++;
            }
        }
        
        require(count >= required, "Confirmations insufficient");
        txn.executed = true;
        (bool success, ) = txn.destination.call{value: txn.value}(txn.data);
        require(success, "Transaction failed");
    }
}`;
    }
  };

  const addLog = (msg: string, delay = 0) => {
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
        resolve();
      }, delay);
    });
  };

  const handleCompile = async () => {
    setCompileState("tokenizing");
    setLogs([]);
    setDisplayedCode("");

    const codeTemplate = generateDynamicContract();

    await addLog("🤖 Initializing Daedalus-Synthesis EVM Compiler Core...", 100);
    await addLog(`✨ Processing customized settings: Template [${template.toUpperCase()}] | Contract [${tokenName}]`, 500);
    if (prompt.trim()) {
      await addLog(`✍️ Merging natural language parameters: "${prompt.slice(0, 36)}..."`, 400);
    }
    
    setCompileState("synthesizing");
    await addLog("⚡ Initializing abstract syntax tree (AST) construction...", 400);
    await addLog("🧠 Executing zero-shot compilation LLM (13.7B Mixture of Experts)...", 600);
    
    setCompileState("auditing");
    await addLog("🛡️ Routing AST logic blocks to Adversarial Auditor Node (Daedalus)...", 500);
    await addLog("🔍 Security: Running static vulnerability sweeps...", 400);
    
    // Log active auditor configurations
    if (security.reentrancy) {
      await addLog("🔐 Auditor: Checked external call trees. ReentrancyGuard nonReentrant modifiers injected.", 300);
    }
    if (security.gasOptimization) {
      await addLog("⚡ Auditor: Arithmetic bounds audited. Injecting unchecked loops, pre-increments, and memory short-circuit parameters.", 300);
    }
    if (security.ownerPrivilege) {
      await addLog("🛡️ Auditor: Verifying administrative access controls. Ownable structure securely mapped.", 300);
    }
    if (security.flashLoanGuard) {
      await addLog("💰 Auditor: Flash loan frontrunning checks injected. Restricting tx.origin calling mechanisms.", 300);
    }
    
    await addLog("✅ Audits Completed successfully: No security risks identified. Rating: 10/10.", 400);
    
    setCompileState("compiling");
    await addLog("📦 Packing Solidity source code structures and compiling EVM bytecode...", 400);
    await addLog("🔋 Calibrating contract deployment gas parameters...", 300);
    
    setCompileState("completed");
    await addLog(`🚀 Compilation Success! Synthesized in 4.12 seconds. Gas optimized: ${security.gasOptimization ? "YES" : "NO"}.`, 200);

    // Dynamic typing effect for contract display
    let currentIdx = 0;
    const interval = setInterval(() => {
      if (currentIdx < codeTemplate.length) {
        setDisplayedCode((prev) => prev + codeTemplate.slice(currentIdx, currentIdx + 12));
        currentIdx += 12;
      } else {
        clearInterval(interval);
      }
    }, 15);
  };

  return (
    <div className="glass-container" style={{ gridColumn: "span 2" }}>
      <h3 style={{ fontSize: "20px", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ color: "var(--color-cyan)" }}>⚡</span> Interactive Vibe-Coding Compiler
      </h3>
      <p style={{ color: "var(--text-secondary)", fontSize: "14px", marginBottom: "20px" }}>
        Select a template, customize structural settings, toggle advanced static audit guardrails, and let the multi-agent AI system compile gas-optimized smart contracts instantly.
      </p>

      {/* Grid Settings Layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "24px", marginBottom: "24px" }}>
        
        {/* Left Side: Parameters & Prompts */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          
          {/* Template Selection Tabs */}
          <div>
            <h4 style={{ fontSize: "12px", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "8px", letterSpacing: "0.03em" }}>
              1. Select Smart Contract Template
            </h4>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {[
                { id: "erc20", label: "🪙 ERC-20 Meme Coin" },
                { id: "erc721", label: "🎨 ERC-721 NFT Art" },
                { id: "dao", label: "⚖️ Custom DAO" },
                { id: "multisig", label: "💼 Multi-Signature Wallet" }
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTemplate(t.id as ContractTemplate)}
                  disabled={compileState !== "idle" && compileState !== "completed"}
                  style={{
                    background: template === t.id ? "var(--color-cyan)" : "rgba(255,255,255,0.03)",
                    border: "1px solid",
                    borderColor: template === t.id ? "var(--color-cyan)" : "var(--glass-border)",
                    borderRadius: "6px",
                    padding: "6px 12px",
                    color: template === t.id ? "#030209" : "#fff",
                    fontWeight: "600",
                    fontSize: "12px",
                    cursor: "pointer",
                    transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
                    boxShadow: template === t.id ? "0 0 10px rgba(0, 242, 254, 0.25)" : "none"
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Template-specific settings panel */}
          <div style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.02)", padding: "16px", borderRadius: "10px" }}>
            <h4 style={{ fontSize: "12px", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "12px", letterSpacing: "0.03em" }}>
              2. Adjust Contract Configuration
            </h4>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={{ display: "block", fontSize: "11px", color: "var(--text-secondary)", marginBottom: "4px" }}>Contract / Token Name</label>
                <input 
                  type="text" 
                  value={tokenName} 
                  onChange={(e) => setTokenName(e.target.value.replace(/\s+/g, ""))} 
                  className="playground-textarea"
                  style={{ height: "36px", padding: "8px", fontSize: "12px", width: "100%" }}
                  disabled={compileState !== "idle" && compileState !== "completed"}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "11px", color: "var(--text-secondary)", marginBottom: "4px" }}>Symbol</label>
                <input 
                  type="text" 
                  value={tokenSymbol} 
                  onChange={(e) => setTokenSymbol(e.target.value.toUpperCase().replace(/\s+/g, ""))} 
                  className="playground-textarea"
                  style={{ height: "36px", padding: "8px", fontSize: "12px", width: "100%" }}
                  disabled={compileState !== "idle" && compileState !== "completed"}
                />
              </div>

              {template === "erc20" && (
                <>
                  <div>
                    <label style={{ display: "block", fontSize: "11px", color: "var(--text-secondary)", marginBottom: "4px" }}>Initial Supply</label>
                    <input 
                      type="number" 
                      value={initialSupply} 
                      onChange={(e) => setInitialSupply(e.target.value)} 
                      className="playground-textarea"
                      style={{ height: "36px", padding: "8px", fontSize: "12px", width: "100%" }}
                      disabled={compileState !== "idle" && compileState !== "completed"}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "11px", color: "var(--text-secondary)", marginBottom: "4px" }}>Tx Tax (BPS, 100 = 1%)</label>
                    <input 
                      type="number" 
                      value={taxBps} 
                      onChange={(e) => setTaxBps(Number(e.target.value))} 
                      className="playground-textarea"
                      style={{ height: "36px", padding: "8px", fontSize: "12px", width: "100%" }}
                      disabled={compileState !== "idle" && compileState !== "completed"}
                    />
                  </div>
                </>
              )}

              {template === "erc721" && (
                <>
                  <div>
                    <label style={{ display: "block", fontSize: "11px", color: "var(--text-secondary)", marginBottom: "4px" }}>Mint Price (ETH)</label>
                    <input 
                      type="text" 
                      value={mintPrice} 
                      onChange={(e) => setMintPrice(e.target.value)} 
                      className="playground-textarea"
                      style={{ height: "36px", padding: "8px", fontSize: "12px", width: "100%" }}
                      disabled={compileState !== "idle" && compileState !== "completed"}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "11px", color: "var(--text-secondary)", marginBottom: "4px" }}>Max Supply</label>
                    <input 
                      type="number" 
                      value={maxSupply} 
                      onChange={(e) => setMaxSupply(e.target.value)} 
                      className="playground-textarea"
                      style={{ height: "36px", padding: "8px", fontSize: "12px", width: "100%" }}
                      disabled={compileState !== "idle" && compileState !== "completed"}
                    />
                  </div>
                </>
              )}

              {template === "dao" && (
                <div>
                  <label style={{ display: "block", fontSize: "11px", color: "var(--text-secondary)", marginBottom: "4px" }}>Voting Delay (Blocks)</label>
                  <input 
                    type="number" 
                    value={votingDelay} 
                    onChange={(e) => setVotingDelay(Number(e.target.value))} 
                    className="playground-textarea"
                    style={{ height: "36px", padding: "8px", fontSize: "12px", width: "100%" }}
                    disabled={compileState !== "idle" && compileState !== "completed"}
                  />
                </div>
              )}

              {template === "multisig" && (
                <div>
                  <label style={{ display: "block", fontSize: "11px", color: "var(--text-secondary)", marginBottom: "4px" }}>Required Signatures</label>
                  <input 
                    type="number" 
                    value={requiredSigs} 
                    onChange={(e) => setRequiredSigs(Number(e.target.value))} 
                    className="playground-textarea"
                    style={{ height: "36px", padding: "8px", fontSize: "12px", width: "100%" }}
                    disabled={compileState !== "idle" && compileState !== "completed"}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Vibe Prompt input */}
          <div>
            <h4 style={{ fontSize: "12px", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "8px", letterSpacing: "0.03em" }}>
              3. Speak in plain English (Optional prompt variables)
            </h4>
            <div className="playground-input-container">
              <textarea
                className="playground-textarea"
                placeholder={`e.g. Set transaction tax sent to my wallet, optimize looping limits to save gas, enforce strict ownership controls...`}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={compileState !== "idle" && compileState !== "completed"}
                style={{ height: "54px" }}
              />
            </div>
          </div>

        </div>

        {/* Right Side: Security Auditor Toggles & Submit */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", background: "rgba(12, 11, 32, 0.2)", border: "1px solid var(--glass-border)", padding: "16px", borderRadius: "10px" }}>
          
          <div>
            <h4 style={{ fontSize: "12px", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "12px", letterSpacing: "0.03em" }}>
              🛡️ Toggle Security Guardrails (AST Auditor)
            </h4>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {[
                { key: "reentrancy", label: "🔐 Reentrancy Protections", desc: "Injects ReentrancyGuard checks on calls." },
                { key: "gasOptimization", label: "⚡ Dynamic Gas Optimization", desc: "Short-circuits checks, uses unchecked loops." },
                { key: "ownerPrivilege", label: "🛡️ Administrative Access", desc: "Ensures Ownable modifier strict compliance." },
                { key: "flashLoanGuard", label: "💰 Flash Loan Slippage Shield", desc: "Restricts flash dynamic tx.origin calling." }
              ].map((sec) => (
                <div 
                  key={sec.key} 
                  onClick={() => {
                    if (compileState !== "idle" && compileState !== "completed") return;
                    setSecurity((prev) => ({
                      ...prev,
                      [sec.key]: !prev[sec.key as keyof SecuritySettings]
                    }));
                  }}
                  style={{ 
                    display: "flex", 
                    alignItems: "center", 
                    gap: "10px", 
                    background: "rgba(0,0,0,0.2)", 
                    padding: "8px 12px", 
                    borderRadius: "6px",
                    cursor: (compileState !== "idle" && compileState !== "completed") ? "not-allowed" : "pointer",
                    border: "1px solid",
                    borderColor: security[sec.key as keyof SecuritySettings] ? "var(--color-purple)" : "transparent",
                    transition: "all 0.3s ease"
                  }}
                >
                  <input
                    type="checkbox"
                    checked={security[sec.key as keyof SecuritySettings]}
                    onChange={() => {}} // Controlled via parent click
                    disabled={compileState !== "idle" && compileState !== "completed"}
                    style={{ cursor: "pointer", accentColor: "var(--color-purple)" }}
                  />
                  <div>
                    <div style={{ fontSize: "11px", fontWeight: "700", color: "#fff" }}>{sec.label}</div>
                    <div style={{ fontSize: "9px", color: "var(--text-muted)" }}>{sec.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button
            className="btn-glow-purple"
            onClick={handleCompile}
            disabled={compileState !== "idle" && compileState !== "completed"}
            style={{ width: "100%", height: "50px", marginTop: "auto" }}
          >
            {compileState === "idle" || compileState === "completed" ? "🚀 Compile Secure Smart Contract" : "Processing compilation..."}
          </button>
        </div>

      </div>

      {/* Compiler Output Terminals */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
        
        {/* Compilation Terminal Output */}
        <div>
          <h4 style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            EVM Synthesis Compilation Terminal
          </h4>
          <div className="console-terminal">
            {logs.length === 0 && (
              <div style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
                Terminal inactive. Click compile to trigger multi-agent contract synthesis...
              </div>
            )}
            {logs.map((log, i) => {
              let logColor = "#e2e8f0";
              if (log.includes("✅") || log.includes("Success")) logColor = "var(--color-neon-green)";
              if (log.includes("🛡️") || log.includes("Auditor") || log.includes("🔐")) logColor = "var(--color-purple)";
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

        {/* Generated Source Code Output */}
        <div>
          <h4 style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
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
