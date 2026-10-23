import Link from "next/link";
import { ArrowUpRight, BookOpen } from "lucide-react";
import type { SyllabusSubjectSummary } from "@/lib/syllabus";

/**
 * One subject tile.
 *
 * Deliberately framework-free (no client hooks) so the same component renders
 * server-side on `/syllabus/[exam]` and inside the `SyllabusBrowser` client
 * island on `/syllabus` — one visual definition, two runtimes.
 */
export default function SubjectCard({ subject }: { subject: SyllabusSubjectSummary }) {
  return (
    <Link
      href={subject.href}
      className="group flex h-full flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-blue/10 text-brand-blue">
          <BookOpen className="h-5 w-5" aria-hidden />
        </span>
        <ArrowUpRight
          aria-hidden
          className="h-4 w-4 text-slate-300 transition group-hover:text-brand-blue"
        />
      </div>
      <div>
        <h3 className="text-sm font-bold leading-snug text-slate-900 sm:text-base">
          {subject.name}
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          {subject.sections} {subject.sections === 1 ? "section" : "sections"} ·{" "}
          {subject.topics} {subject.topics === 1 ? "topic" : "topics"}
        </p>
      </div>
      <span className="mt-auto text-[11px] font-semibold uppercase tracking-wide text-brand-blue">
        View syllabus
      </span>
    </Link>
  );
}
