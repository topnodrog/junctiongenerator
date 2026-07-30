"use client";

import React, { useState, useEffect, useCallback } from "react";

/**
 * Live status of the operator's LOCAL junctioning node, polled from the node's
 * loopback status server (see packages/jgc-node/src/network/status-server.ts).
 *
 * This is deliberately NOT simulated: when no node is reachable it says so and
 * shows how to start one, rather than inventing numbers. Run the node with:
 *   npm run node-status -- --address <addr> --datadir <store>
 *
 * The endpoint defaults to the loopback server but can be overridden with
 * NEXT_PUBLIC_NODE_STATUS_URL (e.g. an https tunnel for a public demo).
 */

const STATUS_URL =
  process.env.NEXT_PUBLIC_NODE_STATUS_URL ?? "http://127.0.0.1:7777";
const POLL_MS = 5000;
const FETCH_TIMEOUT_MS = 1500;

interface NodeStatus {
  running: true;
  version: string;
  network: string;
  startedAt: number;
  uptimeSec: number;
  height: number | null;
  chain: boolean;
  address: string | null;
  label: string | null;
  balanceJGC: string;
  pendingJGC: string;
  model: string | null;
}

type ConnState = "connecting" | "online" | "offline";

function truncateAddress(addr: string): string {
  return addr.length > 18 ? `${addr.slice(0, 10)}…${addr.slice(-6)}` : addr;
}

function formatUptime(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}

/** Trim a decimal JGC string to a sane display precision without lying about 0. */
function displayJGC(s: string): string {
  if (!s.includes(".")) return s;
  const [whole, frac] = s.split(".");
  const trimmed = frac.slice(0, 6).replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole;
}

export default function NodeStatusPanel() {
  const [state, setState] = useState<ConnState>("connecting");
  const [status, setStatus] = useState<NodeStatus | null>(null);
  const [copied, setCopied] = useState(false);

  const poll = useCallback(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(`${STATUS_URL}/status`, {
        signal: controller.signal,
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as NodeStatus;
      setStatus(data);
      setState("online");
    } catch {
      setState("offline");
      setStatus(null);
    } finally {
      clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    const initialPoll = setTimeout(() => void poll(), 0);
    const id = setInterval(poll, POLL_MS);
    return () => {
      clearTimeout(initialPoll);
      clearInterval(id);
    };
  }, [poll]);

  const copyAddress = () => {
    if (!status?.address) return;
    navigator.clipboard?.writeText(status.address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const online = state === "online" && status;
  const dotColor =
    state === "online" ? "var(--color-neon-green)"
    : state === "connecting" ? "var(--color-cyan)"
    : "var(--text-muted)";
  const dotGlow =
    state === "online" ? "0 0 10px rgba(57, 255, 20, 0.7)"
    : state === "connecting" ? "0 0 10px rgba(0, 242, 254, 0.6)"
    : "none";

  return (
    <div
      className="glass-container"
      style={{
        maxWidth: "440px",
        margin: "0 auto",
        padding: "20px 22px",
        textAlign: "left",
      }}
    >
      {/* Header row: title + live dot */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: dotColor,
              boxShadow: dotGlow,
              animation: state !== "offline" ? "glow-pulse 1.6s infinite" : "none",
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: "13px", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-secondary)" }}>
            Local Node
          </span>
        </div>
        <span style={{ fontSize: "11px", fontWeight: 600, color: dotColor }}>
          {state === "online" ? "ONLINE" : state === "connecting" ? "CONNECTING…" : "OFFLINE"}
        </span>
      </div>

      {online ? (
        <>
          {/* Balances */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "16px" }}>
            <div style={{ background: "rgba(0,0,0,0.25)", padding: "12px", borderRadius: "8px", border: "1px solid rgba(57,255,20,0.1)" }}>
              <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Current JGC</div>
              <div style={{ fontSize: "20px", fontWeight: 800, color: "var(--color-neon-green)", marginTop: "4px", fontFamily: "var(--font-mono)" }}>
                {displayJGC(status.balanceJGC)}
              </div>
            </div>
            <div style={{ background: "rgba(0,0,0,0.25)", padding: "12px", borderRadius: "8px", border: "1px solid rgba(0,242,254,0.1)" }}>
              <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Pending JGC</div>
              <div style={{ fontSize: "20px", fontWeight: 800, color: "var(--color-cyan)", marginTop: "4px", fontFamily: "var(--font-mono)" }}>
                {displayJGC(status.pendingJGC)}
              </div>
            </div>
          </div>

          {/* Wallet address */}
          <div style={{ marginBottom: "14px" }}>
            <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "4px" }}>Wallet Address</div>
            {status.address ? (
              <button
                onClick={copyAddress}
                title="Click to copy"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "13px",
                  color: "var(--text-primary)",
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid var(--glass-border)",
                  borderRadius: "6px",
                  padding: "8px 12px",
                  cursor: "pointer",
                  width: "100%",
                  textAlign: "left",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span>{truncateAddress(status.address)}</span>
                <span style={{ fontSize: "10px", color: copied ? "var(--color-neon-green)" : "var(--text-muted)" }}>
                  {copied ? "copied ✓" : "copy"}
                </span>
              </button>
            ) : (
              <div style={{ fontSize: "12px", color: "var(--text-muted)", fontStyle: "italic" }}>
                no address configured
              </div>
            )}
          </div>

          {/* Meta row */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", fontSize: "11px", color: "var(--text-muted)", borderTop: "1px solid var(--glass-border)", paddingTop: "12px" }}>
            <span>Network: <span style={{ color: "var(--text-secondary)" }}>{status.network}</span></span>
            {status.height !== null && (
              <span>Height: <span style={{ color: "var(--text-secondary)" }}>#{status.height.toLocaleString()}</span></span>
            )}
            <span>Uptime: <span style={{ color: "var(--text-secondary)" }}>{formatUptime(status.uptimeSec)}</span></span>
            {status.model && (
              <span>Model: <span style={{ color: "var(--text-secondary)" }}>{status.model}</span></span>
            )}
          </div>
          {!status.chain && (
            <div style={{ fontSize: "10px", color: "var(--text-muted)", fontStyle: "italic", marginTop: "8px" }}>
              No chain store loaded — balances read 0. Pass <code style={{ fontFamily: "var(--font-mono)" }}>--datadir</code> to report live balances.
            </div>
          )}
        </>
      ) : (
        <>
          <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "12px" }}>
            {state === "connecting"
              ? "Looking for a node on this machine…"
              : "No local node detected. Start one to see live wallet balances and block height here."}
          </p>
          <div style={{ background: "#020206", border: "1px solid var(--glass-border)", borderRadius: "8px", padding: "10px 12px", fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--color-cyan)", overflowX: "auto" }}>
            npm run node-status -- --address &lt;addr&gt;
          </div>
          <p style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "10px", lineHeight: 1.5 }}>
            Runs a read-only loopback endpoint at <code style={{ fontFamily: "var(--font-mono)" }}>127.0.0.1:7777</code>. Add <code style={{ fontFamily: "var(--font-mono)" }}>--datadir &lt;store&gt;</code> for live balances.
          </p>
        </>
      )}
    </div>
  );
}
