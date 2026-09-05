import type { Metadata } from "next";
import Link from "next/link";
import CommunityJoin from "@/components/CommunityJoin";
import ActivationCheckIn from "@/components/ActivationCheckIn";
import CommunityScoreboard from "@/components/CommunityScoreboard";
import SectionBoundary from "@/components/SectionBoundary";

export const metadata: Metadata = {
  title: "Join the JG Founding Community",
  description: "Help turn ordinary computing power into useful, verifiable AI work. Join as a builder, researcher, operator, connector, or supporter.",
};

const DISCORD_URL =
  process.env.NEXT_PUBLIC_DISCORD_INVITE_URL || "https://discord.gg/aPvEqe2wKH";

const ACTIONS = [
  ["01", "Introduce yourself", "Say what you know, what you want to learn, and which part of useful compute interests you."],
  ["02", "Join the Weekly Junction", "See the honest build update, a live technical discussion, member work, and the week’s open tasks."],
  ["03", "Make one contribution", "Review an artifact, test an assumption, share a tracked invitation, or offer a skill or introduction."],
];

const ROLES = [
  ["Explorer", "Learning and asking useful questions."],
  ["Builder", "Writing, reviewing, testing, or documenting code."],
  ["Researcher", "Working on verification, AI inference, economics, or safety."],
  ["Operator Candidate", "Preparing to run a node when safe testing opens."],
  ["Connector", "Introducing collaborators, communities, customers, or funders."],
  ["Sponsor", "Funding a concrete event, challenge, field note, or milestone."],
  ["Founding Contributor", "Repeatedly helping the community move forward."],
];

export default function CommunityPage() {
  return (
    <main className="jg-community-page">
      <nav className="jg-simple-nav">
        <Link href="/" className="jg-brand"><span className="jg-mark">JG</span><span><strong>Junction Generator</strong><small>Founding community</small></span></Link>
        <div><a href="#activate">How activation works</a><a href="#scoreboard">Scoreboard</a><a href="#support">Support</a></div>
      </nav>

      <section className="jg-community-hero">
        <div>
          <span className="jg-kicker"><span />90-day founding cohort · public JGTC pilot</span>
          <h1>Help turn ordinary computing power into <span>useful, verifiable AI work.</span></h1>
          <p>Junction Generator is bringing together the careful builders, researchers, operators, storytellers, connectors, and supporters needed to make useful compute real.</p>
          <div className="jg-actions">
            <a className="jg-button jg-button-primary" href={DISCORD_URL} target="_blank" rel="noopener noreferrer">Join the Discord</a>
            <a className="jg-button jg-button-secondary" href="#activate">See the three-minute path</a>
          </div>
          <p className="jg-trust-note">No token sale. No public mainnet claim. Roles and recognition carry no promise of financial reward.</p>
        </div>
        <aside className="jg-goal-card">
          <span>90-day clear goal</span>
          <strong>500</strong><p>activated members</p>
          <strong>$25k</strong><p>received or contractually committed</p>
          <small>50% of received funding returns to the growth loop.</small>
        </aside>
      </section>

      <section id="join" className="jg-community-join-shell"><SectionBoundary label="Community signup"><CommunityJoin /></SectionBoundary></section>

      <section id="activate" className="jg-activation-section">
        <div className="jg-section-heading"><span className="jg-eyebrow">Join + one action</span><h2>A signup is a beginning, not the goal.</h2><p>You become an activated member by completing one meaningful action within seven days.</p></div>
        <div className="jg-activation-grid">
          {ACTIONS.map(([number, title, body]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{body}</p></article>)}
        </div>
        <SectionBoundary label="Community check-in"><ActivationCheckIn /></SectionBoundary>
      </section>

      <section className="jg-role-section">
        <div className="jg-section-heading"><span className="jg-eyebrow">Recognition follows behavior</span><h2>Choose how you want to matter.</h2></div>
        <div className="jg-role-grid">{ROLES.map(([role, body]) => <article key={role}><h3>{role}</h3><p>{body}</p></article>)}</div>
      </section>

      <div id="scoreboard"><SectionBoundary label="Community scoreboard"><CommunityScoreboard /></SectionBoundary></div>

      <section id="support" className="jg-funding-ladder">
        <div className="jg-section-heading"><span className="jg-eyebrow">Support at the right level</span><h2>Start with the action that fits.</h2><p>Everyone gets a useful next step. Funding conversations stay distinct and truthful.</p></div>
        <div className="jg-funding-grid">
          <article><span>Free</span><h3>Share or contribute</h3><p>Help with code, research, testing, storytelling, or one thoughtful introduction.</p><a href="https://github.com/topnodrog/junctiongenerator" target="_blank" rel="noopener noreferrer">Explore the code →</a></article>
          <article><span>Community</span><h3>Back the experiment</h3><p>Make a one-time contribution or ask about recurring support.</p><a href="mailto:james_gordon@junctiongenerator.net?subject=Supporting%20Junction%20Generator">Discuss support →</a></article>
          <article><span>Partner</span><h3>Sponsor useful work</h3><p>Sponsor a Weekly Junction, contributor challenge, field note, demo, or research milestone.</p><a href="mailto:james_gordon@junctiongenerator.net?subject=JG%20sponsorship%20or%20grant">Sponsor or grant →</a></article>
          <article><span>Client</span><h3>Hire the builder</h3><p>Commission a website, AI assistant, automation, or focused technical engagement that sustains JG.</p><a href="mailto:james_gordon@junctiongenerator.net?subject=Project%20inquiry%20from%20the%20JG%20community">Start a project →</a></article>
          <article><span>Aligned capital</span><h3>Fund a milestone</h3><p>Grantmakers and investors can discuss a defined milestone when mission and expectations align.</p><a href="mailto:james_gordon@junctiongenerator.net?subject=JG%20milestone%20funding">Discuss alignment →</a></article>
        </div>
      </section>

      <footer className="jg-community-footer"><p>Early, valueless JGTC public pilot. No JGC mainnet is deployed.</p><Link href="/">Return to Junction Generator</Link></footer>
    </main>
  );
}
