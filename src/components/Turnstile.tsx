"use client";

import Script from "next/script";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

export const SecurityContext = createContext({ nonce: "", siteKey: "" });

type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
declare global { interface Window { turnstile?: TurnstileApi } }

export function SecurityProvider({ nonce, siteKey, children }: {
  nonce: string; siteKey: string; children: React.ReactNode;
}) {
  return <SecurityContext.Provider value={{ nonce, siteKey }}>{children}</SecurityContext.Provider>;
}

export function useFormVerification() {
  const [token, setToken] = useState("");
  const [attempt, setAttempt] = useState(0);
  const reset = useCallback(() => { setToken(""); setAttempt((value) => value + 1); }, []);
  return { token, setToken, attempt, reset };
}

export default function Turnstile({ action, attempt, onVerify }: {
  action: string; attempt: number; onVerify: (token: string) => void;
}) {
  const { nonce, siteKey } = useContext(SecurityContext);
  const container = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [size, setSize] = useState<"compact" | "flexible">("compact");

  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize(entry.contentRect.width < 300 ? "compact" : "flexible");
    });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!ready || !siteKey || !container.current || !window.turnstile) return;
    onVerify("");
    const api = window.turnstile;
    const id = api.render(container.current, {
      sitekey: siteKey, action, theme: "dark", size,
      callback: (token: string) => { setFailed(false); onVerify(token); },
      "expired-callback": () => { onVerify(""); setFailed(true); },
      "error-callback": () => { onVerify(""); setFailed(true); },
      "timeout-callback": () => { onVerify(""); setFailed(true); },
    });
    return () => { api.remove(id); };
  }, [ready, siteKey, action, attempt, retry, size, onVerify]);

  return (
    <div className="jg-verification">
      {siteKey && <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        nonce={nonce} onReady={() => setReady(true)} onError={() => setFailed(true)} />}
      <div ref={container} data-action={action} />
      {(!siteKey || failed) && <p role="status">
        Verification is unavailable or has expired. {ready && siteKey && <button type="button"
          onClick={() => { onVerify(""); setFailed(false); setRetry((value) => value + 1); }}>Try verification again</button>}
        {" "}You can also <a href="mailto:james_gordon@junctiongenerator.net">email James</a>.
      </p>}
    </div>
  );
}
