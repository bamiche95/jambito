import type { MetadataRoute } from "next";
import {
  getFeaturedCombos,
  examNameToSlug,
  slugify,
} from "@/lib/catalog";
import {
  getSyllabusExamSlugs,
  getSyllabusSubjects,
  getSyllabusTopicRoutes,
} from "@/lib/syllabus";
import { SITE_URL } from "@/lib/site";

/**
 * Sitemap.
 *
 * The syllabus tree adds ~1,260 URLs (index + 2 exam boards + 86 subjects + 1,171
 * topics) on top of the existing routes. Topic entries come last on purpose: they
 * are the long-tail pages, so the index and subject URLs still get crawled first
 * if a consumer truncates a long sitemap.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/cbt`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/practice`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/syllabus`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_URL}/contact`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/profile`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
  ];

  const questionRoutes: MetadataRoute.Sitemap = getFeaturedCombos().map((c) => ({
    url: `${SITE_URL}/${examNameToSlug(c.exam)}/${slugify(c.subject)}/${c.year}`,
    lastModified: now,
    changeFrequency: "yearly",
    priority: 0.7,
  }));

  const syllabusRoutes: MetadataRoute.Sitemap = [
    ...getSyllabusExamSlugs().map((exam) => ({
      url: `${SITE_URL}/syllabus/${exam}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    ...getSyllabusSubjects().map((subject) => ({
      url: `${SITE_URL}/syllabus/${subject.examSlug}/${subject.slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    ...getSyllabusTopicRoutes().map(({ topic }) => ({
      url: `${SITE_URL}${topic.href}`,
      lastModified: now,
      changeFrequency: "yearly" as const,
      priority: 0.6,
    })),
  ];

  return [...staticRoutes, ...questionRoutes, ...syllabusRoutes];
}
