"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  BookOpen,
  ChartNoAxesColumnIncreasing,
  GraduationCap,
  Target,
} from "lucide-react";
import { examLabel, titleCase } from "@/lib/catalog";
import { getAttempts } from "@/lib/offlineStore";
import type { AttemptRecord } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ScoreGroup {
  exam: string;
  subject?: string;
  sessions: number;
  score: number;
  total: number;
}

function percent(score: number, total: number): number | null {
  return total > 0 ? Math.round((score / total) * 100) : null;
}

function readinessBand(value: number | null) {
  if (value === null) return { label: "Not enough data", tone: "slate" as const };
  if (value < 50) return { label: "Building", tone: "amber" as const };
  if (value < 75) return { label: "Progressing", tone: "blue" as const };
  return { label: "Strong", tone: "emerald" as const };
}

const toneStyles = {
  slate: "bg-slate-100 text-slate-700",
  amber: "bg-amber-100 text-amber-800",
  blue: "bg-blue-100 text-blue-800",
  emerald: "bg-emerald-100 text-emerald-800",
};

const barStyles = {
  slate: "bg-slate-400",
  amber: "bg-amber-500",
  blue: "bg-blue-600",
  emerald: "bg-emerald-600",
};

function aggregate(records: AttemptRecord[], bySubject: boolean): ScoreGroup[] {
  const groups = new Map<string, ScoreGroup>();
  records.forEach((record) => {
    const exam = record.exam;
    const subject = bySubject ? record.subject : undefined;
    const key = bySubject
      ? `${exam.toLowerCase()}__${record.subject.toLowerCase()}`
      : exam.toLowerCase();
    const current = groups.get(key) ?? {
      exam,
      subject,
      sessions: 0,
      score: 0,
      total: 0,
    };
    current.sessions++;
    current.score += record.score;
    current.total += record.total;
    groups.set(key, current);
  });
  return [...groups.values()].sort((a, b) => b.total - a.total);
}

