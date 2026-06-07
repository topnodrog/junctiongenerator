"use client";

// Airdrop + Buy JGT + Donation Component
// Combines airdrop registration, JGT purchase, and donation info

import React, { useState, useEffect, useCallback } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";
const DEPLOYER_ADDRESS = "0x5f89d06E0D4dBe3C125a49FD9213624aD8a991d4";
const JGT_TOKEN_ADDRESS="0x7F...t = {
  wallet: "",
  email: "",
};

export default function JGTRevenueHub() {
  const [activeTab, setActiveTab] = useState<"airdrop" | "buy" | "donate">("airdrop");
  const [wallet, setWallet] = useState<string | null>(null);
  const [airdropForm, setAirdropForm] = useState({ wallet: "", email: "" });
  const [buyAmount, setBuyAmount] = useState("");
  const [airdropStatus, setAirdropStatus] = useState<any>(null);
  const [totalRegistered, setTotalRegistered] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const connectWallet = useCallback(async () => {
    if (typeof window === "undefined") return;
    const eth = (window as any).ethereum;
    if (!eth) {
      alert("Please install MetaMask or another Web3 wallet");
      return;
    }
    try {
      const accounts = await eth.request({ method: "eth_requestAccounts" });
      setWallet(accounts[0]);
      setAirdropForm(prev => ({ ...prev, wallet: accounts[0] }));
    } catch (err) {
      console.error("Wallet connection failed:", err);
    }
  }, []);

  // Check airdrop status on wallet connect
  useEffect(() => {
    if (wallet) {
      checkAirdropStatus(wallet);
    }
  }, [wallet]);

  const checkAirdropStatus = async (walletAddr: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/airdrop/status?wallet=${walletAddr}`);
      if (res.ok) setAirdropStatus(await res.json());
    } catch (err) {
      console.error("Failed to check airdrop status:", err);
    }
  };

  const handleAirdropRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!airdropForm.wallet || !airdropForm.email) return;
    
    setLoading(true);
    setMessage(null);
    
    try {
      const res = await fetch(`${API_BASE}/api/airdrop/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: airdropForm.wallet,
          email: airdropForm.email,
        }),
      });
      
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: `Registered! ${data.totalRegistered} people on the list.` });
        setTotalRegistered(data.totalRegistered);
        checkAirdropStatus(airdropForm.wallet);
      } else {
        setMessage({ type: "error", text: data.error || "Registration failed" });
      }
    } catch (err) {
      setMessage({ type: "error", text: "Registration failed. Try again." });
    } finally {
      setLoading(false);
    }
  };

  const handleBuyJgt = async () => {
    if (!wallet || !buyAmount) return;
    
    const ethAmount = parseFloat(buyAmount);
    if (ethAmount < 0.001 || ethAmount > 10) {
      setMessage({ type: "error", text: "Amount must be between 0.001 and 10 ETH" });
      return;
    }

    const jgtAmount = Math.floor(ethAmount * 10000);
    
    setMessage({ type: "success", text: `Ready to buy ${jgtAmount.toLocaleString()} JGT for ${buyAmount} ETH. Confirm in your wallet.` });
    
    try {
      const eth = (window as any).ethereum;
      if (!eth) {
        setMessage({ type: "error", text: "Please connect a Web3 wallet" });
        return;
      }
      
      // In production: call the JGTMarket contract's buy() function
      // For now, show instructions
      alert(`To buy JGT:\n\n1. Send ${buyAmount} ETH to the JGT Market contract\n2. You'll receive ${jgtAmount.toLocaleString()} JGT\n\nContract deployment pending. Coming soon!`);
    } catch (err) {
      setMessage({ type: "error", text: "Transaction failed" });
    }
  };

  const copyAddress = (addr: string) => {
    navigator.clipboard.writeText(addr);
    setMessage({ type: "success", text: "Address copied!" });
  };

  const jgtAmount = buyAmount ? Math.floor(parseFloat(buyAmount) * 10000).toLocaleString() : "—";

  return (
    <div className="glass-container">
      {/* Tab Navigation */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 4 }}>
        {[
          { key: "airdrop" as const, label: "🪂 Airdrop", },
          { key: "buy" as const, label: "💰 Buy JGT" },
          { key: "donate" as const, label: "❤️ Donate" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              flex: 1,
              padding: "10px 16px",
              borderRadius: 8,
              border: "none",
              background: activeTab === tab.key ? "rgba(155, 81, 224, 0.3)" : "transparent",
              color: activeTab === tab.key ? "var(--color-purple)" : "var(--text-muted)",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
              transition: "all 0.2s",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Message */}
      {message && (
        <div
          style={{
            background: message.type === "success" ? "rgba(57, 255, 20, 0.1)" : "rgba(255, 100, 100, 0.1)",
            border: `1px solid ${message.type === "success" ? "rgba(57, 255, 20, 0.3)" : "rgba(255, 100, 100, 0.3)"}`,
            borderRadius: 8,
            padding: "10px 14px",
            marginBottom: 16,
            fontSize: 13,
            color: message.type === "success" ? "var(--color-neon-green)" : "#ff6464",
          }}
        >
          {message.text}
        </div>
      )}

      {/* AIRDROP TAB */}
      {activeTab === "airdrop" && (
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>🪂 JGT Airdrop Registration</h3>
          <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 16 }}>
            Register your wallet and email to receive free JGT tokens when we launch the airdrop. Early registrants get a bonus multiplier.
          </p>

          {airdropStatus?.registered ? (
            <div style={{ background: "rgba(57, 255, 20, 0.05)", border: "1px solid rgba(57, 255, 20, 0.2)", borderRadius: 10, padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 24 }}>✅</span>
                <div>
                  <div style={{ fontWeight: 700, color: "var(--color-neon-green)" }}>You're registered!</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    Wallet: {airdropStatus.walletAddress.slice(0, 6)}...{airdropStatus.walletAddress.slice(-4)}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                Registered at: {new Date(airdropStatus.registeredAt).toLocaleString()}
              </div>
            </div>
          ) : (
            <form onSubmit={handleAirdropRegister}>
              <div style={{ display: "grid", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Wallet Address (Base)</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      type="text"
                      value={airdropForm.wallet}
                      onChange={(e) => setAirdropForm({ ...airdropForm, wallet: e.target.value })}
                      placeholder="0x..."
                      required
                      style={{
                        flex: 1, background: "rgba(0,0,0,0.3)", border: "1px solid var(--glass-border)",
                        borderRadius: 8, color: "var(--text-primary)", padding: "10px 12px", fontSize: 13, outline: "none",
                        fontFamily: "var(--font-mono)",
                      }}
                    />
                    {!wallet && (
                      <button type="button" onClick={connectWallet} className="btn-glow-purple" style={{ fontSize: 12, padding: "8px 14px", whiteSpace: "nowrap" }}>
                        Connect
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Email Address</label>
                  <input
                    type="email"
                    value={airdropForm.email}
                    onChange={(e) => setAirdropForm({ ...airdropForm, email: e.target.value })}
                    placeholder="you@example.com"
                    required
                    style={{
                      width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid var(--glass-border)",
                      borderRadius: 8, color: "var(--text-primary)", padding: "10px 12px", fontSize: 13, outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-glow-purple"
                  style={{ fontSize: 14, padding: "12px 24px" }}
                >
                  {loading ? "Registering..." : "Register for Airdrop"}
                </button>
              </div>
            </form>
          )}

          {totalRegistered > 0 && (
            <div style={{ marginTop: 12, textAlign: "center", fontSize: 12, color: "var(--text-muted)" }}>
              {totalRegistered.toLocaleString()} people registered
            </div>
          )}
        </div>
      )}

      {/* BUY TAB */}
      {activeTab === "buy" && (
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>💰 Buy JGT</h3>
          <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 16 }}>
            Purchase JGT tokens directly. 1 ETH = 10,000 JGT. Minimum 0.001 ETH.
          </p>

          {!wallet ? (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <p style={{ color: "var(--text-muted)", marginBottom: 12 }}>Connect your wallet to buy JGT</p>
              <button onClick={connectWallet} className="btn-glow-purple">Connect Wallet</button>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>ETH Amount</label>
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  max="10"
                  value={buyAmount}
                  onChange={(e) => setBuyAmount(e.target.value)}
                  placeholder="0.01"
                  style={{
                    width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid var(--glass-border)",
                    borderRadius: 8, color: "var(--text-primary)", padding: "10px 12px", fontSize: 16, outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: 14, textAlign: "center" }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>You receive</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: "var(--color-neon-green)" }}>
                  {jgtAmount} <span style={{ fontSize: 14, color: "var(--text-secondary)" }}>JGT</span>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                  Rate: 1 ETH = 10,000 JGT
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[0.001, 0.01, 0.05, 0.1, 0.5, 1].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setBuyAmount(amt.toString())}
                    style={{
                      background: buyAmount === amt.toString() ? "rgba(155, 81, 224, 0.3)" : "rgba(255,255,255,0.05)",
                      border: `1px solid ${buyAmount === amt.toString() ? "var(--color-purple)" : "var(--glass-border)"}`,
                      borderRadius: 6,
                      color: buyAmount === amt.toString() ? "var(--color-purple)" : "var(--text-secondary)",
                      padding: "6px 12px",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {amt} ETH
                  </button>
                ))}
              </div>

              <button
                onClick={handleBuyJgt}
                disabled={!buyAmount || parseFloat(buyAmount) < 0.001}
                className="btn-glow-cyan"
                style={{ fontSize: 14, padding: "12px 24px" }}
              >
                Buy JGT with ETH
              </button>

              <p style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "center" }}>
                Gas fees are covered by the buyer. Contract deployment coming soon.
              </p>
            </div>
          )}
        </div>
      )}

      {/* DONATE TAB */}
      {activeTab === "donate" && (
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>❤️ Support the Project</h3>
          <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 16 }}>
            Donations help fund development, marketing, and ecosystem growth. All donations go directly to the project treasury on Base.
          </p>

          <div style={{ display: "grid", gap: 12}>
            <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 16 }}>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 8 }}>Donation Address (Base)</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <code style={{
                  flex: 1, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--color-cyan)",
                  background: "rgba(0,0,0,0.3)", padding: "8px 12px", borderRadius: 6, wordBreak: "break-all",
                }}>
                  {DEPLOYER_ADDRESS}
                </code>
                <button
                  onClick={() => copyAddress(DEPLOYER_ADDRESS)}
                  style={{
                    background: "rgba(0, 242, 254, 0.1)", border: "1px solid rgba(0, 242, 254, 0.3)",
                    borderRadius: 6, color: "var(--color-cyan)", padding: "8px 12px",
                    cursor: "pointer", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
                  }}
                >
                  Copy
                </button>
              </div>
            </div>

            <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 16 }}>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 8 }}>JGT Token Contract</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <code style={{
                  flex: 1, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--color-purple)",
                  background: "rgba(0,0,0,0.3)", padding: "8px 12px", borderRadius: 6, wordBreak: "break-all",
                }}>
                  {JGT_TOKEN_ADDRESS}
                </code>
                <button
                  onClick={() => copyAddress(JGT_TOKEN_ADDRESS)}
                  style={{
                    background: "rgba(155, 81, 224, 0.1)", border: "1px solid rgba(155, 81, 224, 0.3)",
                    borderRadius: 6, color: "var(--color-purple)", padding: "8px 12px",
                    cursor: "pointer", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
                  }}
                >
                  Copy
                </button>
              </div>
            </div>

            <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 16 }}>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 8 }}>Scan to Donate</div>
              <div style={{ textAlign: "center" }}>
                <div style={{
                  width: 120, height: 120, background: "white", borderRadius: 12, margin: "0 auto",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <span style={{ fontSize: 48 }}>📱</span>
                </div>
                <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
                  Scan with any Base-compatible wallet
                </p>
              </div>
            </div>

            <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", lineHeight: 1.6 }}>
              Accepting: ETH on Base, USDC on Base<br/>
              All funds go directly to the project treasury
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
