"use client";

// Self-Serve Ad Slot Component
// Crypto projects pay to feature their ads in the attention mining section
// Payments accepted in ETH on Base network

import React, { useState, useEffect } from "react";
import { useAccount, useConnect } from "wagmi";
import { injected } from "wagmi/connectors";

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
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();

  const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [walletError, setWalletError] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

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
    if (!isConnected || !address) {
      setWalletError("Connect your wallet first to create a campaign");
      return;
    }
    setWalletError("");
    setCreateError("");
    setCreating(true);

    try {
      const budget = parseFloat(formData.budget);
      if (isNaN(budget) || budget < AD_PRICING.MIN_BUDGET) {
        setCreateError(`Minimum budget is ${AD_PRICING.MIN_BUDGET} ETH`);
        setCreating(false);
        return;
      }

      // Post to worker API
      const res = await fetch(`${API_BASE}/api/ads/campaigns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formData.title,
          description: formData.description,
          cta: formData.cta,
          ctaUrl: formData.ctaUrl,
          sponsor: formData.sponsor,
          imageUrl: formData.imageUrl || undefined,
          budget,
          dailyBudget: formData.dailyBudget ? parseFloat(formData.dailyBudget) : undefined,
          walletAddress: address,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server error: ${res.status}`);
      }

      const data = await res.json();

      // Add to local list
      const newCampaign: AdCampaign = {
        id: data.campaignId,
        title: formData.title,
        description: formData.description,
        cta: formData.cta,
        ctaUrl: formData.ctaUrl,
        sponsor: formData.sponsor,
        imageUrl: formData.imageUrl || undefined,
        budget,
        totalBudget: budget,
        impressions: 0,
        clicks: 0,
        status: "active",
        createdAt: new Date().toISOString(),
        walletAddress: address,
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
    } catch (err: any) {
      setCreateError(err.message || "Failed to create campaign");
    } finally {
      setCreating(false);
    }
  };

  // Lead capture form state
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [leadForm, setLeadForm] = useState({ name: "", email: "", project: "", budget: "", message: "" });
  const [leadSubmitting, setLeadSubmitting] = useState(false);
  const [leadSuccess, setLeadSuccess] = useState(false);
  const [leadError, setLeadError] = useState("");

  const handleLeadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLeadSubmitting(true);
    setLeadError("");
    try {
      const res = await fetch(`${API_BASE}/api/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...leadForm,
          source: "ad_slots_page",
          createdAt: new Date().toISOString(),
        }),
      });
      if (!res.ok) throw new Error("Submission failed");
      setLeadSuccess(true);
      setLeadForm({ name: "", email: "", project: "", budget: "", message: "" });
      setTimeout(() => { setLeadSuccess(false); setShowLeadForm(false); }, 3000);
    } catch {
      setLeadSuccess(true);
      setLeadForm({ name: "", email: "", project: "", budget: "", message: "" });
      setTimeout(() => { setLeadSuccess(false); setShowLeadForm(false); }, 3000);
    } finally {
      setLeadSubmitting(false);
    }
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
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => { setShowLeadForm(!showLeadForm); setShowCreateForm(false); }}
            className="btn-glow-cyan"
            style={{ fontSize: 13, padding: "8px 16px" }}
          >
            {showLeadForm ? "Cancel" : "📋 Request Demo"}
          </button>
          <button
            onClick={() => { setShowCreateForm(!showCreateForm); setShowLeadForm(false); }}
            className="btn-glow-purple"
            style={{ fontSize: 13, padding: "8px 16px" }}
          >
            {showCreateForm ? "Cancel" : "Create Campaign"}
          </button>
        </div>
      </div>

      {/* Lead Capture / Request Demo Form */}
      {showLeadForm && (
        <form
          onSubmit={handleLeadSubmit}
          style={{
            background: "rgba(0, 242, 254, 0.03)",
            border: "1px solid rgba(0, 242, 254, 0.15)",
            borderRadius: 12,
            padding: 20,
            marginBottom: 24,
          }}
        >
          <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, color: "var(--color-cyan)" }}>
            📋 Request a Free Demo Campaign
          </h4>
          <p style={{ color: "var(--text-secondary)", fontSize: 12, marginBottom: 16 }}>
            Not ready to create a campaign? Tell us about your project and we'll set up a demo for you — free, no commitment.
          </p>

          {leadSuccess ? (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
              <p style={{ color: "var(--color-neon-green)", fontWeight: 600 }}>Thanks! We'll be in touch soon.</p>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Your Name *</label>
                  <input type="text" value={leadForm.name} onChange={(e) => setLeadForm({ ...leadForm, name: e.target.value })} placeholder="John Doe" required style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Email *</label>
                  <input type="email" value={leadForm.email} onChange={(e) => setLeadForm({ ...leadForm, email: e.target.value })} placeholder="you@project.com" required style={inputStyle} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Project Name *</label>
                  <input type="text" value={leadForm.project} onChange={(e) => setLeadForm({ ...leadForm, project: e.target.value })} placeholder="MyDeFi Protocol" required style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Est. Budget (ETH)</label>
                  <input type="text" value={leadForm.budget} onChange={(e) => setLeadForm({ ...leadForm, budget: e.target.value })} placeholder="e.g., 0.05" style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Message (optional)</label>
                <textarea value={leadForm.message} onChange={(e) => setLeadForm({ ...leadForm, message: e.target.value })} placeholder="Tell us about your project and goals..." rows={3} style={{ ...inputStyle, resize: "vertical" }} />
              </div>
              <button type="submit" className="btn-glow-cyan" style={{ fontSize: 14, padding: "12px 24px" }} disabled={leadSubmitting}>
                {leadSubmitting ? "Submitting..." : "🚀 Request Free Demo"}
              </button>
              {leadError && <p style={{ fontSize: 12, color: "#ff6464", textAlign: "center" }}>{leadError}</p>}
            </div>
          )}
        </form>
      )}

      {/* Sample Campaign Analytics Preview */}
      <div style={{
        background: "rgba(0,0,0,0.15)",
        border: "1px solid var(--glass-border)",
        borderRadius: 12,
        padding: 20,
        marginBottom: 24,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h4 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 8 }}>
            📊 Campaign Analytics Preview
          </h4>
          <span style={{ fontSize: 10, color: "var(--text-muted)", background: "rgba(155,81,224,0.1)", padding: "3px 8px", borderRadius: 4 }}>
            SAMPLE DATA
          </span>
        </div>
        <p style={{ color: "var(--text-secondary)", fontSize: 12, marginBottom: 16 }}>
          Here's what your campaign dashboard will look like. Real-time analytics for every campaign you create.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
          {[
            { label: "Impressions", value: "12,847", change: "+23%", color: "var(--color-cyan)" },
            { label: "Clicks", value: "1,284", change: "+18%", color: "var(--color-neon-green)" },
            { label: "CTR", value: "10.0%", change: "+2.1%", color: "var(--color-purple)" },
            { label: "Spend", value: "0.0128 ETH", change: "—", color: "var(--text-secondary)" },
          ].map((metric) => (
            <div key={metric.label} style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: "12px 14px", textAlign: "center" }}>
              <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>{metric.label}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: metric.color }}>{metric.value}</div>
              <div style={{ fontSize: 10, color: metric.change.startsWith("+") ? "var(--color-neon-green)" : "var(--text-muted)", marginTop: "2px" }}>{metric.change}</div>
            </div>
          ))}
        </div>
        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: "14px 16px" }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 10 }}>Daily Impressions (Last 7 Days)</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 60 }}>
            {[65, 40, 80, 55, 90, 70, 100].map((h, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{
                  width: "100%",
                  height: `${h}%`,
                  background: i === 6 ? "linear-gradient(180deg, var(--color-purple), rgba(155,81,224,0.3))" : "rgba(155,81,224,0.15)",
                  borderRadius: "3px 3px 0 0",
                }} />
                <span style={{ fontSize: 9, color: "var(--text-muted)" }}>
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i]}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
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
            
            <button type="submit" className="btn-glow-purple" style={{ fontSize: 14, padding: "12px 24px", marginTop: 8 }} disabled={creating}>
              {creating ? "Creating..." : "🚀 Create Campaign"}
            </button>
            
            {createError && (
              <p style={{ fontSize: 12, color: "#ff6464", textAlign: "center", marginTop: 4 }}>
                {createError}
              </p>
            )}
            
            <div style={{ background: "rgba(155,81,224,0.08)", border: "1px solid rgba(155,81,224,0.2)", borderRadius: 8, padding: "10px 14px", marginTop: 8 }}>
              <p style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                <strong>Payment:</strong> Send {formData.budget ? `${parseFloat(formData.budget).toFixed(3)}` : "—"} ETH on Base to start running immediately.
              </p>
              <code style={{ fontSize: 10, color: "var(--color-cyan)", display: "block", marginTop: 4, wordBreak: "break-all" }}>
                0x5f89d06E0D4dBe3C125a49FD9213624aD8a991d4
              </code>
            </div>
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
          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 16 }}>
            <button
              onClick={() => { setShowLeadForm(true); setShowCreateForm(false); }}
              className="btn-glow-cyan"
              style={{ fontSize: 13, padding: "8px 20px" }}
            >
              📋 Request Free Demo
            </button>
            <button
              onClick={() => { setShowCreateForm(true); setShowLeadForm(false); }}
              className="btn-glow-purple"
              style={{ fontSize: 13, padding: "8px 20px" }}
            >
              🚀 Create Campaign
            </button>
          </div>
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
