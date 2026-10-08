"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, CheckCircle2, Clock3, Play, RotateCcw } from "lucide-react";
import { buildCbtHref, examLabel, titleCase } from "@/lib/catalog";
import { getAttempts, getPracticeSessions } from "@/lib/offlineStore";
import type { AttemptRecord, PracticeSession } from "@/lib/types";
import { cn } from "@/lib/utils";

type HistoryFilter = "all" | "in-progress" | "completed";
type Activity =
  | { kind: "in-progress"; date: string; session: PracticeSession }
  | { kind: "completed"; date: string; attempt: AttemptRecord };

const dateFormatter = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Lagos",
});

function formatRemaining(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")} left`;
}

export default function HistoryView() {
  const [attempts, setAttempts] = useState<AttemptRecord[]>([]);
  const [sessions, setSessions] = useState<PracticeSession[]>([]);
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getAttempts(), getPracticeSessions()])
      .then(([nextAttempts, nextSessions]) => {
        if (cancelled) return;
        setAttempts(nextAttempts);
        setSessions(nextSessions);
      })
      .catch(() => {
        if (cancelled) return;
        setAttempts([]);
        setSessions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const activities = useMemo(() => {
    const completedSessionIds = new Set(
      attempts.flatMap((attempt) => (attempt.sessionId ? [attempt.sessionId] : []))
    );
    const unfinished = sessions
      .filter((session) => !completedSessionIds.has(session.id))
      .map<Activity>((session) => ({
        kind: "in-progress",
        date: session.updatedAt,
        session,
      }));
    const completed = attempts.map<Activity>((attempt) => ({
      kind: "completed",
      date: attempt.date,
      attempt,
    }));
    return [...unfinished, ...completed].sort((a, b) =>
      a.date < b.date ? 1 : -1
    );
  }, [attempts, sessions]);

  const visibleActivities = activities.filter((activity) =>
    filter === "all" ? true : activity.kind === filter
  );
  const filters: { id: HistoryFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "in-progress", label: "In progress" },
    { id: "completed", label: "Completed" },
  ];

  return (
    <div>
      <div className="mb-5 flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 sm:w-fit">
        {filters.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={filter === item.id}
            onClick={() => setFilter(item.id)}
            className={cn(
              "min-h-10 shrink-0 rounded-lg px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
              filter === item.id
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            )}
          >
            {item.label}
            <span className="ml-2 text-xs text-slate-400">
              {item.id === "all"
                ? activities.length
                : activities.filter((activity) => activity.kind === item.id).length}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3" aria-label="Loading history">
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className="h-24 animate-pulse rounded-xl bg-slate-100"
            />
          ))}
        </div>
      ) : visibleActivities.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center">
          <BookOpen className="mx-auto h-8 w-8 text-slate-400" aria-hidden />
          <h2 className="mt-3 font-semibold text-slate-900">
            {filter === "in-progress"
              ? "No unfinished exams"
              : filter === "completed"
                ? "No completed exams yet"
                : "Your practice history starts here"}
          </h2>
          <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-slate-500">
            Start a past-question session and your progress will appear here.
          </p>
          <Link
            href="/practice"
            className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-500/25"
          >
            <Play className="h-4 w-4" aria-hidden />
            Choose an exam
          </Link>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {visibleActivities.map((activity) => {
            if (activity.kind === "in-progress") {
              const { session } = activity;
              const answered = Object.keys(session.answers).length;
              return (
                <Link
                  key={`session-${session.id}`}
                  href={buildCbtHref(session.exam, session.subject, session.year)}
                  className="group flex min-h-24 items-center gap-3 px-4 py-4 transition-colors hover:bg-blue-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 sm:gap-4 sm:px-5"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                    <Clock3 className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-900">
                      {examLabel(session.exam)} · {titleCase(session.subject)} {session.year}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {answered} answered · {formatRemaining(session.remainingSeconds)} · Paused
                    </span>
                    <span className="mt-1 block text-xs text-slate-400">
                      Updated {dateFormatter.format(new Date(session.updatedAt))}
                    </span>
                  </span>
                  <span className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white transition-colors group-hover:bg-blue-700 sm:text-sm">
                    <Play className="h-3.5 w-3.5" aria-hidden />
                    Resume
                  </span>
                </Link>
              );
            }

            const { attempt } = activity;
            const tone =
              attempt.percentage >= 75
                ? "bg-emerald-50 text-emerald-700"
                : attempt.percentage >= 50
                  ? "bg-amber-50 text-amber-700"
                  : "bg-rose-50 text-rose-700";
            return (
              <Link
                key={`attempt-${attempt.sessionId ?? `${attempt.key}-${attempt.date}`}`}
                href={buildCbtHref(attempt.exam, attempt.subject, attempt.year)}
                className="group flex min-h-24 items-center gap-3 px-4 py-4 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 sm:gap-4 sm:px-5"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                  <CheckCircle2 className="h-5 w-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-900">
                    {examLabel(attempt.exam)} · {titleCase(attempt.subject)} {attempt.year}
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">
                    {dateFormatter.format(new Date(attempt.date))} · {attempt.total} questions
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className={cn("rounded-lg px-2.5 py-1 text-sm font-bold", tone)}>
                    {attempt.percentage}%
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 group-hover:text-blue-700">
                    <RotateCcw className="h-3 w-3" aria-hidden />
                    Practice again
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
