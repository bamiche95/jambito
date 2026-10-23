/**
 * JAMB syllabus data layer.
 *
 * The 25 JSON files in `data/syllabus/` are the official JAMB (UTME) subject
 * outlines, one file per subject. They are imported statically (not read with
 * `fs`) so the whole syllabus ships inside the server bundle and every
 * `/syllabus/**` route can be prerendered at build time.
 *
 * The source files are *not* perfectly uniform, so everything is funnelled
 * through `normalizeSyllabus()` which produces one predictable model:
 *
 *  1. Paired subjects (21 files) describe each item as
 *     `subtopics: [{ content, objective }]` → content and objective line up 1:1.
 *  2. Split subjects (Physics, PHE, Music, Principles of Accounting) describe
 *     `subtopics: string[]` plus a separate `objectives: string[]`.
 *
 * Two traps worth remembering:
 *  - `topic.id` restarts inside every section (Commerce has 60 duplicate ids),
 *    so ids are never used as React keys or anchors. Slugs + positions are.
 *  - Subject `"Yorùbá"` contains diacritics; `syllabusSlug()` folds them so the
 *    URL stays clean (`/syllabus/jamb/yoruba`).
 */
import { examNameToSlug, examSlugToName } from "@/lib/catalog";

import agriculturalScienceRaw from "@/data/syllabus/agricultural-science.json";
import arabicRaw from "@/data/syllabus/arabic.json";
import artRaw from "@/data/syllabus/art.json";
import biologyRaw from "@/data/syllabus/biology.json";
import chemistryRaw from "@/data/syllabus/chemistry.json";
import christianReligiousStudiesRaw from "@/data/syllabus/christian-religious-studies.json";
import commerceRaw from "@/data/syllabus/commerce.json";
import computerStudiesRaw from "@/data/syllabus/computer-studies.json";
import economicsRaw from "@/data/syllabus/economics.json";
import frenchRaw from "@/data/syllabus/french.json";
import geographyRaw from "@/data/syllabus/geography.json";
import governmentRaw from "@/data/syllabus/government.json";
import hausaRaw from "@/data/syllabus/hausa.json";
import historyRaw from "@/data/syllabus/history.json";
import homeEconomicsRaw from "@/data/syllabus/home-economics.json";
import igboRaw from "@/data/syllabus/igbo.json";
import islamicReligiousStudiesRaw from "@/data/syllabus/islamic-religious-studies.json";
import literatureInEnglishRaw from "@/data/syllabus/literature-in-english.json";
import mathematicsRaw from "@/data/syllabus/mathematics.json";
import musicRaw from "@/data/syllabus/music.json";
import physicalAndHealthEducationRaw from "@/data/syllabus/physical-and-health-education.json";
import physicsRaw from "@/data/syllabus/physics.json";
import principlesOfAccountingRaw from "@/data/syllabus/principles-of-accounting.json";
import useOfEnglishRaw from "@/data/syllabus/use-of-english.json";
import yorubaRaw from "@/data/syllabus/yoruba.json";

/** Raw shapes coming out of the JSON files (everything optional/defensive). */
interface RawSyllabus {
  subject?: string;
  exam?: string;
  generalObjectives?: string[];
  recommendedTexts?: string[];
  sections?: RawSection[];
}

interface RawSection {
  sectionTitle?: string;
  topics?: RawTopic[];
}

interface RawTopic {
  id?: number | string;
  title?: string;
  subtopics?: unknown[];
  objectives?: string[];
}

interface RawSubtopic {
  content?: string;
  objective?: string;
}

/* -------------------------------------------------------------------------- */
/* Normalised model used by every page/component                              */
/* -------------------------------------------------------------------------- */

/**
 * One row of the syllabus: the content that must be studied and (when the
 * source pairs them) the candidate objective that goes with it.
 */
export interface SyllabusSubtopic {
  content: string;
  /** `null` when the source only lists a bare content item. */
  objective: string | null;
}

