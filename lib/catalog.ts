/**
 * Exam / subject / year catalog used to power the landing-page subject picker,
 * the dynamic SEO routes, and the sitemap without hardcoding values everywhere.
 *
 * Values are aligned with the MyQuest provider API (exam names and subject
 * identifiers come back lowercase with spaces, e.g. "use of english").
 */

export const EXAMS = ["JAMB", "WAEC", "POSTUTME"] as const;

export const YEARS = [
  "2025",
  "2024",
  "2023",
  "2022",
  "2021",
  "2020",
  "2019",
  "2018",
  "2017",
  "2016",
  "2015",
  "2014",
  "2013",
  "2012",
  "2011",
  "2010",
  "2009",
  "2008",
  "2007",
  "2006",
  "2005",
  "2004",
  "2003",
  "2002",
  "2001",
  "2000",
  "1999",
];

/** Most-searched subjects, using MyQuest-compatible identifiers. */
export const POPULAR_SUBJECTS = [
  "physics",
  "chemistry",
  "biology",
  "mathematics",
  "use of english",
  "government",
  "economics",
  "commerce",
  "accounting",
  "literature in english",
];

const EXAM_SLUG_TO_NAME: Record<string, string> = {
  jamb: "JAMB",
  waec: "WAEC",
  postutme: "POSTUTME",
  "post-utme": "POSTUTME",
  "post utme": "POSTUTME",
  gst: "GST",
};

export function examNameToSlug(name: string): string {
  return String(name ?? "").toLowerCase().trim().replace(/\s+/g, "-");
}

export function examSlugToName(slug: string): string {
  const key = String(slug ?? "").toLowerCase().trim();
  return EXAM_SLUG_TO_NAME[key] ?? key.toUpperCase();
}

export function slugify(value: string): string {
  return String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

export function deslugify(slug: string): string {
  return String(slug ?? "").toLowerCase().replace(/-/g, " ").trim();
}

export function titleCase(value: string): string {
  return String(value ?? "").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Friendly display labels for the known exam boards (falls back to the raw value). */
const EXAM_LABELS: Record<string, string> = {
  JAMB: "UTME (JAMB)",
  WAEC: "WASSCE (WAEC)",
  POSTUTME: "POST-UTME",
  GST: "GST",
};

export function examLabel(name: string): string {
  const key = String(name ?? "").trim().toUpperCase();
  return EXAM_LABELS[key] ?? key;
}

/** Builds the CBT practice URL for a given exam / subject / year. */
export function buildCbtHref(exam: string, subject: string, year: string): string {
  const params = new URLSearchParams({
    exam: examNameToSlug(exam),
    subject: slugify(subject),
    year: String(year),
  });
  return `/cbt?${params.toString()}`;
}

export interface Combo {
  exam: string;
  subject: string;
  year: string;
}

/**
 * A curated, deterministic set of exam/subject/year combinations used to
 * generate the sitemap and featured practice links. Kept small to avoid
 * hitting the provider API at build time.
 */
export function getFeaturedCombos(): Combo[] {
  const combos: Combo[] = [];
  const exams = ["JAMB", "WAEC"];
  const recentYears = YEARS.slice(0, 6); // 2025..2020
  for (const exam of exams) {
    for (const year of recentYears) {
      for (const subject of POPULAR_SUBJECTS.slice(0, 6)) {
        combos.push({ exam, subject, year });
      }
    }
  }
  return combos;
}
