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
export default function ExamPicker() {
  const [exams, setExams] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-36 rounded-2xl border border-slate-200 bg-slate-50 animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
      {exams.map((exam) => (
        <Link
          key={exam}
          href={`/practice/${examNameToSlug(exam)}`}
          className="group relative flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 hover:border-blue-300 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition"
        >
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-xl bg-slate-900 group-hover:bg-blue-600 flex items-center justify-center transition">
              <GraduationCap className="w-6 h-6 text-white" />
            </span>
            <div>
              <h3 className="font-bold text-slate-900">{examLabel(exam)}</h3>
              <p className="text-xs text-slate-500">
                Past questions &amp; answers
              </p>
            </div>
          </div>
          <span className="mt-6 inline-flex items-center gap-1 text-sm font-semibold text-blue-600">
            Choose year{" "}
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition" />
          </span>
        </Link>
      ))}
    </div>
  );
}