export default function StatsView() {
  const [attempts, setAttempts] = useState<AttemptRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getAttempts()
      .then((records) => {
        if (!cancelled) setAttempts(records);
      })
      .catch(() => {
        if (!cancelled) setAttempts([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sortedAttempts = useMemo(
    () => [...attempts].sort((a, b) => (a.date < b.date ? 1 : -1)),
    [attempts]
  );
  const totalScore = attempts.reduce((sum, attempt) => sum + attempt.score, 0);
  const totalQuestions = attempts.reduce((sum, attempt) => sum + attempt.total, 0);
  const overallPercent = percent(totalScore, totalQuestions);
  const overallBand = readinessBand(overallPercent);
  const subjects = aggregate(attempts, true);
  const boards = aggregate(attempts, false);
  const trend = useMemo(() => {
    if (sortedAttempts.length < 10) return null;
    const recent = sortedAttempts.slice(0, 5);
    const previous = sortedAttempts.slice(5, 10);
    const recentScore = percent(
      recent.reduce((sum, record) => sum + record.score, 0),
      recent.reduce((sum, record) => sum + record.total, 0)
    );
    const previousScore = percent(
      previous.reduce((sum, record) => sum + record.score, 0),
      previous.reduce((sum, record) => sum + record.total, 0)
    );
    if (recentScore === null || previousScore === null) return null;
    return { difference: recentScore - previousScore, recentScore, previousScore };
  }, [sortedAttempts]);

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2" aria-label="Loading stats">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="h-32 animate-pulse rounded-xl bg-slate-100" />
        ))}
      </div>
    );
  }

  if (attempts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center">
        <Target className="mx-auto h-8 w-8 text-slate-400" aria-hidden />
        <h2 className="mt-3 font-semibold text-slate-900">Your progress starts with a practice set</h2>
        <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-500">
          Complete an exam to see score trends, subject coverage, and a readiness estimate here.
        </p>
        <Link
          href="/practice"
          className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/25"
        >
          <BookOpen className="h-4 w-4" aria-hidden />
          Choose an exam
        </Link>
      </div>
    );
  }

  const scoreWidth = overallPercent ?? 0;

  return (
    <div className="space-y-7 sm:space-y-9">
      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-xl bg-slate-950 p-5 text-white sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-300">
                Readiness estimate
              </p>
              <h2 className="mt-2 text-3xl font-bold tabular-nums sm:text-4xl">
                {overallPercent === null ? "—" : `${overallPercent}%`}
              </h2>
            </div>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-blue-200 ring-1 ring-inset ring-white/10">
              <GraduationCap className="h-6 w-6" aria-hidden />
            </span>
          </div>
          <div
            role="meter"
            aria-label="Overall readiness estimate"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={overallPercent ?? 0}
            className="mt-5 h-2 overflow-hidden rounded-full bg-white/15"
          >
            <div
              className="h-full rounded-full bg-blue-400 transition-[width]"
              style={{ width: `${scoreWidth}%` }}
            />
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", toneStyles[overallBand.tone])}>
              {overallBand.label}
            </span>
            <span className="text-xs text-slate-400">
              Based on {attempts.length} completed {attempts.length === 1 ? "session" : "sessions"}
            </span>
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-400">
            An estimate from completed question scores, not a prediction of exam results.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-700">
                Recent trend
              </p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">
                Score momentum
              </h2>
            </div>
            <ChartNoAxesColumnIncreasing className="h-5 w-5 text-blue-700" aria-hidden />
          </div>
          {trend ? (
            <>
              <p className="mt-5 flex items-center gap-1 text-3xl font-bold tabular-nums text-slate-900">
                {trend.difference > 0 ? (
                  <ArrowUpRight className="h-6 w-6 text-emerald-600" aria-hidden />
                ) : trend.difference < 0 ? (
                  <ArrowDownRight className="h-6 w-6 text-rose-600" aria-hidden />
                ) : null}
                {trend.difference > 0 ? "+" : ""}{trend.difference} pts
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Latest five: {trend.recentScore}% · Previous five: {trend.previousScore}%
              </p>
            </>
          ) : (
            <p className="mt-5 rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-600">
              Complete 10 sessions to compare your latest five scores with the five before them.
            </p>
          )}
        </div>
      </section>

      <section aria-label="Practice totals" className="grid grid-cols-3 gap-3 sm:gap-4">
        <Metric icon={BookOpen} label="Questions" value={String(totalQuestions)} />
        <Metric icon={Target} label="Sessions" value={String(attempts.length)} />
        <Metric icon={GraduationCap} label="Subjects" value={String(subjects.length)} />
      </section>

      <section>
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-700">
            Coverage
          </p>
          <h2 className="mt-1 text-xl font-semibold text-slate-900">By exam board</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {boards.map((board) => {
            const boardPercent = percent(board.score, board.total);
            const band = readinessBand(boardPercent);
            return (
              <div key={board.exam} className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-semibold text-slate-900">{examLabel(board.exam)}</h3>
                  <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", toneStyles[band.tone])}>
                    {band.label}
                  </span>
                </div>
                <p className="mt-3 text-2xl font-bold tabular-nums text-slate-900">
                  {boardPercent === null ? "—" : `${boardPercent}%`}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {board.sessions} {board.sessions === 1 ? "session" : "sessions"} · {board.total} questions
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-700">
            Subject performance
          </p>
          <h2 className="mt-1 text-xl font-semibold text-slate-900">Readiness by subject</h2>
        </div>
        <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {subjects.map((subject) => {
            const subjectPercent = percent(subject.score, subject.total);
            const band = readinessBand(subjectPercent);
            return (
              <div key={`${subject.exam}-${subject.subject}`} className="px-4 py-4 sm:px-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {titleCase(subject.subject ?? "Subject")}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {examLabel(subject.exam)} · {subject.sessions} {subject.sessions === 1 ? "session" : "sessions"} · {subject.total} questions
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-lg font-bold tabular-nums text-slate-900">
                      {subjectPercent === null ? "—" : `${subjectPercent}%`}
                    </p>
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", toneStyles[band.tone])}>
                      {band.label}
                    </span>
                  </div>
                </div>
                <div
                  role="meter"
                  aria-label={`${titleCase(subject.subject ?? "Subject")} readiness estimate`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={subjectPercent ?? 0}
                  className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100"
                >
                  <div
                    className={cn("h-full rounded-full", barStyles[band.tone])}
                    style={{ width: `${subjectPercent ?? 0}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-500">
          Bands: Building below 50%, Progressing at 50–74%, Strong at 75% and above. Subject results are estimates from completed sessions only.
        </p>
      </section>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof BookOpen;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
      <Icon className="h-4 w-4 text-blue-700 sm:h-5 sm:w-5" aria-hidden />
      <p className="mt-2 truncate text-lg font-bold tabular-nums text-slate-900 sm:text-2xl">
        {value}
      </p>
      <p className="truncate text-[11px] font-medium text-slate-500 sm:text-sm">
        {label}
      </p>
    </div>
  );
}
