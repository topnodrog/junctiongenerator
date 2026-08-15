"use client";

import { useCallback, useEffect, useState } from "react";

const API_BASE = (process.env.NEXT_PUBLIC_TESTNET_API_URL
  ?? "https://seed-a.junctiongenerator.net").replace(/\/$/, "");

interface ExplorerParticipant {
  address: string;
  participationWeight: number;
  sharePercent: number;
  projectedJGC: string;
}
interface ExplorerBlock {
  height: number;
  hash: string;
  timestamp: number;
  transactionCount: number;
  contributionCount: number;
  participants: string[];
}

interface ExplorerSnapshot {
  capturedAt: string;
  network: string;
  proofMode: string;
  genesisHash: string;
  height: number;
  tipHash: string;
  peerCount: number;
  mempoolSize: number;
  pendingContributions: number;
  targetParticipationWeight: number;
  health: "healthy" | "waiting" | "degraded";
  producer: {
    running: boolean;
    lastProducedAt: number | null;
    lastError: string | null;
    waitingForTFLOPS: number;
  };
  epoch: {
    index: number;
    blockIndex: number;
    totalParticipationWeight: number;
    pendingRewardPoolJGC: string;
    participants: ExplorerParticipant[];
  };
  faucet: { amountJGC: string; cooldownHours: number };
  recentBlocks: ExplorerBlock[];
}

interface AddressBalance {
  address: string;
  balanceJGC: string;
  pendingJGC: string;
  totalJGC: string;
  asOfHeight: number;
}

function short(value: string, head = 10, tail = 7): string {
  return value.length > head + tail + 1
    ? `${value.slice(0, head)}…${value.slice(-tail)}`
    : value;
}

function decimal(value: string, places = 4): string {
  const [whole, fraction = ""] = value.split(".");
  const trimmed = fraction.slice(0, places).replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole;
}

