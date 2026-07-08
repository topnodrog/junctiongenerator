import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BLOG_POSTS, getPost } from "@/lib/blogPosts";
import BlogPostBody from "@/components/BlogPostBody";

export function generateStaticParams() {
  return BLOG_POSTS.map((post) => ({ slug: post.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};
  return {
    title: `${post.title} | Junction Generator`,
    description: post.excerpt,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      title: post.title,
      description: post.excerpt,
      url: `/blog/${post.slug}`,
      type: "article",
      publishedTime: post.dateISO,
      siteName: "Junction Generator",
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.excerpt,
    },
  };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt,
    datePublished: post.dateISO,
    author: { "@type": "Person", name: "James Gordon", url: "https://junctiongenerator.net" },
    publisher: { "@type": "Organization", name: "Junction Generator", url: "https://junctiongenerator.net" },
    mainEntityOfPage: `https://junctiongenerator.net/blog/${post.slug}`,
  };

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "120px 24px 80px" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div style={{ marginBottom: "24px", display: "flex", gap: "16px" }}>
        <Link href="/blog" className="footer-link" style={{ fontSize: "14px" }}>← All posts</Link>
        <Link href="/" className="footer-link" style={{ fontSize: "14px" }}>Home</Link>
      </div>

      <article
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--glass-border)",
          borderRadius: 16,
          padding: "36px",
        }}
      >
        <div style={{ display: "flex", gap: "12px", marginBottom: "14px", alignItems: "center" }}>
          <span style={{ fontSize: "11px", color: "var(--color-cyan)", background: "rgba(0,242,254,0.08)", padding: "3px 10px", borderRadius: 100, fontWeight: 600, border: "1px solid rgba(0,242,254,0.15)" }}>
            {post.readTime}
          </span>
          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{post.date}</span>
        </div>
        <h1 style={{ fontSize: "30px", fontWeight: 800, marginBottom: "10px", fontFamily: "var(--font-display)", lineHeight: 1.25 }}>
          {post.title}
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "15px", marginBottom: "24px", lineHeight: 1.6, borderBottom: "1px solid var(--glass-border)", paddingBottom: "24px" }}>
          {post.excerpt}
        </p>
        <BlogPostBody content={post.content} />
      </article>

      {/* Post-footer CTAs */}
      <div style={{ marginTop: "32px", display: "grid", gap: "16px" }}>
        <div className="glass-container" style={{ padding: "24px", textAlign: "center" }}>
          <p style={{ color: "var(--text-secondary)", fontSize: "14px", marginBottom: "12px", lineHeight: 1.6 }}>
            Enjoyed this? Get new posts on Proof-of-Useful-Compute and crypto security in your inbox.
          </p>
          <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/#newsletter" className="btn-glow-purple" style={{ textDecoration: "none", fontSize: "13px" }}>
              Join the Newsletter
            </Link>
            <Link href="/#partners" className="btn-glow-cyan" style={{ textDecoration: "none", fontSize: "13px" }}>
              Getting Started with Crypto?
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
