import ConnectButton from "@/components/ConnectButton";
import VibePlayground from "@/components/VibePlayground";
import MiningTelemetry from "@/components/MiningTelemetry";
import AgentConsole from "@/components/AgentConsole";
import OSCRPCalculator from "@/components/OSCRPCalculator";
import BackTheProject from "@/components/BackTheProject";
import NewsletterSignup from "@/components/NewsletterSignup";
import NodeStatusPanel from "@/components/NodeStatusPanel";
import HireMePopup from "@/components/HireMePopup";
import PartnerLinks from "@/components/PartnerLinks";
import Link from "next/link";

const PROOF_POINTS = [
  { value: "244", label: "node tests passing" },
  { value: "31", label: "blocks synced in a two-node demo" },
  { value: "10", label: "blocks per historical audit window" },
  { value: "3", label: "validators per audit committee" },
];

const NETWORK_STEPS = [
  {
    number: "01",
    title: "Contribute useful work",
    body: "Ordinary computers run local AI inference instead of wasting energy on meaningless hash puzzles.",
  },
  {
    number: "02",
    title: "Verify what happened",
    body: "Future block randomness selects historical claims for independent, signed committee review.",
  },
  {
    number: "03",
    title: "Reward honest participation",
    body: "The intended network distributes JGC according to verified contribution, with economic penalties activated only when they are safe.",
  },
];

const COMMUNITY_PATHS = [
  {
    tag: "No code required",
    title: "Join the founding community",
    body: "Choose a role, complete one meaningful action, and help shape the first 90 days.",
    href: "/community",
    cta: "Join the community",
  },
  {
    tag: "For builders",
    title: "Help shape the protocol",
    body: "Review the open implementation, test assumptions, improve the node, or help solve verifiable inference.",
    href: "https://github.com/topnodrog/junctiongenerator",
    cta: "Explore on GitHub",
    external: true,
  },
  {
    tag: "Early operators",
    title: "Prepare to run a node",
    body: "The public network is not open yet. Read the runner guide now and be ready for the first safe test cohort.",
    href: "https://github.com/topnodrog/junctiongenerator/tree/junctioning/packages/jgc-node",
    cta: "Read the node guide",
    external: true,
  },
  {
    tag: "Keep it moving",
    title: "Back the experiment",
    body: "Fund development directly, share the project with one thoughtful person, or hire the builder for paid work.",
    href: "#support",
    cta: "Choose how to help",
  },
];

const STATUS_ITEMS = [
  { state: "working", title: "Local inference", body: "Gemma runs through Ollama on a contributor's own machine." },
  { state: "working", title: "Post-quantum node path", body: "ML-DSA signatures, SHA3-256 checksums, and transparent proof foundations are active in the private node." },
  { state: "working", title: "Historical audit consensus", body: "Signed verdict evidence survives mining, peer sync, restart, and chain reorganization." },
  { state: "next", title: "Public testnet", body: "Waiting on peer hardening, model pinning, real-network soak tests, and safe node packaging." },
  { state: "research", title: "Cross-hardware verification", body: "The central research problem: proving valid work across different processors, runtimes, and quantizations." },
  { state: "later", title: "Economic enforcement", body: "Rewards and slashing stay off until validator identity, bonds, and stake snapshots belong to consensus." },
];

