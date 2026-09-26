import type { Metadata } from "next";
import Link from "next/link";
import JGTClaimFaucet from "@/components/JGTClaimFaucet";

export const metadata: Metadata = {
  title: "JGT Faucet | Junction Generator",
  description: "Review the inactive legacy JGT faucet draft and its security gates. Claims remain unavailable until the code and clean owner state are independently verified."
};

export default function JGTFaucetPage() {
  return (
    <main className="jgt-faucet-page">
      <nav className="jg-simple-nav" aria-label="JGT faucet navigation">
        <Link href="/" className="jg-brand">
          <span className="jg-mark" aria-hidden="true">JG</span>
          <span><strong>Junction Generator</strong><small>Legacy JGT faucet</small></span>
        </Link>
        <div><Link href="/community">Community</Link><a href="https://github.com/topnodrog/junctiongenerator" target="_blank" rel="noopener noreferrer">Source code</a></div>
      </nav>
      <JGTClaimFaucet
        dispenserAddress={process.env.NEXT_PUBLIC_JGT_DISPENSER_ADDRESS ?? ""}
        dispenserCodeHash={process.env.NEXT_PUBLIC_JGT_DISPENSER_CODE_HASH ?? ""}
        expectedCleanOwner={process.env.NEXT_PUBLIC_JGT_CLEAN_OWNER_ADDRESS ?? ""}
      />
      <footer className="jgt-faucet-footer">
        <p>JGT is a legacy ERC-20 on Base and is separate from the JGTC testnet and any future JGC network.</p>
        <Link href="/">Return to Junction Generator</Link>
      </footer>
    </main>
  );
}
