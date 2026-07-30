import type { Metadata } from "next";
import localFont from "next/font/local";
import { WalletProvider } from "@/components/WalletProvider";
import "./globals.css";

const outfit = localFont({
  src: "./fonts/Outfit-Variable.ttf",
  variable: "--font-outfit",
  weight: "100 900",
  display: "swap",
});

const jetbrainsMono = localFont({
  src: "./fonts/JetBrainsMono-Variable.ttf",
  variable: "--font-jetbrains-mono",
  weight: "100 800",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://junctiongenerator.net"),
  title: "Junction Generator | Make Mining Useful",
  description: "Junction Generator is building a community-owned Proof-of-Useful-Compute network where everyday devices contribute verifiable local AI inference.",
  keywords: ["Junction Generator", "JGC", "Proof of Useful Compute", "PoUC", "post-quantum blockchain", "quantum ready", "ML-DSA", "useful compute", "verifiable inference", "Layer-1 blockchain", "AI mining", "OSCRP", "decentralized compute"],
  alternates: {
    canonical: "/",
    types: { "application/rss+xml": "/feed.xml" },
  },
  openGraph: {
    siteName: "Junction Generator",
    type: "website",
    url: "/",
    title: "Junction Generator | Make Mining Useful",
    description: "A community-owned network turning local AI inference into independently verifiable useful compute.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Junction Generator | Make Mining Useful",
    description: "A community-owned network turning local AI inference into independently verifiable useful compute.",
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
        {/* Cloudflare Web Analytics — set NEXT_PUBLIC_CF_BEACON_TOKEN to enable */}
        {process.env.NEXT_PUBLIC_CF_BEACON_TOKEN && (
          <script
            defer
            src="https://static.cloudflareinsights.com/beacon.min.js"
            data-cf-beacon={`{"token": "${process.env.NEXT_PUBLIC_CF_BEACON_TOKEN}"}`}
          />
        )}
      </head>
      <body style={{ margin: 0, padding: 0, backgroundColor: "var(--bg-space)", color: "var(--text-primary)" }}>
        <WalletProvider>
          {children}
        </WalletProvider>
      </body>
    </html>
  );
}
