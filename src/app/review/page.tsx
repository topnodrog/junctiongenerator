import type { Metadata } from "next";
import Link from "next/link";
import gateSnapshot from "../../../docs/mainnet/gate-status.json";
import CopyCommands from "./CopyCommands";
import styles from "./review.module.css";

const REPOSITORY = "https://github.com/topnodrog/junctiongenerator";
// Pin the first task independently of subsequent website changes.
const REVIEW_COMMIT = "4ef07d9ea9c090c780c1fdd33db9e9c0dbe5314b";
const SOURCE = `${REPOSITORY}/blob/${REVIEW_COMMIT}`;
const REBUILD_FORM = `${REPOSITORY}/issues/new?template=reproducible-build.yml`;
const JOIN_FORM = `${REPOSITORY}/issues/new?template=join-independent-review.yml`;
const COMMANDS = `git clone https://github.com/topnodrog/junctiongenerator.git junctiongenerator-review
cd junctiongenerator-review
git switch --detach ${REVIEW_COMMIT}
cd packages/jgc-node
npm ci
npm run release:check
npm run gates:status`;

const GATE_NAMES: Record<string, string> = {
  proofSystem: "Proof system",
  postQuantumSecurity: "Post-quantum security",
  paymentPrivacy: "Payment privacy",
  usefulServices: "Useful services",
  governance: "Governance",
  deterministicConsensus: "Deterministic consensus",
  permissionlessProduction: "Permissionless production",
  peerAuthentication: "Peer authentication",
  validatorEconomics: "Validator economics",
  reproducibleArtifacts: "Reproducible artifacts",
  soloSoak: "Independent soak evidence",
  independentSecurityReview: "Independent security review",
};

export const metadata: Metadata = {
  title: "Independent Review | Junction Generator",
  description: "Rebuild a pinned JGC source revision, inspect the open readiness gates, or contribute one reproduced finding. Start with a local result.",
  alternates: { canonical: "/review" },
  openGraph: {
    title: "Reproduce one result. Help make it trustworthy.",
    description: "Join the Junction Generator independent review program: source checks, reproduced findings, and independent operators.",
    url: "/review",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Junction Generator independent review",
    description: "Start with a pinned local build and one reproducible result.",
  },
};