export default function Home() {
  return (
    <>
      <HireMePopup />
      <header className="jg-nav">
        <a href="#top" className="jg-brand" aria-label="Junction Generator home">
          <span className="jg-mark" aria-hidden="true">JG</span>
          <span><strong>Junction Generator</strong><small>Proof of useful compute</small></span>
        </a>
        <nav className="jg-nav-links" aria-label="Primary navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#status">Progress</a>
          <Link href="/community">Join</Link>
          <Link href="/blog">Field notes</Link>
          <a href="#hire">Hire James</a>
        </nav>
        <div className="jg-wallet"><ConnectButton /></div>
      </header>

      <main id="top" className="jg-page">
        <section className="jg-hero" aria-labelledby="hero-title">
          <div className="jg-hero-copy">
            <div className="jg-kicker"><span aria-hidden="true" />Local/private testnet • building in public</div>
            <h1 id="hero-title">What if mining <span>did useful work?</span></h1>
            <p className="jg-hero-lede">
              Junction Generator is building a post-quantum-oriented network where everyday
              devices contribute verifiable local AI inference—and honest participants share
              in the value they help create.
            </p>
            <div className="jg-actions">
              <Link href="/community" className="jg-button jg-button-primary">Join the JG Founding Community</Link>
              <a href="#status" className="jg-button jg-button-secondary">See what actually works</a>
            </div>
            <p className="jg-trust-note">No token sale. No public mainnet claims. The code, limits, and progress are open for inspection.</p>
          </div>
          <div className="jg-system-map" aria-label="Junction Generator network loop">
            <div className="jg-map-label">The useful-compute loop</div>
            <div className="jg-map-orbit">
              <div className="jg-map-core"><span>JGC</span><small>verified value</small></div>
              <div className="jg-map-node jg-map-node-a"><b>Devices</b><small>local AI work</small></div>
              <div className="jg-map-node jg-map-node-b"><b>Junctioning</b><small>efficient inference</small></div>
              <div className="jg-map-node jg-map-node-c"><b>Audits</b><small>signed evidence</small></div>
              <div className="jg-map-node jg-map-node-d"><b>Community</b><small>shared progress</small></div>
            </div>
            <p>Consumer hardware → useful inference → independent verification → network rewards</p>
          </div>
        </section>

        <section className="jg-proof-bar" aria-label="Current project evidence">
          {PROOF_POINTS.map((point) => <div key={point.label}><strong>{point.value}</strong><span>{point.label}</span></div>)}
        </section>

        <section id="how-it-works" className="jg-section jg-explainer">
          <div className="jg-section-heading">
            <span className="jg-eyebrow">A different bargain</span>
            <h2>Compute should create value, not just consume energy.</h2>
            <p>Proof of Useful Compute replaces the race for a meaningless hash with work people can use—then makes that work auditable before it earns trust.</p>
          </div>
          <div className="jg-step-grid">
            {NETWORK_STEPS.map((step) => (
              <article key={step.number} className="jg-step"><span>{step.number}</span><h3>{step.title}</h3><p>{step.body}</p></article>
            ))}
          </div>
        </section>

        <section id="status" className="jg-section">
          <div className="jg-section-heading jg-heading-row">
            <div><span className="jg-eyebrow">The honest state of the build</span><h2>Working foundations. Hard problems still open.</h2></div>
            <Link href="/whitepaper" className="jg-text-link">Read the concept paper <span>↗</span></Link>
          </div>
          <div className="jg-status-grid">
            {STATUS_ITEMS.map((item) => (
              <article key={item.title} className="jg-status-card">
                <div className={`jg-status-pill ${item.state}`}>{item.state === "working" ? "Working now" : item.state === "next" ? "Next gate" : item.state === "research" ? "Active research" : "Later"}</div>
                <h3>{item.title}</h3><p>{item.body}</p>
              </article>
            ))}
          </div>
          <div className="jg-node-panel">
            <div><span className="jg-eyebrow">A real signal, when a node is running</span><h3>Local node status</h3><p>This panel reads a node on your own machine. Offline is an honest state—not simulated activity.</p></div>
            <NodeStatusPanel />
          </div>
        </section>

        <section id="community" className="jg-section jg-community">
          <div className="jg-community-intro">
            <span className="jg-eyebrow">A network starts with people</span>
            <h2>You do not need a mining rig—or permission—to matter here.</h2>
            <p>Junction Generator needs careful critics, curious newcomers, researchers, node operators, storytellers, and people willing to introduce the idea to one more person. Join the founding community, then pick the doorway that fits you.</p>
          </div>
          <div className="jg-community-grid">
            {COMMUNITY_PATHS.map((path) => (
              <a key={path.title} href={path.href} className="jg-community-card" target={path.external ? "_blank" : undefined} rel={path.external ? "noopener noreferrer" : undefined}>
                <span>{path.tag}</span><h3>{path.title}</h3><p>{path.body}</p><b>{path.cta} →</b>
              </a>
            ))}
          </div>
        </section>

        <section id="newsletter" className="jg-section jg-newsletter">
          <div><span className="jg-eyebrow">Field notes, not hype</span><h2>Follow the experiment from the beginning.</h2><p>Occasional progress reports, research decisions, and invitations to early tests.</p></div>
          <NewsletterSignup />
        </section>

        <section id="lab" className="jg-section">
          <div className="jg-section-heading">
            <span className="jg-eyebrow">Open prototype lab</span><h2>Explore the ideas behind the network.</h2>
            <p>These interactive demonstrations show the direction of travel. Simulators are labeled as simulations; they are not evidence of a public network.</p>
          </div>
          <div className="jg-lab-intro">
            <div><strong>Prompt → JGC node → local Gemma → reviewed draft</strong><p>The contract playground currently produces constrained browser templates. The node already supports local Gemma inference; connecting the two safely is a future milestone.</p></div>
            <Link href="/blog/becoming-quantum-ready" className="jg-text-link">Read the quantum-ready brief <span>↗</span></Link>
          </div>
          <div className="section-grid jg-lab-grid">
            <div className="jg-span-two"><VibePlayground /></div>
            <div><MiningTelemetry /></div>
            <div><OSCRPCalculator /></div>
            <div className="jg-span-two"><AgentConsole /></div>
          </div>
        </section>

        <section id="support" className="jg-section jg-support-grid">
          <div><BackTheProject /></div><div id="partners"><PartnerLinks /></div>
        </section>

        <section id="hire" className="jg-hire">
          <div className="jg-hire-copy">
            <span className="jg-eyebrow">Fund the work by hiring the builder</span>
            <h2>Need a clear website or a useful AI assistant?</h2>
            <p>James Gordon is available for focused website builds, practical business automation, and ongoing AI-agent support. Paid client work directly sustains Junction Generator&apos;s development.</p>
            <div className="jg-service-list"><span>Websites that explain and convert</span><span>Business AI assistants</span><span>Monthly maintenance and support</span></div>
          </div>
          <div className="jg-hire-action">
            <p>Tell me what you need. A short description is enough to start.</p>
            <a href="mailto:james_gordon@junctiongenerator.net?subject=Project%20inquiry%20from%20Junction%20Generator" className="jg-button jg-button-primary">Start a conversation</a>
            <small>james_gordon@junctiongenerator.net</small>
          </div>
        </section>
      </main>

      <footer className="jg-footer">
        <div>
          <a href="#top" className="jg-brand"><span className="jg-mark" aria-hidden="true">JG</span><span><strong>Junction Generator</strong><small>Useful compute, independently verified.</small></span></a>
          <p>Local/private testnet software. No public JGC mainnet is currently deployed.</p>
        </div>
        <nav aria-label="Footer navigation"><Link href="/community">Join community</Link><Link href="/whitepaper">Concept paper</Link><Link href="/blog">Field notes</Link><a href="https://github.com/topnodrog/junctiongenerator" target="_blank" rel="noopener noreferrer">GitHub</a><a href="#hire">Hire James</a></nav>
        <span>© 2026 Junction Generator</span>
      </footer>
    </>
  );
}
