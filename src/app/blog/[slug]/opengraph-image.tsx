import { ImageResponse } from "next/og";
import { BLOG_POSTS, getPost } from "@/lib/blogPosts";

export const alt = "Junction Generator blog post";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export function generateStaticParams() {
  return BLOG_POSTS.map((post) => ({ slug: post.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(slug);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          background: "linear-gradient(135deg, #030209 0%, #0d0a24 60%, #1a0d33 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "12px",
              background: "linear-gradient(135deg, #00f2fe, #9b51e0)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "26px",
              fontWeight: 800,
              color: "#030209",
            }}
          >
            JG
          </div>
          <div style={{ fontSize: "30px", fontWeight: 700, color: "#8b8aa0" }}>Junction Generator Blog</div>
        </div>

        <div style={{ display: "flex", fontSize: "58px", fontWeight: 800, lineHeight: 1.15, letterSpacing: "-0.02em" }}>
          {post?.title ?? "Junction Generator"}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: "24px", color: "#00f2fe" }}>Proof-of-Useful-Compute • verifiable AI inference</div>
          <div style={{ fontSize: "24px", color: "#8b8aa0" }}>junctiongenerator.net</div>
        </div>
      </div>
    ),
    { ...size }
  );
}
