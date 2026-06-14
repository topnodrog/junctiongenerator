import type { Metadata } from "next";
import { Outfit, JetBrains_Mono } from "next/font/google";
import { Providers } from "./providers";
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
  title: "Junction Generator | Mined-Compute Web3 Factory & Self-Improving Multi-Agent Ecosystem",
  description: "Junction Generator is the world's first AI-operated Web3 incubator. Compile smart contracts, secure the grid via Proof-of-Useful-Compute ($JGC), and join the Open-Source Contributor Reward Protocol (OSCRP).",
  keywords: ["Junction Generator", "JGT", "JGC", "Proof of Useful Compute", "Vibe Coding", "AI Web3 Factory", "Agentic Startup", "EVM Compiling"],
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
      <body style={{ margin: 0, padding: 0, backgroundColor: "var(--bg-space)", color: "var(--text-primary)" }}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