export interface SyllabusTopic {
  /** Stable React key/anchor suffix, e.g. `3.12` (unique even when ids repeat). */
  key: string;
  /** Original JAMB id when present — display only, never a key. */
  id: number | string | null;
  slug: string;
  title: string;
  /** Contents/notes outline for this topic. */
  subtopics: SyllabusSubtopic[];
  /** Only populated for "split" subjects (Physics, Music, …). */
  objectives: string[];
  /** `/syllabus/jamb/mathematics/<slug>` */
  href: string;
}

export interface SyllabusSection {
  key: string;
  slug: string;
  title: string;
  topics: SyllabusTopic[];
}

export interface SyllabusStats {
  sections: number;
  topics: number;
  subtopics: number;
  objectives: number;
}

export interface SyllabusSubject {
  name: string;
  slug: string;
  exam: string;
  examSlug: string;
  category: SyllabusCategory;
  sections: SyllabusSection[];
  generalObjectives: string[];
  recommendedTexts: string[];
  stats: SyllabusStats;
}

/** Compact shape handed to the client-side index filter (keeps RSC payload small). */
export interface SyllabusSubjectSummary {
  name: string;
  slug: string;
  exam: string;
  examSlug: string;
  category: SyllabusCategory;
  href: string;
  sections: number;
  topics: number;
  subtopics: number;
}

export interface SyllabusTopicLocation {
  subject: SyllabusSubject;
  section: SyllabusSection;
  topic: SyllabusTopic;
  /** Previous/next topic across the whole subject (not just the section). */
  previous: SyllabusTopic | null;
  next: SyllabusTopic | null;
}

/* -------------------------------------------------------------------------- */
/* Categories                                                                 */
/* -------------------------------------------------------------------------- */

export const SYLLABUS_CATEGORIES = [
  "Sciences",
  "Arts & Humanities",
  "Social Sciences",
  "Commercial",
  "Languages",
] as const;

export type SyllabusCategory = (typeof SYLLABUS_CATEGORIES)[number];

/**
 * Editorial grouping for the index/exam pages. Manual on purpose: JAMB does not
 * publish categories, and guessing from names is brittle.
 */
const CATEGORY_BY_SUBJECT_SLUG: Record<string, SyllabusCategory> = {
  "agricultural-science": "Sciences",
  biology: "Sciences",
  chemistry: "Sciences",
  "computer-studies": "Sciences",
  mathematics: "Sciences",
  "physical-and-health-education": "Sciences",
  physics: "Sciences",

  arabic: "Languages",
  french: "Languages",
  hausa: "Languages",
  igbo: "Languages",
  "use-of-english": "Languages",
  yoruba: "Languages",

  art: "Arts & Humanities",
  "christian-religious-studies": "Arts & Humanities",
  government: "Arts & Humanities",
  history: "Arts & Humanities",
  "islamic-religious-studies": "Arts & Humanities",
  "literature-in-english": "Arts & Humanities",
  music: "Arts & Humanities",

  economics: "Social Sciences",
  geography: "Social Sciences",

  commerce: "Commercial",
  "principles-of-accounting": "Commercial",
};

/* -------------------------------------------------------------------------- */
/* Slug helpers                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Slugifies a syllabus title. Same idea as `slugify()` in `lib/catalog.ts` but
 * with Unicode folding so `Yorùbá` → `yoruba` instead of `yor-b`.
 */
export function syllabusSlug(value: string): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Normalises any exam segment (`JAMB`, `jamb`) to its canonical slug. */
export function normalizeExamSlug(value: string): string {
  return examNameToSlug(examSlugToName(value));
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values.map(cleanText).filter(Boolean);
}

