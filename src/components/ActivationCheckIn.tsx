"use client";

import { useState } from "react";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "https://jgt-mining-api.james-gordon.workers.dev";

const ACTIONS = [
  ["introduction", "Introduced myself and selected an interest"],
  ["event", "Attended a Weekly Junction"],
  ["technical", "Reviewed, tested, or discussed a technical artifact"],
  ["share", "Shared a tracked invitation"],
  ["offer", "Offered a skill, introduction, sponsorship, or funding"],
] as const;

export default function ActivationCheckIn() {
  const [email, setEmail] = useState("");
  const [action, setAction] = useState("introduction");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("loading");
    try {
      const response = await fetch(`${API_BASE}/api/community/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, action, note }),
      });
      const data: { message?: string; error?: string } = await response.json().catch(() => ({}));
      setMessage(data.message || data.error || "We could not record that action.");
      setStatus(response.ok ? "ok" : "error");
    } catch {
      setMessage("The community service is temporarily unavailable.");
      setStatus("error");
    }
  }

  return (
    <form className="jg-activation-form" onSubmit={submit}>
      <h3>Record your first meaningful action</h3>
      <p>This is the step that counts you as activated—not simply joining a list.</p>
      <label>Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label>
        Completed action
        <select value={action} onChange={(event) => setAction(event.target.value)}>
          {ACTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label>Optional note<input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder="Link or one sentence of context" /></label>
      <button className="jg-button jg-button-secondary" disabled={status === "loading"}>
        {status === "loading" ? "Recording…" : "Record my action"}
      </button>
      {(status === "ok" || status === "error") && <p className={status === "ok" ? "jg-form-ok" : "jg-form-error"} role="status">{message}</p>}
    </form>
  );
}
