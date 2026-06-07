"use client";

// JGT Staking Component
// Users stake JGT to earn rewards and get platform benefits

import React, { useState, useEffect, useCallback } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";
const JGT_TOKEN_ADDRESS = "0x7Fe2E89075F570ABcCf5451A00Bf780787FEc587";

interface StakeInfo {
  amount: string;
  stakedAt: number;
  pendingReward: string;
  active: boolean;
  unlockTime: number;
}

interface PoolInfo {
  totalStaked: string;
  rewardPool: string;
  rewardRate: number;
}

export default function JGTStaking() {
  const [stakeInfo, setStakeInfo] = useState<StakeInfo | null>(null);
  const [poolInfo, setPoolInfo] = useState<PoolInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [stakeAmount, setStakeAmount] = useState("");
  const [wallet, setWallet] = useState<string | null>(null);
  const [jgtBalance, setJgtBalance] = useState("0");
  const [actionLoading, setActionLoading] = useState(false);

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
    } catch (err) {
      console.error("Wallet connection failed:", err);
    }
  }, []);

  const fetchStakeInfo = useCallback(async () => {
    if (!wallet) return;
    try {
      const [stakeRes, poolRes] = await Promise.all([
        fetch(`${API_BASE}/api/staking/stake?wallet=${wallet}`),
        fetch(`${API_BASE}/api/staking/pool`),
      ]);
      if (stakeRes.ok) setStakeInfo(await stakeRes.json());
      if (poolRes.ok) setPoolInfo(await poolRes.json());
    } catch (err) {
      console.error("Failed to fetch staking info:", err);
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    fetchStakeInfo();
    const interval = setInterval(fetchStakeInfo, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [fetchStakeInfo]);

  const handleStake = async () => {
    if (!wallet || !stakeAmount) return;
    setActionLoading(true);
    try {
      // In production: call the staking contract via ethers.js
      // For now, show a placeholder
      alert(`Staking ${stakeAmount} JGT... (contract interaction needed)`);
      setStakeAmount("");
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnstake = async () => {
    if (!wallet) return;
    setActionLoading(true);
    try {
      alert("Unstaking JGT... (contract interaction needed)");
    } finally {
      setActionLoading(false);
    }
  };

  const handleClaimReward = async () => {
    if (!wallet) return;
    setActionLoading(true);
    try {
      alert("Claiming rewards... (contract interaction needed)");
    } finally {
      setActionLoading(false);
    }
  };

  if (!wallet) {
    return (
      <div className="glass-container" style={{ textAlign: "center", padding: "32px" }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🔒</div>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Stake JGT</h3>
        <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 20 }}>
          Connect your wallet to stake JGT and earn rewards.
        </p>
        <button onClick={connectWallet} className="btn-glow-purple">Connect Wallet</button>
      </div>
    );
  }

  if (loading) {
    return <div className="glass-container" style={{ padding: 20, color: "var(--text-muted)" }}>Loading staking info...</div>;
  }

  const lockEndTime = stakeInfo?.active ? stakeInfo.unlockTime * 1000 : 0;
  const isLocked = lockEndTime > Date.now();
  const lockRemaining = isLocked ? Math.ceil((lockEndTime - Date.now()) / 1000 / 60 / 60) : 0;

  return (
    <div className="glass-container">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: "var(--color-neon-green)" }}>🔒</span> JGT Staking
        </h3>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)" }}>
          {wallet.slice(0, 6)}...{wallet.slice(-4)}
        </span>
      </div>

      {/* Pool Stats */}
      {poolInfo && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
          <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: 12, textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase" }}>Total Staked</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--color-cyan)", marginTop: 2 }}>
              {(parseFloat(poolInfo.totalStaked) / 1e18).toFixed(1)} JGT
            </div>
          </div>
          <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: 12, textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase" }}>Reward Pool</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--color-neon-green)", marginTop: 2 }}>
              {(parseFloat(poolInfo.rewardPool) / 1e18).toFixed(1)} JGT
            </div>
          </div>
          <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: 12, textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase" }}>APY</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--color-purple)", marginTop: 2 }}>
              {poolInfo.rewardRate}%
            </div>
          </div>
        </div>
      )}

      {/* User Stake */}
      {stakeInfo?.active ? (
        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Your Stake</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "var(--color-cyan)" }}>
                {(parseFloat(stakeInfo.amount) / 1e18).toFixed(2)} JGT
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Pending Reward</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "var(--color-neon-green)" }}>
                {(parseFloat(stakeInfo.pendingReward) / 1e18).toFixed(4)} JGT
              </div>
            </div>
          </div>
          
          {isLocked && (
            <div style={{ background: "rgba(255, 193, 7, 0.1)", border: "1px solid rgba(255, 193, 7, 0.2)", borderRadius: 6, padding: "8px 12px", marginBottom: 12, fontSize: 12, color: "#ffc107" }}>
              ⏳ Locked for {lockRemaining} more hours (7-day lock period)
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleClaimReward}
              disabled={actionLoading}
              className="btn-glow-cyan"
              style={{ flex: 1, fontSize: 13, padding: "10px 16px" }}
            >
              Claim Rewards
            </button>
            <button
              onClick={handleUnstake}
              disabled={actionLoading || isLocked}
              style={{
                flex: 1,
                fontSize: 13,
                padding: "10px 16px",
                background: isLocked ? "rgba(255,255,255,0.05)" : "rgba(255, 100, 100, 0.15)",
                border: `1px solid ${isLocked ? "var(--glass-border)" : "rgba(255, 100, 100, 0.3)"}`,
                borderRadius: 8,
                color: isLocked ? "var(--text-muted)" : "#ff6464",
                cursor: isLocked ? "not-allowed" : "pointer",
                fontWeight: 600,
              }}
            >
              {isLocked ? `Locked (${lockRemaining}h)` : "Unstake"}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="number"
              value={stakeAmount}
              onChange={(e) => setStakeAmount(e.target.value)}
              placeholder="Amount to stake (min 100 JGT)"
              style={{
                flex: 1,
                background: "rgba(0,0,0,0.3)",
                border: "1px solid var(--glass-border)",
                borderRadius: 8,
                color: "var(--text-primary)",
                padding: "10px 12px",
                fontSize: 13,
                outline: "none",
              }}
            />
            <button
              onClick={handleStake}
              disabled={actionLoading || !stakeAmount || parseFloat(stakeAmount) < 100}
              className="btn-glow-purple"
              style={{ fontSize: 13, padding: "10px 20px" }}
            >
              Stake
            </button>
          </div>
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
            Minimum stake: 100 JGT. Lock period: 7 days. APY: 3%.
          </p>
        </div>
      )}

      {/* Info */}
      <div style={{ background: "rgba(0,0,0,0.1)", borderRadius: 8, padding: 12 }}>
        <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6 }}>
          <strong style={{ color: "var(--text-secondary)" }}>Staking Benefits:</strong>
          <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
            <li>Earn 3% APY on staked JGT</li>
            <li>Priority in reward claim queue</li>
            <li>Governance voting rights (coming soon)</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
