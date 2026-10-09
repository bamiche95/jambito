"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Divide,
  Globe,
  GraduationCap,
  Minus,
  Plus,
  X,
  type LucideIcon,
} from "lucide-react";
import { EXAMS, examNameToSlug, examLabel } from "@/lib/catalog";

/**
 * Per-board identity colour. The cards are otherwise identical, so the accent
 * is the only thing that tells a student which board they are about to open.
 * Derived from the exam name rather than hardcoded per card, so a board the
 * provider starts returning tomorrow still renders (with the neutral fallback).
 */
interface BoardAccent {
  /** Card border — the board's colour in the grid. */
  border: string;
  /** Icon tile background and glyph colour. */
  tile: string;
  /** The "Choose year" call to action. */
  cta: string;
  icon: LucideIcon;
  /**
   * POST-UTME is drawn as a 2x2 grid of maths marks rather than one glyph;
   * `Plus` in `icon` is then just a placeholder for the type.
   */
  glyphGrid?: boolean;
}

const BOARD_ACCENTS: Record<string, BoardAccent> = {
  JAMB: {
    border: "border-blue-500",
    tile: "bg-blue-100 text-blue-600",
    cta: "text-blue-600",
    icon: GraduationCap,
  },
  WAEC: {
    border: "border-orange-500",
    tile: "bg-orange-100 text-orange-600",
    cta: "text-orange-600",
    icon: BadgeCheck,
  },
  GCE: {
    border: "border-emerald-500",
    tile: "bg-emerald-100 text-emerald-600",
    cta: "text-emerald-600",
    icon: Globe,
  },
  POSTUTME: {
    border: "border-pink-400",
    tile: "bg-pink-100 text-pink-600",
    cta: "text-pink-600",
    icon: Plus,
    glyphGrid: true,
  },
  NECO: {
    border: "border-pink-400",
    tile: "bg-pink-100 text-pink-600",
    cta: "text-pink-600",
    icon: BadgeCheck,
  },
  GST: {
    border: "border-purple-400",
    tile: "bg-purple-100 text-purple-600",
    cta: "text-purple-600",
    icon: Globe,
  },
};

const FALLBACK_ACCENT: BoardAccent = {
  border: "border-slate-300",
  tile: "bg-slate-900 text-white",
  cta: "text-brand-blue",
  icon: GraduationCap,
};

/**
 * The provider returns board names in assorted shapes ("jamb", "POST UTME",
 * "post-utme"), so the key is normalised to letters and digits before lookup.
 */
function accentFor(exam: string): BoardAccent {
  const key = String(exam ?? "")
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase();
  return BOARD_ACCENTS[key] ?? FALLBACK_ACCENT;
}

/** The maths-mark tile used for POST-UTME. */
function MathGlyphs() {
  return (
    <span className="grid grid-cols-2 gap-0.5">
      <Plus className="h-3.5 w-3.5" aria-hidden />
      <Minus className="h-3.5 w-3.5" aria-hidden />
      <X className="h-3.5 w-3.5" aria-hidden />
      <Divide className="h-3.5 w-3.5" aria-hidden />
    </span>
  );
}

/**
 * Exam board picker. Fetches the available exam boards from the proxy API and
 * links each one to its year list under /practice/[exam]. Falls back to the
 * static catalog if the API is unreachable, so the section always renders (and
 * the home page stays statically prerendered).
 *
 * `boardGrid` keeps its original meaning — the compact 2-up grid used on
 * /practice. Without it (the landing page) the cards become a snap-scrolling
 * row on phones, which the design calls for, and a 2/3-up grid from `sm` up.
 */
export default function ExamPicker({ boardGrid = false }: { boardGrid?: boolean }) {
  const [exams, setExams] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  /* Cards and skeletons share these, so the loading state never reflows the
     page when the real boards arrive. */
  const gridClass = boardGrid
    ? "mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5"
    : "mt-8 -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-3 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-6 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-3 [&::-webkit-scrollbar]:hidden";
  const cardClass = boardGrid ? "" : "w-[17rem] shrink-0 snap-start sm:w-auto";

  useEffect(() => {
    let cancelled = false;
    fetch("/api/questions?get=exam")
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        const list = Array.isArray(json?.data)
          ? json.data.filter((e: unknown) => typeof e === "string" && e)
          : [];
        setExams(list.length ? list : [...EXAMS]);
      })
      .catch(() => {
        if (!cancelled) setExams([...EXAMS]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className={gridClass}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className={`h-36 animate-pulse rounded-2xl border border-slate-200 bg-slate-50 ${cardClass}`}
          />
        ))}
      </div>
    );
  }

  return (
    <div className={gridClass}>
      {exams.map((exam) => {
        const accent = accentFor(exam);
        const AccentIcon = accent.icon;

        return (
          <Link
            key={exam}
            href={`/practice/${examNameToSlug(exam)}`}
            className={`group relative flex flex-col justify-between rounded-2xl border-2 bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 active:scale-[0.98] sm:p-6 ${accent.border} ${cardClass} ${
              boardGrid ? "min-h-36 p-4 sm:p-5" : ""
            }`}
          >
            <div
              className={`flex items-center gap-3 ${
                boardGrid
                  ? "flex-col items-start sm:flex-row sm:items-center"
                  : ""
              }`}
            >
              <span
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${accent.tile}`}
              >
                {accent.glyphGrid ? (
                  <MathGlyphs />
                ) : (
                  <AccentIcon className="h-6 w-6" aria-hidden />
                )}
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-900 sm:text-base">
                  {examLabel(exam)}
                </h3>
                <p className="text-xs leading-4 text-slate-500">
                  Past questions &amp; answers
                </p>
              </div>
            </div>
            <span
              className={`mt-4 inline-flex items-center gap-1 text-sm font-semibold ${accent.cta} ${
                boardGrid ? "sm:mt-6" : ""
              }`}
            >
              Choose year{" "}
              <ArrowRight
                className="h-4 w-4 transition group-hover:translate-x-0.5"
                aria-hidden
              />
            </span>
          </Link>
        );
      })}
    </div>
  );
}
