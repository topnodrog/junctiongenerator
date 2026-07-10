import type { Metadata } from "next";
import Link from "next/link";
import { BLOG_POSTS } from "@/lib/blogPosts";

export const metadata: Metadata = {
  title: "Blog | Junction Generator",
  description: "Technical writing on Proof-of-Useful-Compute, verifiable AI inference, crypto security, and the JGC protocol.",
  alternates: { canonical: "/blog", types: { "application/rss+xml": "/feed.xml" } },
  openGraph: {
    title: "Junction Generator Blog",
    description: "Technical writing on Proof-of-Useful-Compute, verifiable AI inference, crypto security, and the JGC protocol.",
    url: "/blog",
    type: "website",
  },
};

export default function BlogIndexPage() {
  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "120px 24px 80px" }}>
      <div style={{ marginBottom: "12px" }}>
        <Link href="/" className="footer-link" style={{ display: "inline-block", fontSize: "14px" }}>← Back to Home</Link>
      </div>
      <div style={{ textAlign: "center", marginBottom: "48px" }}>
        <h1 className="text-gradient-cyber" style={{ fontSize: "42px", fontWeight: 900, marginBottom: "12px" }}>
          Junction Generator Blog
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "16px", maxWidth: "500px", margin: "0 auto" }}>
          Technical writing on Proof-of-Useful-Compute, verifiable inference, and the JGC protocol
        </p>
      </div>

      <div style={{ display: "grid", gap: "24px" }}>
        {BLOG_POSTS.map((post) => (
          <article
            key={post.slug}
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--glass-border)",
              borderRadius: 16,
              padding: "32px",
            }}
          >
            <div style={{ display: "flex", gap: "12px", marginBottom: "14px", alignItems: "center" }}>
              <span style={{ fontSize: "11px", color: "var(--color-cyan)", background: "rgba(0,242,254,0.08)", padding: "3px 10px", borderRadius: 100, fontWeight: 600, border: "1px solid rgba(0,242,254,0.15)" }}>
                {post.readTime}
              </span>
              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{post.date}</span>
            </div>
            <h2 style={{ fontSize: "22px", fontWeight: 800, marginBottom: "10px", fontFamily: "var(--font-display)", lineHeight: 1.3 }}>
              <Link href={`/blog/${post.slug}`} style={{ color: "var(--text-primary)", textDecoration: "none" }}>
                {post.title}
              </Link>
            </h2>
            <p style={{ color: "var(--text-secondary)", fontSize: "15px", marginBottom: "16px", lineHeight: 1.6 }}>
              {post.excerpt}
            </p>
            <Link href={`/blog/${post.slug}`} className="footer-link" style={{ fontSize: "14px", fontWeight: 600 }}>
              Read the full post →
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}
