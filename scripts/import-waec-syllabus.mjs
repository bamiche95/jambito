#!/usr/bin/env node
/**
 * Imports the WAEC (WASSCE) outlines from `waec_json_syllabus_files/` into
 * `data/syllabus/waec/`, one JSON file per subject, shaped exactly like the JAMB
 * drops in `data/syllabus/` so `lib/syllabus.ts` can normalise both boards with
 * the same code path.
 *
 * Three transformations, all of which would otherwise break the app:
 *  1. `exam` is forced to "WAEC". The drop labels 58 of the subjects
 *     "WAEC/JAMB"; left alone `examNameToSlug()` produces the slug "waec/jamb"
 *     and every URL gains a segment (`/syllabus/waec/jamb/biology`), which does
 *     not match `/syllabus/[exam]/[subject]`.
 *  2. `[cite: 251, 252]` markers are stripped. They are artefacts of how the
 *     drop was generated and would render inside the candidate objectives.
 *  3. Each file is renamed after its subject slug (`gemini-code-….json` →
 *     `book-keeping.json`) because the data layer imports every file statically.
 *
 * A file that does not parse is reported and skipped rather than guessed at:
 * three files in the drop are truncated mid-record (Auto Mechanics, Auto Parts
 * Merchandising, Radio/Television and Electronics Works).
 *
 * Usage:
 *   node scripts/import-waec-syllabus.mjs
 *   node scripts/import-waec-syllabus.mjs --dry-run
 */

import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE_DIR = "waec_json_syllabus_files";
const TARGET_DIR = join("data", "syllabus", "waec");
const EXAM = "WAEC";
const dryRun = process.argv.includes("--dry-run");

/** Artefacts of the generation pass, e.g. `[cite: 548]` or `[cite: 251, 252]`. */
const CITE_MARKER = /\[cite:[^\]]*\]/g;

/** Mirrors `syllabusSlug()` in lib/syllabus.ts so file names match page URLs. */
function syllabusSlug(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Strips the cite markers and the spacing they leave behind. */
function cleanString(value) {
  return value
    .replace(CITE_MARKER, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}

function cleanDeep(value) {
  if (typeof value === "string") return cleanString(value);
  if (Array.isArray(value)) return value.map(cleanDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, cleanDeep(entry)]),
    );
  }
  return value;
}

function countStats(syllabus) {
  let sections = 0;
  let topics = 0;
  let subtopics = 0;
  for (const section of Array.isArray(syllabus.sections) ? syllabus.sections : []) {
    if (!Array.isArray(section.topics) || section.topics.length === 0) continue;
    sections += 1;
    topics += section.topics.length;
    for (const topic of section.topics) {
      subtopics += Array.isArray(topic.subtopics) ? topic.subtopics.length : 0;
    }
  }
  return { sections, topics, subtopics };
}

function main() {
  const sourceFiles = readdirSync(SOURCE_DIR)
    .filter((name) => name.toLowerCase().endsWith(".json"))
    .sort();

  const written = [];
  const skipped = [];
  const usedSlugs = new Map();

  for (const file of sourceFiles) {
    const path = join(SOURCE_DIR, file);
    let parsed;

    try {
      parsed = JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
    } catch (error) {
      skipped.push({
        file,
        subject: "-",
        reason: `invalid JSON — ${error.message}`,
      });
      continue;
    }

    const subject = typeof parsed.subject === "string" ? parsed.subject.trim() : "";
    const slug = syllabusSlug(subject);
    if (!subject || !slug) {
      skipped.push({ file, subject: subject || "-", reason: "missing subject name" });
      continue;
    }
    if (usedSlugs.has(slug)) {
      skipped.push({
        file,
        subject,
        reason: `duplicate slug "${slug}" (already imported from ${usedSlugs.get(slug)})`,
      });
      continue;
    }

    const cleaned = cleanDeep({ ...parsed, exam: EXAM });
    const { sections, topics, subtopics } = countStats(cleaned);
    if (sections === 0) {
      skipped.push({ file, subject, reason: "no sections with topics" });
      continue;
    }

    usedSlugs.set(slug, file);
    written.push({
      subject,
      slug,
      exam: EXAM,
      sections,
      topics,
      subtopics,
      file: `${slug}.json`,
      text: `${JSON.stringify(cleaned, null, 2)}\n`,
    });
  }

  if (!dryRun) {
    mkdirSync(TARGET_DIR, { recursive: true });
    // The directory is generated output, so stale files from a previous drop are
    // removed; otherwise a renamed subject would leave a dead JSON behind.
    for (const name of readdirSync(TARGET_DIR)) {
      if (name.toLowerCase().endsWith(".json")) {
        rmSync(join(TARGET_DIR, name));
      }
    }
    for (const entry of written) {
      writeFileSync(join(TARGET_DIR, entry.file), entry.text, "utf8");
    }
  }

  const totals = written.reduce(
    (sum, entry) => ({
      sections: sum.sections + entry.sections,
      topics: sum.topics + entry.topics,
      subtopics: sum.subtopics + entry.subtopics,
    }),
    { sections: 0, topics: 0, subtopics: 0 },
  );

  console.log(
    `${dryRun ? "[dry-run] " : ""}Imported ${written.length}/${sourceFiles.length} WAEC outlines -> ${TARGET_DIR}`,
  );
  console.log(
    `${totals.sections} sections | ${totals.topics} topics | ${totals.subtopics} content items`,
  );
  for (const entry of [...written].sort((a, b) => a.slug.localeCompare(b.slug, "en"))) {
    console.log(
      `  ${entry.slug.padEnd(56)} ${String(entry.sections).padStart(3)} sec` +
        ` ${String(entry.topics).padStart(4)} top ${String(entry.subtopics).padStart(4)} items`,
    );
  }

  if (skipped.length > 0) {
    console.warn(`\nSkipped ${skipped.length} file(s):`);
    for (const entry of skipped) {
      console.warn(`  ${entry.file} [${entry.subject}] ${entry.reason}`);
    }
  }
}

main();
