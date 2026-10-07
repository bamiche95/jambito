import type { MetadataRoute } from "next";
import {
  getFeaturedCombos,
  examNameToSlug,
  slugify,
} from "@/lib/catalog";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://jambito.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/cbt`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/contact`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/profile`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.6 },
  ];

  const questionRoutes: MetadataRoute.Sitemap = getFeaturedCombos().map((c) => ({
    url: `${SITE_URL}/${examNameToSlug(c.exam)}/${slugify(c.subject)}/${c.year}`,
    lastModified: new Date(),
    changeFrequency: "yearly",
    priority: 0.7,
  }));

  return [...staticRoutes, ...questionRoutes];
}