export default function TestnetDashboard() {
  const [snapshot, setSnapshot] = useState<ExplorerSnapshot | null>(null);
  const [networkError, setNetworkError] = useState("");
  const [address, setAddress] = useState("");
  const [balance, setBalance] = useState<AddressBalance | null>(null);
  const [action, setAction] = useState<"idle" | "balance" | "faucet">("idle");
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/explorer`, { cache: "no-store" });
      if (!response.ok) throw new Error(`explorer returned ${response.status}`);
      setSnapshot(await response.json() as ExplorerSnapshot);
      setNetworkError("");
    } catch {
      setNetworkError("The public explorer endpoint is not reachable yet.");
    }
  }, []);

  useEffect(() => {
    const initial = setTimeout(() => void refresh(), 0);
    const poll = setInterval(() => void refresh(), 10_000);
    return () => { clearTimeout(initial); clearInterval(poll); };
  }, [refresh]);

  async function lookupBalance(event: React.FormEvent) {
    event.preventDefault();
    setAction("balance");
    setMessage("");
    try {
      const response = await fetch(`${API_BASE}/balance?address=${encodeURIComponent(address.trim())}`, {
        cache: "no-store",
      });
      const body = await response.json() as AddressBalance & { error?: string };
      if (!response.ok) throw new Error(body.error || "Balance lookup failed.");
      setBalance(body);
    } catch (error) {
      setBalance(null);
      setMessage(error instanceof Error ? error.message : "Balance lookup failed.");
    } finally {
      setAction("idle");
    }
  }

  async function requestCoins() {
    setAction("faucet");
    setMessage("");
    try {
      const response = await fetch(`${API_BASE}/faucet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: address.trim() }),
      });
      const body = await response.json() as { message?: string; error?: string; txid?: string };
      if (!response.ok) throw new Error(body.error || "Faucet request failed.");
      setMessage(`${body.message} Transaction ${short(body.txid ?? "")}`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Faucet request failed.");
    } finally {
      setAction("idle");
    }
  }

  const healthLabel = snapshot?.health === "healthy"
    ? "Producing blocks"
    : snapshot?.health === "waiting"
      ? "Waiting for participation"
      : snapshot?.health === "degraded"
        ? "Needs attention"
        : "Connecting";

  return (
    <div className="jg-testnet-dashboard">
      <section className="jg-testnet-metrics" aria-label="Live testnet summary">
        <article><span>Block height</span><strong>{snapshot ? snapshot.height.toLocaleString() : "—"}</strong><small>{snapshot ? short(snapshot.tipHash) : "Awaiting live data"}</small></article>
        <article><span>Network health</span><strong className={`jg-health-${snapshot?.health ?? "unknown"}`}>{healthLabel}</strong><small>{snapshot ? `${snapshot.peerCount} connected peer${snapshot.peerCount === 1 ? "" : "s"}` : networkError}</small></article>
        <article><span>Current epoch</span><strong>{snapshot ? `${snapshot.epoch.blockIndex} / 144` : "—"}</strong><small>{snapshot ? `${snapshot.epoch.participants.length} recorded participant${snapshot.epoch.participants.length === 1 ? "" : "s"}` : "No live epoch yet"}</small></article>
        <article><span>Test reward pool</span><strong>{snapshot ? decimal(snapshot.epoch.pendingRewardPoolJGC) : "—"} JGC</strong><small>Valueless test coins only</small></article>
      </section>

      <section className="jg-testnet-grid">
        <article className="jg-testnet-card jg-testnet-participants">
          <div className="jg-testnet-card-heading"><div><span>On-chain participation</span><h2>Who is helping this epoch</h2></div><small>Equal pilot weight per active block</small></div>
          {snapshot?.epoch.participants.length ? (
            <div className="jg-testnet-table" role="table" aria-label="Current epoch participants">
              <div className="jg-testnet-table-row jg-testnet-table-head" role="row"><span>Address</span><span>Blocks / weight</span><span>Share</span><span>Projected test JGC</span></div>
              {snapshot.epoch.participants.map((participant) => (
                <div className="jg-testnet-table-row" role="row" key={participant.address}>
                  <code title={participant.address}>{short(participant.address, 12, 8)}</code>
                  <span>{participant.participationWeight.toLocaleString()}</span>
                  <span>{participant.sharePercent.toFixed(2)}%</span>
                  <span>{decimal(participant.projectedJGC)} JGC</span>
                </div>
              ))}
            </div>
          ) : <p className="jg-testnet-empty">The anchor participant will create the first record when the upgraded producer starts.</p>}
        </article>

        <article className="jg-testnet-card jg-testnet-wallet">
          <div className="jg-testnet-card-heading"><div><span>Wallet and faucet</span><h2>Fund a test wallet</h2></div></div>
          <p>Enter the <code>1QGC…</code> address printed by your participant node. Each address can request {snapshot?.faucet.amountJGC ?? "100"} valueless test JGC every {snapshot?.faucet.cooldownHours ?? 24} hours.</p>
          <form onSubmit={lookupBalance}>
            <label>JGC testnet address<input required value={address} onChange={(event) => setAddress(event.target.value)} placeholder="1QGC…" pattern="1QGC[0-9a-f]{40}" /></label>
            <div><button className="jg-button jg-button-secondary" disabled={action !== "idle"}>{action === "balance" ? "Looking up…" : "Check balance"}</button><button type="button" className="jg-button jg-button-primary" onClick={requestCoins} disabled={action !== "idle" || !address}>Request test JGC</button></div>
          </form>
          {balance && <div className="jg-testnet-balance"><div><span>Spendable</span><strong>{decimal(balance.balanceJGC)} JGC</strong></div><div><span>Pending maturity</span><strong>{decimal(balance.pendingJGC)} JGC</strong></div><small>Recorded at height {balance.asOfHeight}</small></div>}
          {message && <p className="jg-testnet-message" role="status">{message}</p>}
        </article>
      </section>

      <section className="jg-testnet-card jg-testnet-blocks">
        <div className="jg-testnet-card-heading"><div><span>Explorer</span><h2>Recent blocks</h2></div><small>{snapshot ? `${snapshot.network} · ${snapshot.proofMode}` : "Connecting to Seed A"}</small></div>
        <div className="jg-block-list">
          {snapshot?.recentBlocks.map((block) => (
            <article key={block.hash}>
              <strong>#{block.height}</strong><code title={block.hash}>{short(block.hash, 14, 9)}</code><span>{new Date(block.timestamp * 1000).toLocaleString()}</span><span>{block.contributionCount} participant{block.contributionCount === 1 ? "" : "s"}</span><span>{block.transactionCount} transaction{block.transactionCount === 1 ? "" : "s"}</span>
            </article>
          )) ?? <p className="jg-testnet-empty">Waiting for block data.</p>}
        </div>
        {snapshot && <p className="jg-testnet-genesis">Genesis <code>{snapshot.genesisHash}</code></p>}
      </section>

      <section className="jg-testnet-join">
        <div><span className="jg-eyebrow">Join the running chain</span><h2>Your uptime can become a public record.</h2><p>The participant command creates a local post-quantum identity, connects to both seeds, and submits one signed pilot receipt per block. Those receipts determine the valueless epoch payout and provide an auditable participation history.</p></div>
        <div><code>cd packages/jgc-node</code><code>npm ci</code><code>npm run testnet:participate</code><small>Back up <b>data/testnet/participant-identity.json</b>. It proves control of your testnet participation address. Never reuse it on a valuable network.</small></div>
      </section>

      <p className="jg-testnet-disclaimer">Pilot receipts prove that a specific testnet identity signed and joined a block slot. They do not yet prove useful computation, have no cash value, and do not create a promise of future payment. They establish the evidence needed for transparent compensation decisions.</p>
    </div>
  );
}
