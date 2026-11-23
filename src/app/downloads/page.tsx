import type { Metadata } from "next";
import Link from "next/link";
import styles from "./downloads.module.css";

const release = "https://github.com/topnodrog/junctiongenerator/releases";
const tag = "jgtc-volunteer-2026-11-22";
const zip = `${release}/download/${tag}/JGTC-Volunteer-Windows-x64-2026-11-22.zip`;

export const metadata: Metadata = {
  title: "Node downloads | Junction Generator",
  alternates: { canonical: "/downloads" },
  openGraph: { title: "Node downloads | Junction Generator", url: "/downloads" },
  description: "Download the JGTC volunteer testnet node and wallet for Windows x64 and check JGC mainnet availability.",
};

export default function DownloadsPage() {
  return (
    <div className="jg-testnet-page">
      <header className="jg-simple-nav">
        <Link href="/" className="jg-brand" aria-label="Junction Generator home">
          <span className="jg-mark" aria-hidden="true">JG</span>
          <strong>Junction Generator</strong>
        </Link>
        <Link href="/testnet" className="jg-text-link">Testnet explorer</Link>
      </header>
      <main className={styles.downloads}>
        <h1>Node downloads</h1>
        <section className={styles.release}>
          <div>
            <h2>JGTC volunteer testnet</h2>
            <p>Run a participant node on your PC. The ZIP includes the wallet, resource controls and a daily pause schedule. Testnet coins have no monetary value.</p>
            <a className="jg-button jg-button-primary" href={zip}>Download for Windows x64 <span aria-hidden="true">↓</span></a>
            <small>ZIP · 42.5 MiB · November 22, 2026</small>
          </div>
          <div className={styles.setup}>
            <h3>Join the soak</h3>
            <ol>
              <li>Extract the entire ZIP to a folder.</li>
              <li>
                If you need a wallet, double-click <strong>Open JGTC Wallet.cmd</strong> and choose{" "}
                <strong>Create my first wallet</strong>. Write down and verify your 24 recovery words,
                set a password, and wait for <strong>Done</strong>. Keep your words and password private.
              </li>
              <li>
                Double-click <strong>Join JGTC Soak.cmd</strong>. If your existing JGTC testnet wallet
                is saved elsewhere, use <strong>Browse</strong> to select its encrypted wallet file.
                Paste the seed address from your coordinator and click <strong>Join testnet</strong>.
              </li>
              <li>
                In the terminal, unlock your wallet, choose the CPU and memory you want to share,
                and type <code>ACCEPT</code> after reviewing the system card.
              </li>
            </ol>
          </div>
          <details>
            <summary>Verify the download</summary>
            <p>Compare the ZIP’s SHA-256 checksum with this value.</p>
            <code>070877a5f6ab2dff1208dd30305829d254c87813f92f877d98de669ef76804ef</code>
            <a className="jg-text-link" href={`${release}/tag/${tag}`}>View release on GitHub ↗</a>
          </details>
        </section>
        <section className={styles.mainnet}>
          <h2>JGC mainnet</h2>
          <p>A mainnet node package will appear here when an official release is available.</p>
        </section>
      </main>
    </div>
  );
}