/** Appends `-2`, `-3`, … when two titles slugify to the same value. */
function claimSlug(base: string, used: Set<string>, fallback: string): string {
  const root = base || fallback;
  let slug = root;
  let suffix = 2;
  while (used.has(slug)) {
    slug = `${root}-${suffix}`;
    suffix += 1;
  }
  used.add(slug);
  return slug;
}

/* -------------------------------------------------------------------------- */
/* Normalisation                                                              */
/* -------------------------------------------------------------------------- */

/** Counts the objectives attached to a topic, whichever source shape it uses. */
export function countTopicObjectives(topic: SyllabusTopic): number {
  if (topic.objectives.length > 0) return topic.objectives.length;
  return topic.subtopics.reduce(
    (total, item) => (item.objective ? total + 1 : total),
    0,
  );
}

function normalizeTopic(
  rawTopic: RawTopic,
  context: { examSlug: string; subjectSlug: string; sectionIndex: number; topicIndex: number },
  usedTopicSlugs: Set<string>,
): SyllabusTopic | null {
  const title = cleanText(rawTopic.title);
  if (!title) return null;

  const subtopics: SyllabusSubtopic[] = [];
  for (const entry of Array.isArray(rawTopic.subtopics) ? rawTopic.subtopics : []) {
    if (typeof entry === "string") {
      const content = cleanText(entry);
      if (content) subtopics.push({ content, objective: null });
      continue;
    }
    if (entry && typeof entry === "object") {
      const record = entry as RawSubtopic;
      const content = cleanText(record.content);
      const objective = cleanText(record.objective);
      if (content || objective) {
        subtopics.push({ content, objective: objective || null });
      }
    }
  }

  // Split-source subjects list objectives separately; paired subjects keep them
  // inline so we deliberately leave `objectives` empty in that case.
  const hasPairedObjectives = subtopics.some((item) => item.objective);
  const objectives = hasPairedObjectives ? [] : cleanList(rawTopic.objectives);

  const slug = claimSlug(
    syllabusSlug(title),
    usedTopicSlugs,
    `topic-${context.sectionIndex + 1}-${context.topicIndex + 1}`,
  );

  return {
    key: `${context.sectionIndex + 1}.${context.topicIndex + 1}`,
    id: rawTopic.id ?? null,
    slug,
    title,
    subtopics,
    objectives,
    href: `/syllabus/${context.examSlug}/${context.subjectSlug}/${slug}`,
  };
}

/**
 * Turns one raw JSON file into the normalised subject model. Returns `null` for
 * unusable files so a single broken source can never break the whole build.
 */
function normalizeSyllabus(raw: RawSyllabus): SyllabusSubject | null {
  const name = cleanText(raw.subject);
  const slug = syllabusSlug(name);
  if (!name || !slug) return null;

  const exam = cleanText(raw.exam) || "JAMB";
  const examSlug = examNameToSlug(exam);
  const usedSectionSlugs = new Set<string>();
  const usedTopicSlugs = new Set<string>();
  const sections: SyllabusSection[] = [];

  const rawSections = Array.isArray(raw.sections) ? raw.sections : [];
  rawSections.forEach((rawSection, sectionIndex) => {
    const topics: SyllabusTopic[] = [];
    const rawTopics = Array.isArray(rawSection.topics) ? rawSection.topics : [];

    rawTopics.forEach((rawTopic, topicIndex) => {
      const topic = normalizeTopic(
        rawTopic,
        { examSlug, subjectSlug: slug, sectionIndex, topicIndex },
        usedTopicSlugs,
      );
      if (topic) topics.push(topic);
    });

    if (topics.length === 0) return;

    const title = cleanText(rawSection.sectionTitle) || `Section ${sectionIndex + 1}`;
    sections.push({
      key: `section-${sectionIndex + 1}`,
      slug: claimSlug(syllabusSlug(title), usedSectionSlugs, `section-${sectionIndex + 1}`),
      title,
      topics,
    });
  });

  if (sections.length === 0) return null;

  const stats = sections.reduce<SyllabusStats>(
    (totals, section) => {
      totals.sections += 1;
      totals.topics += section.topics.length;
      for (const topic of section.topics) {
        totals.subtopics += topic.subtopics.length;
        totals.objectives += countTopicObjectives(topic);
      }
      return totals;
    },
    { sections: 0, topics: 0, subtopics: 0, objectives: 0 },
  );

  return {
    name,
    slug,
    exam,
    examSlug,
    category: CATEGORY_BY_SUBJECT_SLUG[slug] ?? "Sciences",
    sections,
    generalObjectives: cleanList(raw.generalObjectives),
    recommendedTexts: cleanList(raw.recommendedTexts),
    stats,
  };
}

