"use client";

import React from "react";

const BLOG_POSTS = [
  {
    slug: "proof-of-useful-compute",
    title: "Proof-of-Useful-Compute: Why Hash Puzzles Are the Wrong Abstraction",
    date: "June 19, 2026",
    readTime: "6 min read",
    excerpt: "Bitcoin burns 150 terawatt-hours a year solving puzzles that produce nothing. AI companies are simultaneously starved for GPU time. PoUC is the bridge.",
    content: `## The Core Waste

Bitcoin's Proof-of-Work is brilliant security design with one fatal flaw: the work is intentionally useless. Miners burn electricity to find a nonce that makes a hash fall below a target — a computation specifically designed to produce no output other than a number. The difficulty exists solely to throttle block production.

The result: the Bitcoin network consumes approximately 150 TWh of electricity per year. That is more than many countries. Every joule of it produces nothing except ledger security.

## The Simultaneous Shortage

On the other side of the same GPU market: AI companies cannot get enough compute. Training a frontier model requires thousands of GPUs running for months. Inference demand is growing 10x annually. Cloud GPU costs run $2–4 per GPU-hour and remain chronically oversold.

The GPUs exist. The electricity exists. They are being pointed at SHA-256.

## The PoUC Proposition

Proof-of-Useful-Compute replaces the hash puzzle with a verifiable AI workload. Instead of searching for a nonce, a Junction Generator miner:

1. Receives an inference workload from the JGC network
2. Runs it on their GPU hardware using a local LLM (via Ollama)
3. Submits the output with a cryptographic commitment
4. Earns $JGC proportional to verified FLOP contribution

The network verifies the work without running it again — and without trusting the miner.

## Why Verification Is the Hard Part

Anyone can claim they ran a workload. The interesting problem is proving it. Junction Generator's current testnet uses deterministic-replay verification: given the same model weights, same sampler seed, and same input, inference is reproducible. Validators can spot-check any block, replay the inference independently, and compare outputs. Cheating requires forging reproducible inference — which is equivalent to running it honestly.

This is not the final word on verification. Zero-knowledge proofs over neural network arithmetic (ZKML) would allow constant-time verification without re-execution. That is a research frontier we are actively tracking. But deterministic replay is a working, deployable primitive today — and it is live on the JGC testnet.

## What This Changes

PoUC is not a marginal improvement on PoW. It is a different premise: compute should earn rewards in proportion to its productive value, not its ability to waste electricity faster than a competitor. If that premise is right, the entire mining economy can be redirected toward AI infrastructure — a multi-trillion-dollar need — rather than toward hashing.

Junction Generator is building the protocol that makes that possible.`,
  },
  {
    slug: "junctioning-layer-1-architecture",
    title: "The Junctioning Layer-1: Architecture of a Useful-Compute Chain",
    date: "June 19, 2026",
    readTime: "8 min read",
    excerpt: "A technical walkthrough of how the JGC Layer-1 block structure, FLOP measurement, and economic reward model fit together in the live testnet.",
    content: `## What Is Junctioning?

Junctioning is the name for the local Layer-1 operation in the JGC protocol. A junctioning node mines blocks by running LLM inference on a locally-served model (currently Gemma 4 via Ollama), measuring the honest compute contributed, and producing a block that commits to the result with full cryptographic traceability.

The word "junctioning" captures the core idea: the miner is a junction point between the world's idle GPU compute and the world's AI inference demand.

## Block Structure

A JGC block contains:

- **Coinbase transaction** — mints fresh $JGC to the miner's address, scaled by verified FLOP contribution
- **Inference commitment** — hash of (model ID, sampler seed, prompt hash, output hash)
- **FLOP attestation** — honest compute measurement derived from real model parameter count, not self-reported
- **Validator set snapshot** — the current quorum configuration for replay challenges

The block header links to the parent block hash and a epoch-level settlement hash, giving the chain standard Nakamoto-style tamper-evidence.

## Honest FLOP Measurement

Self-reported compute is untrustworthy. Junction Generator measures FLOPs from the actual parameter count of the model the miner declares. For a transformer model with P parameters running T tokens of inference, approximate FLOPs = 2 × P × T. This is derived at validation time from the model's published spec — a miner cannot inflate it by claiming more parameters than the model has, because the validator checks the declared model ID against a known registry.

This is an approximation, not an exact proof. It is intentionally conservative and auditable.

## The Verification Model

JGC's verification stack has three layers, each providing a different security guarantee:

**Deterministic Replay** — The base layer. Given the same model, seed, and input, inference is deterministic. Any validator can re-run a challenged block and compare outputs exactly. A miner who fabricates outputs will be caught every time they are sampled.

**Sampling + Slashing** — Validators do not re-run every block (that would eliminate the efficiency gain). Instead, they sample randomly. When a challenge is raised, validators replay the block and vote on whether the output matches. A confirmed mismatch triggers a proportional slash of the miner's stake.

**Multi-challenger Quorum** — No single validator can slash a miner unilaterally. A quorum of independent challengers must agree. This means framing a honest miner requires coordinating a majority of independent validators — economically irrational given slashing exposure for false challenges.

## What Is Live Today

The junctioning Layer-1 went live on 2026-06-18. The current testnet includes:

- Local block production via Ollama inference (Gemma 4 and compatible models)
- Full FLOP measurement from real model parameter counts
- Deterministic-replay challenge infrastructure
- Sampling scheduler with configurable challenge rate
- Multi-challenger quorum with configurable threshold
- Coinbase transaction flow with 16-decimal $JGC precision

The next milestone is P2P sync — connecting multiple junctioning nodes across machines into a shared chain.

## Why This Architecture

Every design decision in the JGC Layer-1 prioritizes deployability over theoretical perfection. Deterministic replay is weaker than a ZK proof — but it is implementable today, auditable, and provides strong economic disincentives against cheating. The sampling model reduces validator load to a manageable fraction of total blocks. The quorum model distributes trust without a trusted third party.

The architecture is designed to be upgraded: the replay verification layer can be replaced with ZKML circuits as that technology matures, without changing the economic or consensus layer.`,
  },
  {
    slug: "collusion-hardened-verification",
    title: "Collusion-Hardened Verification: How JGC Prevents Validator Cartels",
    date: "June 19, 2026",
    readTime: "5 min read",
    excerpt: "A verification system where one validator can slash a miner is a verification system waiting to be extorted. Here is how JGC's quorum model closes that attack vector.",
    content: `## The Single-Validator Problem

Imagine a verification system where any one validator can accuse a miner of submitting false compute, and that accusation automatically triggers a slash. Now imagine you are that validator. You have financial leverage over every miner on the network.

You could demand payment in exchange for not challenging valid blocks. You could collude with a rival miner to slash honest competitors. You could be bribed by a bad actor to cover for genuinely fraudulent compute.

A useful-compute chain with a single-validator challenge model is not a trust-minimized system — it is an extortion machine with a token on top.

## The Quorum Design

JGC's multi-challenger quorum requires agreement from N-of-M independent validators before a slash is applied to a miner. No single validator can trigger a slash unilaterally.

The consequence: framing a honest miner requires coordinating a majority of independent validators who are each risking their own stake on a false challenge. If the challenge fails (because the miner's block is valid), the challengers are themselves slashed.

This creates a symmetric risk structure. Honest miners are protected not by trusting validators, but by making attacks on them economically irrational.

## Why This Matters for Grants and Adoption

Verifiable compute networks fail when they become attack surfaces. The history of oracle networks, staking pools, and validator sets in crypto is full of examples where a small number of colluding actors extracted value from a system that was technically decentralized but practically cartelized.

JGC's quorum model is designed from the start to resist this. The threshold is configurable — testnet runs at a lower quorum to reduce coordination overhead while the validator set is small. As the network grows, the quorum threshold rises, increasing collusion cost proportionally.

## The Slashing Symmetry

One design decision worth highlighting: false challengers are slashed on the same curve as fraudulent miners. A validator who raises a challenge that the quorum does not support loses stake in proportion to the severity of the false challenge.

This means bad-faith challenges are not free. Validators who spam challenges to harass miners, or who attempt to bootstrap a collusion attack, bleed stake in the process. The economic gradient points toward honest behavior for both miners and validators.

## Open Problems

The quorum model solves collusion under the assumption that a majority of validators remain independent. If a single entity controls a majority of validator stake, the quorum degenerates into a single point of failure. This is the standard 51% attack generalized to validators.

Mitigations include: mandatory stake diversity requirements, validator set rotation, and eventually integrating ZK proofs that make replay unnecessary — at which point validator collusion has nothing to collude on, because the proof is self-verifying.

These are active areas of development. The quorum model is not the endpoint; it is the security floor we can deploy today while the harder cryptography matures.`,
  },
];

