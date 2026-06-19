import type { Metadata } from "next";
import { Outfit, JetBrains_Mono } from "next/font/google";
import { WalletProvider } from "@/components/WalletProvider";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://junctiongenerator.net"),
  title: "Junction Generator | Proof-of-Useful-Compute Layer-1 Blockchain",
  description: "Junction Generator is a Layer-1 blockchain where miners earn $JGC by running verifiable AI inference. Proof-of-Useful-Compute (PoUC) replaces hash puzzles with real AI workloads — testnet live.",
  keywords: ["Junction Generator", "JGC", "Proof of Useful Compute", "PoUC", "useful compute", "verifiable inference", "Layer-1 blockchain", "AI mining", "OSCRP", "decentralized compute"],
  alternates: {
    canonical: "/",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${outfit.variable} ${jetbrainsMono.variable} h-full antialiased`}>
      <head>
        <meta name="bitmedia-site-verification" content="de4d905aa1e9998048618692a23f7f2b" />
      </head>
      <body style={{ margin: 0, padding: 0, backgroundColor: "var(--bg-space)", color: "var(--text-primary)" }}>
        <WalletProvider>
          {children}
        </WalletProvider>
      </body>
    </html>
  );
}
