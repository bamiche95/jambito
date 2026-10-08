"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, GraduationCap } from "lucide-react";
import { EXAMS, examNameToSlug, examLabel } from "@/lib/catalog";

/**
 * Landing-page exam board picker. Fetches the available exam boards from the
 * proxy API and links each one to its year list under /practice/[exam].
 * Falls back to the static catalog if the API is unreachable, so the section
 * always renders (and the home page stays statically prerendered).
 */
export default function ExamPicker({ boardGrid = false }: { boardGrid?: boolean }) {
  const [exams, setExams] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const gridClass = boardGrid
    ? "mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5"
    : "mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3";

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
            className={`h-36 animate-pulse border border-slate-200 bg-slate-50 ${boardGrid ? "rounded-xl" : "rounded-2xl"}`}
          />
        ))}
      </div>
    );
  }

  return (
    <div className={gridClass}>
      {exams.map((exam) => (
        <Link
          key={exam}
          href={`/practice/${examNameToSlug(exam)}`}
          className={`group relative flex flex-col justify-between rounded-xl border border-slate-200 bg-white ${boardGrid ? "min-h-36 p-4 sm:p-5" : "rounded-2xl p-6"} transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-lg active:translate-y-0 active:scale-[0.98]`}
        >
          <div className={`flex items-center gap-3 ${boardGrid ? "flex-col items-start sm:flex-row sm:items-center" : ""}`}>
            <span className="w-11 h-11 rounded-xl bg-slate-900 group-hover:bg-blue-600 flex items-center justify-center transition">
              <GraduationCap className="w-6 h-6 text-white" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-900 sm:text-base">{examLabel(exam)}</h3>
              <p className="text-xs leading-4 text-slate-500">
                Past questions &amp; answers
              </p>
            </div>
          </div>
          <span className={`mt-4 inline-flex items-center gap-1 text-sm font-semibold text-blue-600 ${boardGrid ? "sm:mt-6" : ""}`}>
            Choose year{" "}
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition" />
          </span>
        </Link>
      ))}
    </div>
  );
}
