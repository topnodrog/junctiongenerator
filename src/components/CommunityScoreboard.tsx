"use client";

import { useEffect, useState } from "react";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "https://jgt-mining-api.james-gordon.workers.dev";

type Scoreboard = {
  weekLabel: string;
  joins: number;
  activated: number;
  contributions: number;
  referralActivations: number;
  fundingReceived: number;
  fundingCommitted: number;
  experiments: string[];
  currentNeeds: string[];
};

const EMPTY: Scoreboard = {
  weekLabel: "Launch week",
  joins: 0,
  activated: 0,
  contributions: 0,
  referralActivations: 0,
  fundingReceived: 0,
  fundingCommitted: 0,
  experiments: ["Founding-community onboarding"],
  currentNeeds: ["Builders", "Researchers", "Operator candidates", "Connectors"],
};

export default function CommunityScoreboard() {
  const [data, setData] = useState<Scoreboard>(EMPTY);

  useEffect(() => {
    fetch(`${API_BASE}/api/community/scoreboard`)
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((value) => setData({ ...EMPTY, ...value }))
      .catch(() => setData(EMPTY));
  }, []);

  const activationRate = data.joins > 0 ? Math.round((data.activated / data.joins) * 100) : 0;
  const dollars = new Intl.NumberFormat("en-CA", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  return (
    <section className="jg-scoreboard" aria-labelledby="scoreboard-title">
      <div className="jg-scoreboard-heading">
        <div><span className="jg-eyebrow">Public weekly scoreboard</span><h2 id="scoreboard-title">Progress people can inspect.</h2></div>
        <span>{data.weekLabel}</span>
      </div>
      <div className="jg-score-grid">
        <div><strong>{data.joins}</strong><span>community joins</span></div>
        <div><strong>{data.activated}</strong><span>activated members / 500</span></div>
        <div><strong>{activationRate}%</strong><span>join-to-activation</span></div>
        <div><strong>{data.contributions}</strong><span>contributions</span></div>
        <div><strong>{data.referralActivations}</strong><span>referral activations</span></div>
        <div><strong>{dollars.format(data.fundingReceived + data.fundingCommitted)}</strong><span>received + committed / $25k</span></div>
      </div>
      <div className="jg-score-notes">
        <div><b>Experiment</b><p>{data.experiments.join(" · ")}</p></div>
        <div><b>Needed now</b><p>{data.currentNeeds.join(" · ")}</p></div>
      </div>
      <p className="jg-score-disclaimer">Only received cash and signed commitments count. Meetings, verbal interest, token speculation, and uncommitted pledges do not.</p>
    </section>
  );
}
