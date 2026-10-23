import Link from "next/link";
import { Zap } from "lucide-react";

/**
 * The per-topic call to action required on every topic.
 *
 * It deep-links into the existing CBT engine with the subject preselected. The
 * question bank has no topic tags, so the button promises exactly what happens:
 * the subject's past questions open, and the student can still change year from
 * `/practice`. The hint line says so rather than implying a per-topic filter.
 */
export default function PracticeCta({
  href,
  subjectName,
}: {
  href: string;
  subjectName: string;
}) {
  return (
    <div className="mt-4 border-t border-slate-200 pt-4">
      <Link
        href={href}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-linear-to-r from-blue-600 to-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:from-blue-700 hover:to-indigo-700 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2 sm:w-auto"
      >
        <Zap aria-hidden className="h-4 w-4" />
        Practice Past Questions on this Topic
      </Link>
      <p className="mt-2 text-xs leading-5 text-slate-500">
        Opens the CBT engine with {subjectName} past questions and answers.
      </p>
    </div>
  );
}
