"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import SubjectCard from "@/components/syllabus/SubjectCard";
import { cn } from "@/lib/utils";
import type { SyllabusCategory, SyllabusSubjectSummary } from "@/lib/syllabus";

/**
 * Client island for the subject index — shared by `/syllabus` (every board) and
 * `/syllabus/[exam]` (one board).
 *
 * Only the compact summaries are shipped here — importing the constants from
 * `lib/syllabus.ts` directly would drag every syllabus JSON into the browser
 * bundle, so `categories` and `exams` arrive as props from the server page.
 *
 * All subjects render on first paint; the search box and the chips only hide
 * cards, which keeps the page crawlable and usable before hydration.
 */

const ALL_CATEGORIES = "All subjects" as const;
type CategoryFilter = SyllabusCategory | typeof ALL_CATEGORIES;

/** Sentinel for "no board filter" — boards are identified by exam slug. */
const ALL_BOARDS = "all-boards" as const;

function categoryId(category: string): string {
  return category.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
}

export interface SyllabusBrowserExam {
  slug: string;
  /** Short board name shown on the chip (`JAMB`, `WAEC`). */
  name: string;
}

export default function SyllabusBrowser({
  subjects,
  categories,
  examName,
  exams,
}: {
  subjects: SyllabusSubjectSummary[];
  categories: readonly SyllabusCategory[];
  /** Board named in the search label/placeholder (`"JAMB"`, `"WAEC"`). */
  examName: string;
  /** Two or more boards turn on the board filter row; omit it for one board. */
  exams?: readonly SyllabusBrowserExam[];
}) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>(ALL_CATEGORIES);
  const [activeBoard, setActiveBoard] = useState<string>(ALL_BOARDS);

  const normalizedQuery = query.trim().toLowerCase();
  const boardFilters = exams && exams.length > 1 ? exams : undefined;

  const visible = useMemo(
    () =>
      subjects.filter((subject) => {
        const matchesBoard = activeBoard === ALL_BOARDS || subject.examSlug === activeBoard;
        const matchesCategory =
          activeCategory === ALL_CATEGORIES || subject.category === activeCategory;
        const matchesQuery =
          normalizedQuery.length === 0 ||
          subject.name.toLowerCase().includes(normalizedQuery);
        return matchesBoard && matchesCategory && matchesQuery;
      }),
    [subjects, activeBoard, activeCategory, normalizedQuery],
  );

  const groups = useMemo(
    () =>
      categories
        .map((category) => ({
          category,
          items: visible.filter((subject) => subject.category === category),
        }))
        .filter((group) => group.items.length > 0),
    [categories, visible],
  );

  const filters: CategoryFilter[] = [ALL_CATEGORIES, ...categories];
  const activeBoardName = boardFilters?.find((board) => board.slug === activeBoard)?.name;

  return (
    <div>
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
        />
        <label htmlFor="syllabus-search" className="sr-only">
          Search {examName} subjects
        </label>
        <input
          id="syllabus-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search subjects, e.g. Mathematics"
          autoComplete="off"
          className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-10 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20 [&::-webkit-search-cancel-button]:hidden"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
      </div>

      {boardFilters ? (
        <div
          role="group"
          aria-label="Filter subjects by exam board"
          className="mt-3 flex flex-wrap gap-2"
        >
          {[{ slug: ALL_BOARDS as string, name: "All boards" }, ...boardFilters].map(
            (board) => {
              const active = board.slug === activeBoard;
              return (
                <button
                  key={board.slug}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setActiveBoard(board.slug)}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2",
                    active
                      ? "border-navy bg-navy text-white shadow-sm"
                      : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-brand-blue",
                  )}
                >
                  {board.name}
                </button>
              );
            },
          )}
        </div>
      ) : null}

      <div
        role="group"
        aria-label="Filter subjects by category"
        className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
      >
        {filters.map((filter) => {
          const active = filter === activeCategory;
          return (
            <button
              key={filter}
              type="button"
              aria-pressed={active}
              onClick={() => setActiveCategory(filter)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2",
                active
                  ? "border-brand-blue bg-brand-blue text-white shadow-sm"
                  : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-brand-blue",
              )}
            >
              {filter}
            </button>
          );
        })}
      </div>

      <p className="mt-4 text-xs font-medium text-slate-500" aria-live="polite">
        {visible.length} {visible.length === 1 ? "subject" : "subjects"}
        {activeBoardName ? ` · ${activeBoardName}` : ""}
        {activeCategory === ALL_CATEGORIES ? "" : ` in ${activeCategory}`}
        {normalizedQuery ? ` matching “${query.trim()}”` : ""}
      </p>

      {groups.length > 0 ? (
        <div className="mt-6 space-y-8">
          {groups.map((group) => (
            <section
              key={group.category}
              aria-labelledby={`category-${categoryId(group.category)}`}
            >
              <div className="flex items-center gap-3">
                <h3
                  id={`category-${categoryId(group.category)}`}
                  className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500"
                >
                  {group.category}
                </h3>
                <span aria-hidden className="h-px flex-1 bg-slate-200" />
                <span className="text-[11px] font-medium text-slate-400">
                  {group.items.length}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.items.map((subject) => (
                  <SubjectCard
                    key={`${subject.examSlug}-${subject.slug}`}
                    subject={subject}
                    showExam={Boolean(boardFilters)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white/60 p-8 text-center">
          <p className="text-sm font-semibold text-slate-900">
            No subject matches that search.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Try “Mathematics”, “Biology” or clear the filters.
          </p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setActiveCategory(ALL_CATEGORIES);
            }}
            className="mt-4 inline-flex h-9 items-center justify-center rounded-lg bg-brand-blue px-4 text-xs font-bold text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2"
          >
            Show all subjects
          </button>
        </div>
      )}
    </div>
  );
}
