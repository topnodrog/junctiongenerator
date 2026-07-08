import { BLOG_POSTS } from "@/lib/blogPosts";

const SITE = "https://junctiongenerator.net";

export const dynamic = "force-static";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function GET() {
  const items = BLOG_POSTS.map(
    (post) => `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${SITE}/blog/${post.slug}</link>
      <guid>${SITE}/blog/${post.slug}</guid>
      <pubDate>${new Date(post.dateISO).toUTCString()}</pubDate>
      <description>${escapeXml(post.excerpt)}</description>
    </item>`
  ).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Junction Generator Blog</title>
    <link>${SITE}/blog</link>
    <description>Technical writing on Proof-of-Useful-Compute, verifiable AI inference, crypto security, and the JGC protocol.</description>
    <language>en-us</language>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
