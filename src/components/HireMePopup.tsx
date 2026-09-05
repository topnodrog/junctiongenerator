"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Turnstile, { useFormVerification } from "./Turnstile";

const STORAGE_KEY = "jg_hire_popup_dismissed_at_v3";
const DISMISSAL_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://jgt-mining-api.james-gordon.workers.dev";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type State = { kind: "idle" | "loading" | "ok" | "error"; msg?: string };

export default function HireMePopup() {
  const verification = useFormVerification();
  const [visible, setVisible] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const closeButton = useRef<HTMLButtonElement>(null);
  const { reset: resetVerification } = verification;
  const close = useCallback(() => {
    resetVerification();
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
    setVisible(false);
  }, [resetVerification]);

  useEffect(() => {
    const dismissedAt = Number(localStorage.getItem(STORAGE_KEY) || 0);
    if (dismissedAt && Date.now() - dismissedAt <= DISMISSAL_COOLDOWN_MS) return;
    const timer = window.setTimeout(() => setVisible(true), 6500);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!visible) return;
    closeButton.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [visible, close]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!verification.token) return;
    const emailValue = email.trim();
    const phoneValue = phone.trim();
    if (!emailValue && !phoneValue) {
      setState({ kind: "error", msg: "Please leave an email or phone number." });
      return;
    }
    if (emailValue && !EMAIL_RE.test(emailValue)) {
      setState({ kind: "error", msg: "Please enter a valid email address." });
      return;
    }
    setState({ kind: "loading" });
    try {
      const response = await fetch(`${API_BASE}/api/hire-lead`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailValue, phone: phoneValue, turnstileToken: verification.token }),
      });
      const data: { message?: string; error?: string } = await response.json().catch(() => ({}));
      if (!response.ok) {
        setState({ kind: "error", msg: data.error || "Something went wrong. Please try again." });
        return;
      }
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
      setState({ kind: "ok", msg: data.message || "Thank you. I’ll be in touch soon." });
    } catch {
      setState({ kind: "error", msg: "Network error. Please try again in a moment." });
    } finally {
      verification.reset();
    }
  }

  if (!visible) return null;
  return (
    <div className="hire-modal-shell" role="presentation">
      <button className="hire-modal-backdrop" onClick={close} aria-label="Close hiring message" />
      <div className="hire-modal" role="dialog" aria-modal="true" aria-labelledby="hire-modal-title">
        <button ref={closeButton} className="hire-modal-close" onClick={close} aria-label="Close">×</button>
        <span className="jg-eyebrow">Work with the builder</span>
        <h2 id="hire-modal-title">Have a project that needs clarity and momentum?</h2>
        <p>I build focused websites and practical AI assistants for small businesses, founders, and people with a strong idea. Client work also keeps Junction Generator moving forward.</p>
        <div className="hire-modal-services"><span>Website design + development</span><span>Business AI assistants</span><span>Ongoing maintenance</span></div>
        {state.kind === "ok" ? (
          <div className="hire-modal-success" role="status">✓ {state.msg}</div>
        ) : (
          <form onSubmit={submit}>
            <label><span>Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" disabled={state.kind === "loading"} /></label>
            <label><span>Phone <small>optional</small></span><input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Your phone number" autoComplete="tel" disabled={state.kind === "loading"} /></label>
            <Turnstile action="hire" attempt={verification.attempt} onVerify={verification.setToken} />
            <button type="submit" className="jg-button jg-button-primary" disabled={state.kind === "loading" || !verification.token}>{state.kind === "loading" ? "Sending…" : "I’d like to talk"}</button>
          </form>
        )}
        {state.kind === "error" && <p className="hire-modal-error" role="alert">{state.msg}</p>}
        <small className="hire-modal-privacy">Your details are only used to reply about your project.</small>
      </div>
    </div>
  );
}
