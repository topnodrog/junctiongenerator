"use client";

// Self-Serve Ad Slot Component
// Crypto projects pay to feature their ads in the attention mining section
// Payments accepted in ETH on Base network

import React, { useState, useEffect, useCallback } from "react";

// ============================================================
// CONFIGURATION
// ============================================================

const AD_PRICING = {
  PER_IMPRESSION: 0.001, // ETH per 1000 impressions
  MIN_BUDGET: 0.01, // Minimum ETH to start a campaign
  DAILY_BUDGET_MIN: 0.005, // Minimum daily budget
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

// ============================================================
// TYPES
// ============================================================

interface AdCampaign {
  id: string;
  title: string;
  description: string;
  cta: string;
  ctaUrl: string;
  sponsor: string;
  imageUrl?: string;
  budget: number; // ETH remaining
  totalBudget: number; // ETH total
  impressions: number;
  clicks: number;
  status: "active" | "paused" | "completed";
  createdAt: string;
  walletAddress: string;
}

// ============================================================
// COMPONENT
// ============================================================

export default function AdSlotManager() {
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [loading, setLoading] = useState(true);

  // Form state
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    cta: "Learn More",
    ctaUrl: "",
    sponsor: "",
    imageUrl: "",
    budget: "",
    dailyBudget: "",
  });

  // Load active campaigns
  useEffect(() => {
    fetchActiveCampaigns();
  }, []);

  const fetchActiveCampaigns = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/ads/campaigns?status=active`);
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.campaigns || []);
      }
    } catch (err) {
      console.error("Failed to fetch campaigns:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    // In production: connect wallet, sign transaction, pay ETH
    // For now, create a pending campaign
    const newCampaign: AdCampaign = {
      id: `camp-${Date.now()}`,
      title: formData.title,
      description: formData.description,
      cta: formData.cta,
      ctaUrl: formData.ctaUrl,
      sponsor: formData.sponsor,
      imageUrl: formData.imageUrl || undefined,
      budget: parseFloat(formData.budget),
      totalBudget: parseFloat(formData.budget),
      impressions: 0,
      clicks: 0,
      status: "active",
      createdAt: new Date().toISOString(),
      walletAddress: "0x...", // Would be connected wallet
    };

    setCampaigns((prev) => [newCampaign, ...prev]);
    setShowCreateForm(false);
    setFormData({
      title: "",
      description: "",
      cta: "Learn More",
      ctaUrl: "",
      sponsor: "",
      imageUrl: "",
      budget: "",
      dailyBudget: "",
    });
  };

  if (loading) {
    return <div style={{ padding: 20, color: "var(--text-muted)" }}>Loading campaigns...</div>;
  }

  return (
    <div style={{ padding: "24px 0" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h3 style={{ fontSize: 18, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "var(--color-neon-green)" }}>📢</span> Ad Slots
          </h3>
          <p style={{ color: "var(--text-secondary)", fontSize: 13, marginTop: 4 }}>
            Crypto projects pay to reach your audience. {AD_PRICING.PER_IMPRESSION} ETH per 1K impressions.
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="btn-glow-purple"
          style={{ fontSize: 13, padding: "8px 16px" }}
        >
          {showCreateForm ? "Cancel" : "Create Campaign"}
        </button>
      </div>

      {/* Create Campaign Form */}
      {showCreateForm && (
        <form
          onSubmit={handleCreateCampaign}
          style={{
            background: "rgba(155, 81, 224, 0.05)",
            border: "1px solid rgba(155, 81, 224, 0.2)",
            borderRadius: 12,
            padding: 20,
            marginBottom: 24,
          }}
        >
          <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: "var(--color-purple)" }}>
            Create Ad Campaign
          </h4>
          
          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Project Name *</label>
              <input
                type="text"
                value={formData.sponsor}
                onChange={(e) => setFormData({ ...formData, sponsor: e.target.value })}
                placeholder="e.g., MyDeFi Protocol"
                required
                style={inputStyle}
              />
            </div>
            
            <div>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Ad Title *</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g., Earn 10% APY on USDC"
                required
                style={inputStyle}
              />
            </div>
            
            <div>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Description *</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Short description of your project..."
                required
                rows={3}
                style={{ ...inputStyle, resize: "vertical" }}
              />
            </div>
            
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>CTA Text</label>
                <input
                  type="text"
                  value={formData.cta}
                  onChange={(e) => setFormData({ ...formData, cta: e.target.value })}
                  placeholder="Learn More"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Link URL *</label>
                <input
                  type="url"
                  value={formData.ctaUrl}
                  onChange={(e) => setFormData({ ...formData, ctaUrl: e.target.value })}
                  placeholder="https://yourproject.com"
                  required
                  style={inputStyle}
                />
              </div>
            </div>
            
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Total Budget (ETH) *</label>
                <input
                  type="number"
                  step="0.001"
                  min={AD_PRICING.MIN_BUDGET}
                  value={formData.budget}
                  onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
                  placeholder={`Min ${AD_PRICING.MIN_BUDGET} ETH`}
                  required
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Daily Budget (ETH)</label>
                <input
                  type="number"
                  step="0.001"
                  min={AD_PRICING.DAILY_BUDGET_MIN}
                  value={formData.dailyBudget}
                  onChange={(e) => setFormData({ ...formData, dailyBudget: e.target.value })}
                  placeholder="Optional cap"
                  style={inputStyle}
                />
              </div>
            </div>
            
            <div>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Image URL (optional)</label>
              <input
                type="url"
                value={formData.imageUrl}
                onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                placeholder="https://yourproject.com/banner.png"
                style={inputStyle}
              />
            </div>
            
            <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: 12, marginTop: 4 }}>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>Estimated Reach</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--color-cyan)" }}>
                {formData.budget ? Math.floor(parseFloat(formData.budget) / AD_PRICING.PER_IMPRESSION * 1000).toLocaleString() : "—"} impressions
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                At {AD_PRICING.PER_IMPRESSION} ETH per 1K impressions on Base network
              </div>
            </div>
            
            <button type="submit" className="btn-glow-purple" style={{ fontSize: 14, padding: "12px 24px", marginTop: 8 }}>
              Pay with ETH & Launch Campaign
            </button>
            
            <p style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "center" }}>
              Payment processed on Base network. Campaign goes live after 1 confirmation.
            </p>
          </div>
        </form>
      )}

      {/* Active Campaigns */}
      {campaigns.length === 0 ? (
        <div style={{ textAlign: "center", padding: "32px 0", color: "var(--text-muted)" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
          <p>No active campaigns. Be the first to advertise!</p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {campaigns.map((campaign) => (
            <div
              key={campaign.id}
              style={{
                background: "rgba(0,0,0,0.2)",
                border: "1px solid var(--glass-border)",
                borderRadius: 10,
                padding: 16,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{campaign.title}</span>
                    <span style={{
                      background: campaign.status === "active" ? "rgba(57, 255, 20, 0.1)" : "rgba(255, 255, 255, 0.05)",
                      color: campaign.status === "active" ? "var(--color-neon-green)" : "var(--text-muted)",
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontSize: 10,
                      fontWeight: 600,
                    }}>
                      {campaign.status.toUpperCase()}
                    </span>
                  </div>
                  <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 8 }}>{campaign.description}</p>
                  <div style={{ display: "flex", gap: 16, fontSize: 11, color: "var(--text-muted)" }}>
                    <span>Sponsor: {campaign.sponsor}</span>
                    <span>Budget: {campaign.budget.toFixed(3)} ETH</span>
                    <span>Impressions: {campaign.impressions.toLocaleString()}</span>
                    <span>Clicks: {campaign.clicks.toLocaleString()}</span>
                  </div>
                </div>
                <a
                  href={campaign.ctaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    background: "rgba(155, 81, 224, 0.15)",
                    border: "1px solid rgba(155, 81, 224, 0.3)",
                    borderRadius: 6,
                    color: "var(--color-purple)",
                    padding: "6px 12px",
                    fontSize: 12,
                    fontWeight: 600,
                    textDecoration: "none",
                    whiteSpace: "nowrap",
                  }}
                >
                  {campaign.cta}
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "rgba(0,0,0,0.3)",
  border: "1px solid var(--glass-border)",
  borderRadius: 8,
  color: "var(--text-primary)",
  padding: "10px 12px",
  fontSize: 13,
  outline: "none",
  fontFamily: "inherit",
  boxSizing: "border-box",
};
