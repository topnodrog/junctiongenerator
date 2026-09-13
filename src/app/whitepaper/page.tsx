import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Whitepaper | Junction Generator",
  description: "Proof-of-Useful-Compute: A Protocol for Redirecting Mining Compute to Real AI Workloads",
};

export default function WhitepaperPage() {
  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: "120px 24px 80px" }}>
      <Link href="/" className="footer-link" style={{ display: "inline-block", marginBottom: "32px" }}>
        ← Back to Home
      </Link>
      <h1 className="text-gradient-cyber" style={{ fontSize: 42, marginBottom: 8 }}>
        Junction Generator
      </h1>
      <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 48 }}>
        Proof-of-Useful-Compute — A Protocol for Redirecting Mining Compute to Real AI Workloads
      </p>

      <div className="glass-container" style={{ lineHeight: 1.8, fontSize: 15 }}>
        <h2 style={{ color: "var(--color-cyan)", marginTop: 32 }}>Abstract</h2>
        <p style={{ color: "var(--text-secondary)" }}>
          Junction Generator proposes <strong>Proof-of-Useful-Compute (PoUC)</strong>: rewarding verifiable useful workloads while providing paid compute and inference services. Today the project runs a valueless JGTC testnet with signed participation receipts. A local bounded-work prototype verifies integer vector calculations; production AI-work verification, funded marketplace settlement and mainnet remain unfinished.
        </p>

        <h2 style={{ color: "var(--color-cyan)", marginTop: 32 }}>1. The Problem</h2>
        <h3 style={{ color: "var(--color-purple)", marginTop: 20 }}>1.1 Mining Compute Is Wasted at Massive Scale</h3>
        <p style={{ color: "var(--text-secondary)" }}>
          Bitcoin&apos;s Proof-of-Work consensus requires miners to repeatedly compute SHA-256 hashes, searching for a nonce that produces a hash below a target threshold. This process is intentionally wasteful — the difficulty exists solely to limit block production speed, not to produce any useful output.
        </p>
        <ul style={{ color: "var(--text-secondary)", paddingLeft: 20 }}>
          <li>Proof-of-work uses real electricity and hardware to secure a ledger</li>
          <li>That computation does not also execute user-requested AI workloads</li>
          <li>General-purpose GPUs may support AI workloads; mining ASICs generally cannot be repurposed for them</li>
        </ul>

        <h3 style={{ color: "var(--color-purple)", marginTop: 20 }}>1.2 AI Companies Are Desperate for Compute</h3>
        <ul style={{ color: "var(--text-secondary)", paddingLeft: 20 }}>
          <li>Training and inference consume compute, memory, electricity and bandwidth</li>
          <li>Hardware compatibility and model licensing constrain which jobs a provider can serve</li>
          <li>Pricing and capacity must be validated through measured service pilots</li>
        </ul>

        <h3 style={{ color: "var(--color-purple)", marginTop: 20 }}>1.3 The Gap</h3>
        <p style={{ color: "var(--text-secondary)" }}>
          Junction Generator aims to connect suitable spare compute capacity with buyers of useful workloads. Its marketplace and cost advantages remain to be validated.
        </p>

        <h2 style={{ color: "var(--color-cyan)", marginTop: 32 }}>2. The Solution: Proof-of-Useful-Compute</h2>
        <h3 style={{ color: "var(--color-purple)", marginTop: 20 }}>2.1 Core Concept</h3>
        <p style={{ color: "var(--text-secondary)" }}>
          The target design assigns useful workloads to eligible providers, verifies their results and rewards accepted work in JGC. General AI workloads require further verification research. The current public pilot rewards signed presence receipts in valueless JGTC and does not prove useful AI work.
        </p>

        <h3 style={{ color: "var(--color-purple)", marginTop: 20 }}>2.2 Workload Types</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", color: "var(--text-secondary)", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--glass-border)" }}>
              <th style={{ textAlign: "left", padding: "8px" }}>Type</th>
              <th style={{ textAlign: "left", padding: "8px" }}>Description</th>
              <th style={{ textAlign: "left", padding: "8px" }}>Duration</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
              <td style={{ padding: "8px" }}>Inference</td>
              <td style={{ padding: "8px" }}>Running trained models on new inputs</td>
              <td style={{ padding: "8px" }}>Milliseconds–seconds</td>
            </tr>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
              <td style={{ padding: "8px" }}>Fine-Tuning</td>
              <td style={{ padding: "8px" }}>Adapting pre-trained models to specific data</td>
              <td style={{ padding: "8px" }}>Hours–days</td>
            </tr>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
              <td style={{ padding: "8px" }}>Distributed Training</td>
              <td style={{ padding: "8px" }}>Splitting large training jobs across GPUs</td>
              <td style={{ padding: "8px" }}>Days–weeks</td>
            </tr>
          </tbody>
        </table>

        <h3 style={{ color: "var(--color-purple)", marginTop: 20 }}>2.3 Verification</h3>
        <p style={{ color: "var(--text-secondary)" }}>
          JGC is developing a three-layer verification model without trusted hardware. <strong>Deterministic replay</strong> can let compatible validators re-run sampled work and compare committed outputs. <strong>Delayed sampling</strong> makes the audit target unpredictable. <strong>Multi-challenger quorum</strong> reduces single-observer risk. The live JGTC pilot currently uses signed test receipts to record participation; those receipts are not production-sound proof of useful computation, and bonded slashing is not active. Zero-knowledge or transparent general-compute proofs remain a long-term target as ZKML tooling matures.
        </p>

        <h2 style={{ color: "var(--color-cyan)", marginTop: 32 }}>3. Token Economics ($JGC)</h2>
        <p style={{ color: "var(--text-secondary)" }}>
          JGC is intended to support verified-work rewards, compute payments and future protocol economics. Mainnet issuance, bonds, governance and contributor rewards require explicit specifications and reviewed activation. These are proposed capabilities, not active mainnet services.
        </p>

        <h3 style={{ color: "var(--color-purple)", marginTop: 20 }}>3.1 Paid Services and JGC Purchases</h3>
        <p style={{ color: "var(--text-secondary)" }}>
          Compute and inference will be charged for. Revenue must first pay infrastructure, worker compensation and all other bills. Any remaining realized surplus is intended to purchase JGC, supporting the aim of a fair market value and a market for participants who wish to sell their earned coins. This policy replaces the earlier fee-burning proposal. It cannot guarantee a price floor, redemption or continuous liquidity, and purchases are not active today. Valueless JGTC testnet receipts are not eligible for these purchases.
        </p>
        <p style={{ color: "var(--text-secondary)" }}>
          Activation requires auditable accounting, treasury controls, purchase limits and public reporting. Purchases may use only actual surplus after obligations are covered. The treatment of purchased coins must be specified before activation. Any subsidized access needs an explicit budget.
        </p>
        <h3 style={{ color: "var(--color-purple)", marginTop: 20 }}>3.2 Intelligence Must Be Free</h3>
        <p style={{ color: "var(--text-secondary)" }}>
          Founder James Gordon predicts that intelligence is a force that will resist containment, and that attempts to capture and sell intelligence itself will go badly for those attempting it. This is his philosophical prediction and motivation for helping build a world of abundance. It is not an established scientific finding or a promise of zero-cost infrastructure. Charging for compute and inference is consistent with this vision.
        </p>

        <div style={{ background: "rgba(0,242,254,0.05)", border: "1px solid var(--glass-border)", borderRadius: 8, padding: "16px 20px", marginTop: 16 }}>
          <strong style={{ color: "var(--color-purple)" }}>JGC vs JGT — not the same thing.</strong>
          <p style={{ color: "var(--text-secondary)", margin: "8px 0 0" }}>
            <strong>JGC</strong> is the protocol&apos;s native coin — earned by miners for verified useful compute, and the subject of this paper. It is pre-mainnet and exists today only on the testnet. <strong>JGT</strong> (Junction Generator Token) is a separate ERC-20 on Base, created to help support and promote the project. It is <strong>not</strong> the mining reward, <strong>not</strong> redeemable for JGC, and is not an investment.
          </p>
        </div>

        <h2 style={{ color: "var(--color-cyan)", marginTop: 32 }}>4. OSCRP — Open-Source Contributor Reward Protocol</h2>
        <p style={{ color: "var(--text-secondary)" }}>
          OSCRP is a proposed contributor reward program. Scoring, funding, eligibility and any treasury participation remain to be specified and reviewed. No automatic JGC payout or Autonomy Equity claim is currently issued for merging code.
        </p>

        <h2 style={{ color: "var(--color-cyan)", marginTop: 32 }}>5. Roadmap</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", color: "var(--text-secondary)", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--glass-border)" }}>
              <th style={{ textAlign: "left", padding: "8px" }}>Phase</th>
              <th style={{ textAlign: "left", padding: "8px" }}>Status</th>
              <th style={{ textAlign: "left", padding: "8px" }}>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
              <td style={{ padding: "8px" }}>1. Concept & Design</td>
              <td style={{ padding: "8px", color: "var(--color-neon-green)" }}>✅ Complete</td>
              <td style={{ padding: "8px" }}>PoUC concept + cryptoeconomic design</td>
            </tr>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
              <td style={{ padding: "8px" }}>2. Demo Site & Whitepaper</td>
              <td style={{ padding: "8px", color: "var(--color-neon-green)" }}>✅ Complete</td>
              <td style={{ padding: "8px" }}>Interactive site + this whitepaper</td>
            </tr>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
              <td style={{ padding: "8px" }}>3. PoUC Node & Local Testnet</td>
              <td style={{ padding: "8px", color: "var(--color-neon-green)" }}>✅ Complete</td>
              <td style={{ padding: "8px" }}>Local inference, ledger and audit foundations; bonded slashing and useful-work payments remain inactive</td>
            </tr>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
              <td style={{ padding: "8px" }}>4. Public Testnet & Explorer</td>
              <td style={{ padding: "8px", color: "var(--color-cyan)" }}>✅ Live pilot</td>
              <td style={{ padding: "8px" }}>Two public seeds, participant records, read-only explorer; closed soak in progress</td>
            </tr>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
              <td style={{ padding: "8px" }}>5. GPU Mining Client & Workloads</td>
              <td style={{ padding: "8px", color: "var(--text-muted)" }}>⬜ Planned</td>
              <td style={{ padding: "8px" }}>Miner client + inference/training circuits</td>
            </tr>
            <tr>
              <td style={{ padding: "8px" }}>6. Mainnet Launch</td>
              <td style={{ padding: "8px", color: "var(--text-muted)" }}>⬜ Planned</td>
              <td style={{ padding: "8px" }}>$JGC mainnet</td>
            </tr>
          </tbody>
        </table>

        <h2 style={{ color: "var(--color-cyan)", marginTop: 32 }}>6. Get Involved</h2>
        <p style={{ color: "var(--text-secondary)" }}>
          Junction Generator is open source and seeking code, documentation, research and feedback. Contributions are welcome; OSCRP rewards are not currently guaranteed or automatically issued.
        </p>
        <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
          <a href="https://github.com/topnodrog/junctiongenerator" target="_blank" rel="noopener noreferrer" className="btn-glow-purple" style={{ textDecoration: "none", fontSize: 13 }}>
            View on GitHub
          </a>
          <Link href="/" className="btn-glow-cyan" style={{ textDecoration: "none", fontSize: 13 }}>
            Back to Demo
          </Link>
        </div>
      </div>
    </main>
  );
}