/* -------------------------------------------------------------------------- */
/* Registry                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * All 25 official outlines. Adding a new exam board later only means adding the
 * JSON file here (and it automatically gets a `/syllabus/<exam>` page).
 */
const RAW_SOURCES: RawSyllabus[] = [
  agriculturalScienceRaw,
  arabicRaw,
  artRaw,
  biologyRaw,
  chemistryRaw,
  christianReligiousStudiesRaw,
  commerceRaw,
  computerStudiesRaw,
  economicsRaw,
  frenchRaw,
  geographyRaw,
  governmentRaw,
  hausaRaw,
  historyRaw,
  homeEconomicsRaw,
  igboRaw,
  islamicReligiousStudiesRaw,
  literatureInEnglishRaw,
  mathematicsRaw,
  musicRaw,
  physicalAndHealthEducationRaw,
  physicsRaw,
  principlesOfAccountingRaw,
  useOfEnglishRaw,
  yorubaRaw,
] as unknown as RawSyllabus[];

let registryCache: SyllabusSubject[] | null = null;
let topicIndexCache: Map<string, SyllabusTopicLocation> | null = null;

/** Normalised + alphabetically sorted subjects. Memoised for the whole build. */
export function getSyllabusSubjects(): SyllabusSubject[] {
  if (!registryCache) {
    registryCache = RAW_SOURCES.map(normalizeSyllabus)
      .filter((subject): subject is SyllabusSubject => Boolean(subject))
      .sort((a, b) => a.name.localeCompare(b.name, "en"));
  }
  return registryCache;
}

/** Flat `exam/subject/topic` index, used for topic pages and prev/next links. */
function getTopicIndex(): Map<string, SyllabusTopicLocation> {
  if (!topicIndexCache) {
    topicIndexCache = new Map();
    for (const subject of getSyllabusSubjects()) {
      const flattened = subject.sections.flatMap((section) =>
        section.topics.map((topic) => ({ section, topic })),
      );
      flattened.forEach((entry, index) => {
        const key = `${subject.examSlug}/${subject.slug}/${entry.topic.slug}`;
        topicIndexCache?.set(key, {
          subject,
          section: entry.section,
          topic: entry.topic,
          previous: flattened[index - 1]?.topic ?? null,
          next: flattened[index + 1]?.topic ?? null,
        });
      });
    }
  }
  return topicIndexCache;
}

/** Every exam board that has at least one outline (today: `["jamb"]`). */
export function getSyllabusExamSlugs(): string[] {
  return Array.from(new Set(getSyllabusSubjects().map((subject) => subject.examSlug)));
}

/** Display name for an exam slug (`jamb` → `JAMB`). */
export function getSyllabusExamName(examSlug: string): string {
  const match = getSyllabusSubjects().find((subject) => subject.examSlug === examSlug);
  return match?.exam ?? examSlug.toUpperCase();
}

export function getSyllabusSubjectsForExam(examSlug: string): SyllabusSubject[] {
  const normalized = normalizeExamSlug(examSlug);
  return getSyllabusSubjects().filter((subject) => subject.examSlug === normalized);
}

