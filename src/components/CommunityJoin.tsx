"use client";

import { useState } from "react";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "https://jgt-mining-api.james-gordon.workers.dev";

const INTERESTS = [
  ["builder", "Build or review code"],
  ["researcher", "Research useful-compute verification"],
  ["operator", "Prepare to run a node"],
  ["connector", "Introduce people or partners"],
  ["supporter", "Support or sponsor the work"],
] as const;

type Status = { kind: "idle" | "loading" | "ok" | "error"; message?: string };

function attribution(): Record<string, string> {
  if (typeof window === "undefined") return { source: "direct", campaign: "community-launch", referralCode: "" };
  const params = new URLSearchParams(window.location.search);
  return {
    source: params.get("utm_source") || params.get("source") || document.referrer || "direct",
    campaign: params.get("utm_campaign") || params.get("campaign") || "community-launch",
    referralCode: params.get("ref") || "",
  };
}

export default function CommunityJoin() {
  const [email, setEmail] = useState("");
  const [discordName, setDiscordName] = useState("");
  const [audienceType, setAudienceType] = useState("ai-crypto-builder");
  const [interests, setInterests] = useState<string[]>([]);
  const [consent, setConsent] = useState(true);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  function toggleInterest(value: string) {
    setInterests((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!consent || interests.length === 0) {
      setStatus({ kind: "error", message: "Choose at least one path and confirm email permission." });
      return;
    }

    setStatus({ kind: "loading" });
    try {
      const response = await fetch(`${API_BASE}/api/community/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          discordName,
          audienceType,
          interests,
          consent,
          ...attribution(),
        }),
      });
      const data: { message?: string; error?: string } = await response.json().catch(() => ({}));
      setStatus(response.ok
        ? { kind: "ok", message: data.message || "Welcome to the founding community." }
        : { kind: "error", message: data.error || "We could not save your place. Please try again." });
    } catch {
      setStatus({ kind: "error", message: "The community service is temporarily unavailable." });
    }
  }

  if (status.kind === "ok") {
    return (
      <div className="jg-form-success" role="status">
        <span>Place saved</span>
        <h2>You are in the founding community.</h2>
        <p>{status.message} Complete one action below within seven days to become an activated member.</p>
        <a className="jg-button jg-button-primary" href="#activate">Choose your first action</a>
      </div>
    );
  }

  return (
    <form className="jg-community-form" onSubmit={submit}>
      <div className="jg-form-heading">
        <span className="jg-eyebrow">Email fallback + community record</span>
        <h2>Save your place in under three minutes.</h2>
        <p>Tell us how you want to matter here. No wallet is required and participation carries no promise of financial reward.</p>
      </div>

      <div className="jg-form-row">
        <label>
          Email
          <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
        </label>
        <label>
          Discord name <small>optional</small>
          <input value={discordName} onChange={(event) => setDiscordName(event.target.value)} placeholder="@yourname" maxLength={80} />
        </label>
      </div>

      <label>
        I am joining primarily as
        <select value={audienceType} onChange={(event) => setAudienceType(event.target.value)}>
          <option value="ai-crypto-builder">AI or crypto builder</option>
          <option value="researcher">Researcher</option>
          <option value="operator">Future node operator</option>
          <option value="community">Community builder or storyteller</option>
          <option value="funder">Sponsor, grantmaker, or investor</option>
          <option value="curious">Curious explorer</option>
        </select>
      </label>

      <fieldset>
        <legend>Choose one or more paths</legend>
        <div className="jg-choice-grid">
          {INTERESTS.map(([value, label]) => (
            <label className="jg-choice" key={value}>
              <input type="checkbox" checked={interests.includes(value)} onChange={() => toggleInterest(value)} />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="jg-consent">
        <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
        <span>Email me the weekly field note, event invitations, and relevant contributor opportunities. I can unsubscribe at any time.</span>
      </label>

      <button className="jg-button jg-button-primary" disabled={status.kind === "loading"}>
        {status.kind === "loading" ? "Saving your place…" : "Join the JG Founding Community"}
      </button>
      {status.kind === "error" && <p className="jg-form-error" role="alert">{status.message}</p>}
    </form>
  );
}
