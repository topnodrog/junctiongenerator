import type { Metadata } from "next";
import Link from "next/link";
import TestnetDashboard from "@/components/TestnetDashboard";

export const metadata: Metadata = {
  title: "JGC Public Testnet Explorer | Junction Generator",
  description: "Live JGC testnet blocks, network health, participation records, balances, and valueless test coins.",
};

export default function TestnetPage() {
  return (
    <div className="jg-testnet-page">
      <header className="jg-simple-nav">
        <Link href="/" className="jg-brand" aria-label="Junction Generator home">
          <span className="jg-mark" aria-hidden="true">JG</span>
          <span><strong>JGC Testnet</strong><small>Live pilot explorer</small></span>
        </Link>
        <div><Link href="/">Project home</Link><Link href="/community">Community</Link><a href="https://github.com/topnodrog/junctiongenerator/tree/main/packages/jgc-node/docs/RUN-A-NODE.md">Run a node</a></div>
      </header>
      <main>
        <section className="jg-testnet-hero">
          <span className="jg-eyebrow">Valueless public pilot · real chain records</span>
          <h1>The testnet is where participation becomes <span>evidence.</span></h1>
          <p>Watch blocks arrive, inspect network health, fund a test wallet, and see signed participant identities accumulate their share of each test epoch.</p>
        </section>
        <TestnetDashboard />
      </main>
      <footer className="jg-community-footer"><span>Junction Generator · JGC public testnet</span><Link href="/">Back to the project</Link></footer>
    </div>
  );
}
