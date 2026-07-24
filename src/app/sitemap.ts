import type { MetadataRoute } from "next";
import { BLOG_POSTS } from "@/lib/blogPosts";

const SITE = "https://junctiongenerator.net";

export default function sitemap(): MetadataRoute.Sitemap {
  const posts: MetadataRoute.Sitemap = BLOG_POSTS.map((post) => ({
    url: `${SITE}/blog/${post.slug}`,
    lastModified: new Date(post.dateISO),
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  return [
    {
      url: SITE,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${SITE}/blog`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${SITE}/community`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${SITE}/whitepaper`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    ...posts,
  ];
}
