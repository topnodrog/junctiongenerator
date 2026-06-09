"use client";

import React, { useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";
const DEPLOYER_ADDRESS = "0x5f89d06E0D4dBe3C125a49FD9213624aD8a991d4";
const JGT_TOKEN_ADDRESS = "0x7Fe2E89075F570ABcCf5451A00Bf780787FEc587";

export default function JGTRevenueHub() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();

  const [activeTab, setActiveTab] = useState<"airdrop" | "buy" | "donate">("airdrop");
  const [airdropForm, setAirdropForm] = useState({ wallet: "", email: "" });
  const [buyAmount, setBuyAmount] = useState("");
  const [airdropStatus, setAirdropStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const handleConnect = () => {
    connect({ connector: injected() });
  };

  const checkAirdrop = async () => {
    if (!address) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/airdrop/status?wallet=${address}`);
      const data = await res.json();
      setAirdropStatus(data);
    } catch {
      setAirdropStatus({ error: "API unavailable" });
    }
    setLoading(false);
  };

  const registerAirdrop = async () => {
    if (!address) {
      setMsg("Connect wallet first");
      return;
    }
    setLoading(true);
    setMsg("");
    try {
      const res = await fetch(`${API_BASE}/api/airdrop/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: address, email: airdropForm.email }),
      });
      const data = await res.json();
      setMsg(data.message || "Registered!");
      checkAirdrop();
    } catch {
      setMsg("Registration failed");
    }
    setLoading(false);
  };

  const copyAddress = (addr: string) => {
    navigator.clipboard.writeText(addr);
  };

  return (
    <div style={{ background: "var(--glass-bg)", border: "1px solid var(--glass-border)", borderRadius: 16, padding: 24 }}>
      <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>💰 JGT Revenue Hub</h2>
      <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 16 }}>
        Register for airdrops, buy JGT, or support the project
      </p>

      {/* Wallet Status */}
      <div style={{ marginBottom: 16, padding: 12, background: "rgba(0,0,0,0.2)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          {isConnected ? (
            <span style={{ color: "var(--color-cyan)", fontSize: 13 }}>
              ✓ Connected: {address?.slice(0, 6)}...{address?.slice(-4)}
            </span>
          ) : (
            <span style={{ color: "var(--text-muted)", fontSize: 13 }}>No wallet connected</span>
          )}
        </div>
        {isConnected ? (
          <button onClick={() => disconnect()} style={{ background: "rgba(255,100,100,0.1)", border: "1px solid rgba(255,100,100,0.3)", color: "#ff6464", padding: "4px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>
            Disconnect
          </button>
        ) : (
          <button onClick={handleConnect} className="btn-glow-cyan" style={{ padding: "6px 16px", fontSize: 13 }}>
            Connect Wallet
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {(["airdrop", "buy", "donate"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "6px 16px", borderRadius: 8, fontSize: 13, cursor: "pointer",
              background: activeTab === tab ? "rgba(155,81,224,0.2)" : "rgba(0,0,0,0.2)",
              border: activeTab === tab ? "1px solid rgba(155,81,224,0.4)" : "1px solid transparent",
              color: activeTab === tab ? "var(--color-purple)" : "var(--text-secondary)",
            }}
          >
            {tab === "airdrop" ? "🪂 Airdrop" : tab === "buy" ? "💰 Buy JGT" : "❤️ Donate"}
          </button>
        ))}
      </div>

      {/* Airdrop Tab */}
      {activeTab === "airdrop" && (
        <div>
          <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 12 }}>
            Register your wallet for the JGT airdrop. One registration per wallet.
          </p>
          <div style={{ display: "grid", gap: 12 }}>
            <input
              type="email"
              placeholder="Email (optional)"
              value={airdropForm.email}
              onChange={(e) => setAirdropForm({ ...airdropForm, email: e.target.value })}
              style={{ background: "rgba(0,0,0,0.3)", border: "1px solid var(--glass-border)", borderRadius: 8, padding: "10px 14px", color: "var(--text-primary)", fontSize: 14 }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={registerAirdrop} disabled={loading} className="btn-glow-purple" style={{ padding: "8px 20px", fontSize: 13, opacity: loading ? 0.5 : 1 }}>
                {loading ? "..." : "Register for Airdrop"}
              </button>
              <button onClick={checkAirdrop} disabled={loading || !isConnected} style={{ padding: "8px 20px", fontSize: 13, background: "rgba(0,0,0,0.3)", border: "1px solid var(--glass-border)", borderRadius: 8, color: "var(--text-secondary)", cursor: "pointer" }}>
                Check Status
              </button>
            </div>
            {msg && <p style={{ fontSize: 13, color: msg.includes("failed") || msg.includes("Connect") ? "#ff6464" : "var(--color-cyan)" }}>{msg}</p>}
            {airdropStatus && (
              <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: 12, fontSize: 13 }}>
                <pre style={{ margin: 0, color: "var(--text-secondary)" }}>{JSON.stringify(airdropStatus, null, 2)}</pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Buy Tab */}
      {activeTab === "buy" && (
        <div>
          <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 12 }}>
            Buy JGT with ETH on Base. Rate: 1 ETH = 10,000 JGT.
          </p>
          <div style={{ display: "grid", gap: 12 }}>
            <input
              type="number"
              placeholder="ETH amount (min 0.001)"
              value={buyAmount}
              onChange={(e) => setBuyAmount(e.target.value)}
              style={{ background: "rgba(0,0,0,0.3)", border: "1px solid var(--glass-border)", borderRadius: 8, padding: "10px 14px", color: "var(--text-primary)", fontSize: 14 }}
            />
            <button disabled={!isConnected || !buyAmount} className="btn-glow-purple" style={{ padding: "8px 20px", fontSize: 13, opacity: !isConnected || !buyAmount ? 0.5 : 1 }}>
              {!isConnected ? "Connect Wallet First" : "Buy JGT"}
            </button>
            <p style={{ fontSize: 11, color: "var(--text-muted)" }}>
              JGT Token: <code style={{ color: "var(--color-cyan)" }}>{JGT_TOKEN_ADDRESS}</code>
            </p>
          </div>
        </div>
      )}

      {/* Donate Tab */}
      {activeTab === "donate" && (
        <div>
          <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 12 }}>
            Support the project with donations on any chain. All funds go to the project treasury.
          </p>
          <div style={{ display: "grid", gap: 12 }}>
            {/* Ethereum */}
            <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 18 }}>⟠</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>Ethereum</span>
                <span style={{ fontSize: 11, color: "var(--text-muted)", background: "rgba(98,126,234,0.1)", padding: "2px 8px", borderRadius: 4 }}>ETH</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <code style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-cyan)", background: "rgba(0,0,0,0.3)", padding: "8px 12px", borderRadius: 6, wordBreak: "break-all" }}>
                  0x5f89d06E0D4dBe3C125a49FD9213624aD8a991d4
                </code>
                <button onClick={() => copyAddress("0x5f89d06E0D4dBe3C125a49FD9213624aD8a991d4")} style={{ background: "rgba(98,126,234,0.1)", border: "1px solid rgba(98,126,234,0.3)", color: "#627eea", padding: "6px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>
                  Copy
                </button>
              </div>
            </div>

            {/* Base */}
            <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 18 }}>🔵</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>Base</span>
                <span style={{ fontSize: 11, color: "var(--text-muted)", background: "rgba(0,82,255,0.1)", padding: "2px 8px", borderRadius: 4 }}>ETH</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <code style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-cyan)", background: "rgba(0,0,0,0.3)", padding: "8px 12px", borderRadius: 6, wordBreak: "break-all" }}>
                  0x5f89d06E0D4dBe3C125a49FD9213624aD8a991d4
                </code>
                <button onClick={() => copyAddress("0x5f89d06E0D4dBe3C125a49FD9213624aD8a991d4")} style={{ background: "rgba(0,82,255,0.1)", border: "1px solid rgba(0,82,255,0.3)", color: "#0052ff", padding: "6px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>
                  Copy
                </button>
              </div>
            </div>

            {/* Solana */}
            <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 18 }}>◎</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>Solana</span>
                <span style={{ fontSize: 11, color: "var(--text-muted)", background: "rgba(20,241,149,0.1)", padding: "2px 8px", borderRadius: 4 }}>SOL</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <code style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-cyan)", background: "rgba(0,0,0,0.3)", padding: "8px 12px", borderRadius: 6, wordBreak: "break-all" }}>
                  EdkwpSGx9kBTNYiR3Zny6iApQuwTpUxm86bzgRK8y2sH
                </code>
                <button onClick={() => copyAddress("EdkwpSGx9kBTNYiR3Zny6iApQuwTpUxm86bzgRK8y2sH")} style={{ background: "rgba(20,241,149,0.1)", border: "1px solid rgba(20,241,149,0.3)", color: "#14f195", padding: "6px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>
                  Copy
                </button>
              </div>
            </div>

            {/* Tron */}
            <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 18 }}>🔴</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>Tron</span>
                <span style={{ fontSize: 11, color: "var(--text-muted)", background: "rgba(255,0,0,0.1)", padding: "2px 8px", borderRadius: 4 }}>TRX</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <code style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-cyan)", background: "rgba(0,0,0,0.3)", padding: "8px 12px", borderRadius: 6, wordBreak: "break-all" }}>
                  TC1c88s6PujsXXgAfqD6x9xHfgSKtjKbRL
                </code>
                <button onClick={() => copyAddress("TC1c88s6PujsXXgAfqD6x9xHfgSKtjKbRL")} style={{ background: "rgba(255,0,0,0.1)", border: "1px solid rgba(255,0,0,0.3)", color: "#ff0013", padding: "6px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>
                  Copy
                </button>
              </div>
            </div>

            {/* Bitcoin */}
            <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 18 }}>₿</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>Bitcoin</span>
                <span style={{ fontSize: 11, color: "var(--text-muted)", background: "rgba(247,147,26,0.1)", padding: "2px 8px", borderRadius: 4 }}>BTC</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <code style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-cyan)", background: "rgba(0,0,0,0.3)", padding: "8px 12px", borderRadius: 6, wordBreak: "break-all" }}>
                  bc1qgvjp0ng2ex2hswuw58d68g9rkkk5qp2h766qf3
                </code>
                <button onClick={() => copyAddress("bc1qgvjp0ng2ex2hswuw58d68g9rkkk5qp2h766qf3")} style={{ background: "rgba(247,147,26,0.1)", border: "1px solid rgba(247,147,26,0.3)", color: "#f7931a", padding: "6px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>
                  Copy
                </button>
              </div>
            </div>

            {/* JGT Token on Base */}
            <div style={{ background: "rgba(155,81,224,0.05)", border: "1px solid rgba(155,81,224,0.2)", borderRadius: 10, padding: 16, marginTop: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 18 }}>🟣</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>JGT Token (Base)</span>
                <span style={{ fontSize: 11, color: "var(--text-muted)", background: "rgba(155,81,224,0.1)", padding: "2px 8px", borderRadius: 4 }}>ERC-20</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <code style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-cyan)", background: "rgba(0,0,0,0.3)", padding: "8px 12px", borderRadius: 6, wordBreak: "break-all" }}>
                  {JGT_TOKEN_ADDRESS}
                </code>
                <button onClick={() => copyAddress(JGT_TOKEN_ADDRESS)} style={{ background: "rgba(155,81,224,0.1)", border: "1px solid rgba(155,81,224,0.3)", color: "var(--color-purple)", padding: "6px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>
                  Copy
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