function renderContent(content: string) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let tableRows: string[] = [];
  let listItems: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let key = 0;

  const flushList = () => {
    if (listItems.length > 0 && listType) {
      const Tag = listType === "ul" ? "ul" : "ol";
      elements.push(
        <Tag key={key++} style={{ margin: "12px 0", paddingLeft: "20px" }}>
          {listItems.map((item, li) => (
            <li key={li} style={{ marginBottom: "6px", color: "var(--text-secondary)", lineHeight: 1.6 }}>{item}</li>
          ))}
        </Tag>
      );
      listItems = [];
      listType = null;
    }
  };

  const flushTable = () => {
    if (tableRows.length > 0) {
      const rows = tableRows.filter(r => r.trim() && !r.match(/^\|[-| ]+$/));
      elements.push(
        <div key={key++} style={{ overflowX: "auto", margin: "16px 0" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <tbody>
              {rows.map((row, ri) => {
                const cells = row.split("|").filter(c => c.trim());
                return (
                  <tr key={ri} style={{ borderBottom: "1px solid var(--glass-border)" }}>
                    {cells.map((cell, ci) => (
                      ri === 0 ?
                        <th key={ci} style={{ padding: "8px 12px", textAlign: "left", color: "var(--color-purple)", fontWeight: 700, background: "rgba(155,81,224,0.05)" }}>{cell.trim()}</th> :
                        <td key={ci} style={{ padding: "8px 12px", color: "var(--text-secondary)" }}>{cell.trim()}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
      tableRows = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith("|")) {
      flushList();
      tableRows.push(trimmed);
      continue;
    }

    flushTable();

    if (trimmed.startsWith("- ")) {
      if (listType !== "ul") {
        flushList();
        listType = "ul";
      }
      listItems.push(trimmed.replace(/^- /, ""));
      continue;
    }

    if (trimmed.match(/^\d+\./)) {
      if (listType !== "ol") {
        flushList();
        listType = "ol";
      }
      listItems.push(trimmed.replace(/^\d+\.\s*/, ""));
      continue;
    }

    flushList();

    if (trimmed.startsWith("## ")) {
      elements.push(<h3 key={key++} style={{ fontSize: "18px", fontWeight: 700, marginTop: "28px", marginBottom: "12px", color: "var(--color-cyan)" }}>{trimmed.replace("## ", "")}</h3>);
    } else if (trimmed.startsWith("**") && trimmed.endsWith("**")) {
      elements.push(<p key={key++} style={{ fontWeight: 700, color: "var(--text-primary)", margin: "12px 0" }}>{trimmed.replace(/\*\*/g, "")}</p>);
    } else if (trimmed.length > 0) {
      const withBold = trimmed.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      elements.push(
        <p
          key={key++}
          style={{ margin: "12px 0", color: "var(--text-secondary)", lineHeight: 1.75 }}
          dangerouslySetInnerHTML={{ __html: withBold }}
        />
      );
    }
  }
  flushList();
  flushTable();
  return elements;
}

export default function BlogPage() {
  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "120px 24px 80px" }}>
      <div style={{ marginBottom: "12px" }}>
        <a href="/" className="footer-link" style={{ display: "inline-block", fontSize: "14px" }}>← Back to Home</a>
      </div>
      <div style={{ textAlign: "center", marginBottom: "48px" }}>
        <h1 className="text-gradient-cyber" style={{ fontSize: "42px", fontWeight: 900, marginBottom: "12px" }}>
          Junction Generator Blog
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "16px", maxWidth: "500px", margin: "0 auto" }}>
          Technical writing on Proof-of-Useful-Compute, verifiable inference, and the JGC protocol
        </p>
      </div>

      <div style={{ display: "grid", gap: "32px" }}>
        {BLOG_POSTS.map((post) => (
          <article
            key={post.slug}
            id={post.slug}
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--glass-border)",
              borderRadius: 16,
              padding: "36px",
            }}
          >
            <div style={{ display: "flex", gap: "12px", marginBottom: "14px", alignItems: "center" }}>
              <span style={{ fontSize: "11px", color: "var(--color-cyan)", background: "rgba(0,242,254,0.08)", padding: "3px 10px", borderRadius: 100, fontWeight: 600, border: "1px solid rgba(0,242,254,0.15)" }}>
                {post.readTime}
              </span>
              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{post.date}</span>
            </div>
            <h2 style={{ fontSize: "22px", fontWeight: 800, marginBottom: "10px", fontFamily: "var(--font-display)", lineHeight: 1.3 }}>
              {post.title}
            </h2>
            <p style={{ color: "var(--text-secondary)", fontSize: "15px", marginBottom: "24px", lineHeight: 1.6, borderBottom: "1px solid var(--glass-border)", paddingBottom: "24px" }}>
              {post.excerpt}
            </p>
            <div style={{ color: "var(--text-primary)", fontSize: "15px" }}>
              {renderContent(post.content)}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