export function getSyllabusSubject(
  examSlug: string,
  subjectSlug: string,
): SyllabusSubject | null {
  const normalizedExam = normalizeExamSlug(examSlug);
  const normalizedSubject = syllabusSlug(subjectSlug);
  return (
    getSyllabusSubjects().find(
      (subject) =>
        subject.examSlug === normalizedExam && subject.slug === normalizedSubject,
    ) ?? null
  );
}

export function getSyllabusTopic(
  examSlug: string,
  subjectSlug: string,
  topicSlug: string,
): SyllabusTopicLocation | null {
  const normalizedExam = normalizeExamSlug(examSlug);
  const key = `${normalizedExam}/${syllabusSlug(subjectSlug)}/${syllabusSlug(topicSlug)}`;
  return getTopicIndex().get(key) ?? null;
}

/* -------------------------------------------------------------------------- */
/* Links, summaries and static params                                         */
/* -------------------------------------------------------------------------- */

/**
 * CBT engine subject identifiers that differ from the syllabus slug.
 * `CbtRunner` deslugifies whatever we pass (`accounting` → `Accounting`), so the
 * value here must already be a slug.
 */
const PRACTICE_SUBJECT_SLUG_OVERRIDES: Record<string, string> = {
  "principles-of-accounting": "accounting",
};

/**
 * Deep link into the existing CBT engine for a subject. The engine defaults to
 * its own year when none is provided and students can switch year/subject from
 * `/practice`, so the syllabus never has to invent a year.
 */
export function buildSyllabusPracticeHref(subject: {
  examSlug: string;
  slug: string;
}): string {
  const practiceSubject = PRACTICE_SUBJECT_SLUG_OVERRIDES[subject.slug] ?? subject.slug;
  const params = new URLSearchParams({
    exam: subject.examSlug,
    subject: practiceSubject,
  });
  return `/cbt?${params.toString()}`;
}

export function toSyllabusSummary(subject: SyllabusSubject): SyllabusSubjectSummary {
  return {
    name: subject.name,
    slug: subject.slug,
    exam: subject.exam,
    examSlug: subject.examSlug,
    category: subject.category,
    href: `/syllabus/${subject.examSlug}/${subject.slug}`,
    sections: subject.stats.sections,
    topics: subject.stats.topics,
    subtopics: subject.stats.subtopics,
  };
}

export function getSyllabusSummaries(): SyllabusSubjectSummary[] {
  return getSyllabusSubjects().map(toSyllabusSummary);
}

/** Totals used in the index hero (25 subjects / 729 topics / …). */
export function getSyllabusTotals() {
  return getSyllabusSubjects().reduce(
    (totals, subject) => {
      totals.subjects += 1;
      totals.sections += subject.stats.sections;
      totals.topics += subject.stats.topics;
      totals.subtopics += subject.stats.subtopics;
      totals.objectives += subject.stats.objectives;
      return totals;
    },
    { subjects: 0, sections: 0, topics: 0, subtopics: 0, objectives: 0 },
  );
}

export function getSyllabusSubjectParams(): Array<{ exam: string; subject: string }> {
  return getSyllabusSubjects().map((subject) => ({
    exam: subject.examSlug,
    subject: subject.slug,
  }));
}

export function getSyllabusTopicParams(): Array<{
  exam: string;
  subject: string;
  topic: string;
}> {
  return getSyllabusSubjects().flatMap((subject) =>
    subject.sections.flatMap((section) =>
      section.topics.map((topic) => ({
        exam: subject.examSlug,
        subject: subject.slug,
        topic: topic.slug,
      })),
    ),
  );
}

/** Every topic with its subject — used by `app/sitemap.ts`. */
export function getSyllabusTopicRoutes(): Array<{
  subject: SyllabusSubject;
  topic: SyllabusTopic;
}> {
  return getSyllabusSubjects().flatMap((subject) =>
    subject.sections.flatMap((section) =>
      section.topics.map((topic) => ({ subject, topic })),
    ),
  );
}
