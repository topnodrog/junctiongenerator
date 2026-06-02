import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Whitepaper | Junction Generator",
  description: "Proof-of-Useful-Compute: A Protocol for Redirecting Mining Compute to Real AI Workloads",
};

export default function WhitepaperPage() {
  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: "120px 24px 80px" }}>
      <a href="/" className="footer-link" style={{ display: "inline-block", marginBottom: "32px" }}>
        ← Back to Home
      </a>
      <h1 className="text-gradient-cyber" style={{ fontSize: 42, marginBottom: 8 }}>
        Junction Generator
      </h1>
      <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 48 }}>
        Proof-of-Useful-Compute — A Protocol for Redirecting Mining Compute to Real AI Workloads
      </p>

      <div className="glass-container" style={{ lineHeight: 1.8, fontSize: 15 }}>
        <h2 style={{ color: "var(--color-cyan)", marginTop: 32 }}>Abstract</h2>
        <p style={{ color: "var(--text-secondary)" }}>
          Global cryptocurrency mining consumes an estimated 150 terawatt-hours of electricity per year — more than many nations — to solve computational puzzles with no productive output beyond securing a ledger. Simultaneously, artificial intelligence companies face a severe and worsening shortage of GPU compute for training and inference workloads. Junction Generator proposes <strong>Proof-of-Useful-Compute (PoUC)</strong>, a protocol that replaces the wasteful hash-puzzle paradigm with verifiable AI workload completion. Miners earn $JGC tokens by running real inference, training, and fine-tuning tasks, and their work is cryptographically verified on-chain.
        </p>

        <h2 style={{ color: "var(--color-cyan)", marginTop: 32 }}>1. The Problem</h2>
        <h3 style={{ color: "var(--color-purple)", marginTop: 20 }}>1.1 Mining Compute Is Wasted at Massive Scale</h3>
        <p style={{ color: "var(--text-secondary)" }}>
          Bitcoin&apos;s Proof-of-Work consensus requires miners to repeatedly compute SHA-256 hashes, searching for a nonce that produces a hash below a target threshold. This process is intentionally wasteful — the difficulty exists solely to limit block production speed, not to produce any useful output.
        </p>
        <ul style={{ color: "var(--text-secondary)", paddingLeft: 20 }}>
          <li>The Bitcoin network consumes approximately <strong>150 TWh/year</strong> of electricity</li>
          <li>Global mining hardware represents <strong>billions of dollars</strong> in GPU and ASIC investment</li>
          <li>The computational output produces <strong>zero productive work</strong> beyond securing the Bitcoin ledger</li>
        </ul>

        <h3 style={{ color: "var(--color-purple)", marginTop: 20 }}>1.2 AI Companies Are Desperate for Compute</h3>
        <ul style={{ color: "var(--text-secondary)", paddingLeft: 20 }}>
          <li>Training frontier models requires <strong>thousands of GPUs running for months</strong></li>
          <li>AI inference demand is growing <strong>10x annually</strong></li>
          <li>Cloud GPU costs remain prohibitively high — <strong>$2-4 per GPU-hour</strong></li>
          <li>Access to compute has become the <strong>primary bottleneck</strong> in AI development</li>
        </ul>

        <h3 style={{ color: "var(--color-purple)", marginTop: 20 }}>1.3 The Gap</h3>
        <p style={{ color: "var(--text-secondary)" }}>
          On one side: billions of dollars in GPU hardware burning electricity to solve meaningless puzzles. On the other: companies willing to pay for the exact same hardware to do real work. Junction Generator bridges this gap.
        </p>

        <h2 style={{ color: "var(--color-cyan)", marginTop: 32 }}>2. The Solution: Proof-of-Useful-Compute</h2>
        <h3 style={{ color: "var(--color-purple)", marginTop: 20 }}>2.1 Core Concept</h3>
        <p style={{ color: "var(--text-secondary)" }}>
          PoUC replaces hash puzzles with verifiable AI workload completion. Instead of racing to find a nonce, miners receive AI workloads from the JGC network, execute them on their GPU hardware, submit results with cryptographic proof, and earn $JGC tokens proportional to useful compute contributed.
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
          JGC uses a multi-layered verification approach: redundant execution across multiple miners, random spot checks by verifier nodes, cryptographic attestation via trusted execution environments, and statistical validation of output distributions.
        </p>

        <h2 style={{ color: "var(--color-cyan)", marginTop: 32 }}>3. Token Economics ($JGC)</h2>
        <p style={{ color: "var(--text-secondary)" }}>
          $JGC serves multiple roles: mining rewards, compute payment, staking, governance, and OSCRP rewards. The supply model rewards early participants with halving schedules triggered by useful compute milestones rather than block counts, plus a burn mechanism creating deflationary pressure.
        </p>

        <h2 style={{ color: "var(--color-cyan)", marginTop: 32 }}>4. OSCRP — Open-Source Contributor Reward Protocol</h2>
        <p style={{ color: "var(--text-secondary)" }}>
          When a contributor merges code, the contribution is scored for scope, complexity, and criticality. The contributor receives an immediate $JGC payout plus Autonomy Equity (AE) — a stake in the protocol&apos;s treasury that vests over time.
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
              <td style={{ padding: "8px" }}>Core concept validated</td>
            </tr>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
              <td style={{ padding: "8px" }}>2. Frontend & Demo</td>
              <td style={{ padding: "8px", color: "var(--color-cyan)" }}>🔄 In Progress</td>
              <td style={{ padding: "8px" }}>Interactive demo site</td>
            </tr>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
              <td style={{ padding: "8px" }}>3. Protocol Spec</td>
              <td style={{ padding: "8px", color: "var(--text-muted)" }}>⬜ Planned</td>
              <td style={{ padding: "8px" }}>Formal PoUC specification</td>
            </tr>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
              <td style={{ padding: "8px" }}>4. Mining Client MVP</td>
              <td style={{ padding: "8px", color: "var(--text-muted)" }}>⬜ Planned</td>
              <td style={{ padding: "8px" }}>GPU mining client</td>
            </tr>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
              <td style={{ padding: "8px" }}>5. AI Marketplace</td>
              <td style={{ padding: "8px", color: "var(--text-muted)" }}>⬜ Planned</td>
              <td style={{ padding: "8px" }}>Compute marketplace</td>
            </tr>
            <tr>
              <td style={{ padding: "8px" }}>6. Mainnet Launch</td>
              <td style={{ padding: "8px", color: "var(--text-muted)" }}>⬜ Planned</td>
              <td style={{ padding: "8px" }}>$JGC token launch</td>
            </tr>
          </tbody>
        </table>

        <h2 style={{ color: "var(--color-cyan)", marginTop: 32 }}>6. Get Involved</h2>
        <p style={{ color: "var(--text-secondary)" }}>
          Junction Generator is open source and actively seeking contributors. Every contribution — code, documentation, research, or feedback — earns OSCRP rewards.
        </p>
        <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
          <a href="https://github.com/topnodrog/Junction_Generator" target="_blank" rel="noopener noreferrer" className="btn-glow-purple" style={{ textDecoration: "none", fontSize: 13 }}>
            View on GitHub
          </a>
          <a href="/" className="btn-glow-cyan" style={{ textDecoration: "none", fontSize: 13 }}>
            Back to Demo
          </a>
        </div>
      </div>
    </main>
  );
}