export default function ReviewPage() {
  const acceptedGates = gateSnapshot.gates.filter((gate) => gate.evidenceSatisfied).length;
  const snapshotDate = gateSnapshot.generatedAt.slice(0, 10);

  return (
    <div className={styles.page}>
      <a className={styles.skipLink} href="#review-main">Skip to review program</a>
      <header className={styles.header}>
        <Link href="/" className="jg-brand"><span className="jg-mark" aria-hidden="true">JG</span><span><strong>Junction Generator</strong><small>Independent review</small></span></Link>
        <nav aria-label="Review navigation"><a href="#rebuild">First task</a><a href="#readiness">Open gates</a><Link href="/community">Community</Link></nav>
      </header>

      <main id="review-main" className={styles.main}>
        <section className={styles.hero} aria-labelledby="review-title">
          <div>
            <span className="jg-eyebrow">Independent review program</span>
            <h1 id="review-title">Reproduce one result.<br /><span>Help make it trustworthy.</span></h1>
            <p>Help test a proof-of-useful-compute research network. Begin with a local build, bring a reproduced finding, or prepare an independent seed.</p>
            <div className={styles.actions}><a href="#rebuild" className="jg-button jg-button-primary">Start the rebuild challenge</a><a href={`${SOURCE}/docs/mainnet/REVIEW_PACK.md`} className="jg-button jg-button-secondary">Read the review pack ↗</a></div>
            <p className={styles.note}>Zero-value testnet candidate. No value-bearing mainnet or token sale. You can run the first checks without a wallet or community signup; posting a result uses GitHub.</p>
          </div>
          <aside className={styles.snapshot} aria-label="Recorded readiness snapshot">
            <span className={styles.status}>Launch blocked</span>
            <strong>{acceptedGates}<small> / {gateSnapshot.gates.length}</small></strong>
            <p>gates with accepted signed evidence</p>
            <div>Recorded <time dateTime={gateSnapshot.generatedAt}>{snapshotDate} UTC</time></div>
            <p className={styles.note}>This is the repository snapshot, not a live network reading. Baseline checks alone do not close a gate.</p>
            <a href="#readiness">Inspect what is missing ↓</a>
          </aside>
        </section>

        <section id="rebuild" className={styles.section} aria-labelledby="rebuild-title">
          <div className={styles.sectionHeading}><span className="jg-eyebrow">01 / A small first contribution</span><h2 id="rebuild-title">Build locally. Publish what happened.</h2><p>Start with source checks on your own machine. Setup and the full test suite can take longer than ten minutes; a failed check is useful to report too.</p></div>
          <div className={styles.rebuildGrid}>
            <div className={styles.terminal}>
              <div className={styles.terminalHeader}><span>Git + Node.js 20 or newer + npm</span><CopyCommands commands={COMMANDS} /></div>
              <pre tabIndex={0} aria-label="Pinned source build commands"><code>{COMMANDS}</code></pre>
              <p>Pinned source: <a href={`${REPOSITORY}/commit/${REVIEW_COMMIT}`}><code>{REVIEW_COMMIT.slice(0, 12)}</code> ↗</a>. These commands use a new folder and run local checks.</p>
            </div>
            <div className={styles.resultCard}>
              <span className="jg-eyebrow">Your first artifact</span>
              <h3>One result someone else can reproduce.</h3>
              <ol><li>Record your OS, architecture, Node version, and the pinned commit.</li><li>Keep the command output and the tree digest printed by the bundle verifier. The manifest is under <code>.tmp/release/jgc-node-v0.1.0/RELEASE-MANIFEST.json</code>.</li><li>Post the result, or the first failing command. Remove secrets and personal file paths from logs.</li></ol>
              <a href={REBUILD_FORM} className="jg-button jg-button-primary">Post a build result on GitHub ↗</a>
            </div>
          </div>
          <div className={styles.referenceNote}><strong>Reference archive still needed for this revision.</strong><p>The published v0.1.0 release predates this pinned source. A source check is a starting contribution, not a matching release attestation. Leave the archive digest blank when no matching reference archive is available. Independent matches remain an open gate.</p></div>
        </section>

        <section id="tracks" className={styles.section} aria-labelledby="tracks-title">
          <div className={styles.sectionHeading}><span className="jg-eyebrow">02 / Choose your next contribution</span><h2 id="tracks-title">Bring one finding. Own one piece.</h2><p>Move on when you have reproduced something. Signatures come after useful evidence.</p></div>
          <div className={styles.tracks}>
            <article><span>Protocol &amp; security</span><h3>Test one assumption</h3><p>Pick a readiness gate. Reproduce a behavior, propose an adversarial test, or document a mismatch with the affected commit and exact steps.</p><a href={JOIN_FORM}>Choose a review track ↗</a><a href={`${SOURCE}/SECURITY.md`}>Read the disclosure policy ↗</a></article>
            <article><span>Independent operators</span><h3>Prepare one seed</h3><p>Review the host, DNS, TLS, backup, and monitoring requirements. Bring your own hardware or provider; agree the scope and cost before operating a seed.</p><a href={`${SOURCE}/packages/jgc-node/deploy/selfhosted/README.md`}>Read the operator guide ↗</a><a href={JOIN_FORM}>Register operator interest ↗</a></article>
            <article><span>After the first artifact</span><h3>Make evidence verifiable</h3><p>Turn a version-specific reproduction or review into signed evidence using the published closure protocol. Reviewer independence and conflicts are recorded.</p><a href={`${SOURCE}/docs/mainnet/GATE_CLOSURE_PROTOCOL.md`}>See the evidence protocol ↗</a><a href={JOIN_FORM}>Join the review program ↗</a></article>
          </div>
          <p className={styles.disclosure}>Found an exploitable vulnerability? <a href={`${REPOSITORY}/security/advisories/new`}>Report it privately through GitHub Security Advisories</a> before posting public reproduction details.</p>
        </section>

        <section id="readiness" className={styles.section} aria-labelledby="readiness-title">
          <div className={styles.sectionHeading}><span className="jg-eyebrow">03 / Evidence before claims</span><h2 id="readiness-title">The open gates are the work.</h2><p>Recorded {snapshotDate} UTC. {gateSnapshot.baselineMissingGates.length} baseline gates remain unmet; all {gateSnapshot.gates.length} gates require accepted evidence before a value-bearing launch. This snapshot does not certify a live network.</p></div>
          <div className={styles.gates}>{gateSnapshot.gates.map((gate) => <details key={gate.gate}><summary><span>{GATE_NAMES[gate.gate] || gate.gate}</span><small>{gate.evidenceSatisfied ? "Evidence accepted" : "Evidence needed"}</small></summary><p>{gate.deliverable}</p><p><strong>Review scope:</strong> {gate.owner}</p><p><strong>Baseline:</strong> {gate.baselineGate ? "Implemented check; signed evidence still required." : "Not met in this snapshot."}</p></details>)}</div>
          <div className={styles.actions}><a href={`${SOURCE}/docs/mainnet/gate-status.json`} className="jg-button jg-button-secondary">Read the source snapshot ↗</a><a href={`${SOURCE}/docs/mainnet/REVIEW_PACK.md`} className="jg-button jg-button-secondary">Open the full review pack ↗</a></div>
        </section>

        <section className={styles.closing}><span className="jg-eyebrow">Progress is a reproducible artifact</span><h2>A mismatch is useful.<br />An unanswered question is a place to start.</h2><p>Contributions are judged by the quality of the evidence. Compensation is never tied to a clean report; no tokens or financial rewards are promised for joining.</p><a href={REBUILD_FORM} className="jg-button jg-button-primary">Share your first result ↗</a></section>
      </main>

      <footer className={styles.footer}><Link href="/">← Junction Generator</Link><div><Link href="/community">Community</Link><a href={`${SOURCE}/SECURITY.md`}>Security policy</a><a href={`${SOURCE}/docs/public/JGC_INDEPENDENT_REVIEW_PROGRAM.md`}>Program one-pager</a></div></footer>
    </div>
  );
}
