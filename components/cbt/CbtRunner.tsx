"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, WifiOff, AlertTriangle } from "lucide-react";
import CbtPractice from "./CbtPractice";
import PaywallModal from "./PaywallModal";
import {
  questionKey,
  saveQuestions,
  getCachedQuestions,
  saveAttempt,
  getBookmarkIds,
  toggleBookmark,
} from "@/lib/offlineStore";
import { consumeTrial, trialKey } from "@/lib/subscription";
import { examSlugToName, deslugify, titleCase } from "@/lib/catalog";
import type { Question } from "@/lib/types";

interface CbtRunnerProps {
  exam?: string;
  subject?: string;
  year?: string;
}

export default function CbtRunner({ exam, subject, year }: CbtRunnerProps) {
  const examName = examSlugToName(exam ?? "JAMB");
  const subjectName = deslugify(subject ?? "physics");
  const yearName = year ?? "2023";
  const storageKey = questionKey(examName, subjectName, yearName);
  const tKey = trialKey(examName, subjectName, yearName);

  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [locked, setLocked] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set());
  const [subscribed, setSubscribed] = useState<boolean>(() =>
    typeof localStorage !== "undefined" &&
    localStorage.getItem("jambito_subscribed") === "1"
  );

  useEffect(() => {
    getBookmarkIds().then((ids) => setBookmarks(new Set(ids.map(String))));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function fetchFresh() {
      try {
        const res = await fetch("/api/questions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            exam: examName,
            exam_year_id: yearName,
            subject: subjectName,
            page: 1,
          }),
        });
        const json = await res.json();
        if (json.success && json.data?.questions?.length) {
          await saveQuestions(storageKey, {
            questions: json.data.questions,
            pagination: json.data.pagination,
            source: json.source,
          });
          if (!cancelled) {
            setQuestions(json.data.questions);
            setOffline(false);
          }
          return true;
        }
        if (!cancelled) {
          setError(json.message || "No questions found for this selection.");
        }
        return false;
      } catch {
        return false;
      }
    }

    async function load() {
      setLoading(true);
      setError(null);

      const cached = await getCachedQuestions(storageKey);
      if (cached?.questions?.length) {
        setQuestions(cached.questions);
        setOffline(true);
        setLoading(false);
        const fresh = await fetchFresh();
        if (fresh) setOffline(false);
        return;
      }

      const fresh = await fetchFresh();
      if (!fresh && !cancelled) {
        setError(
          "You're offline and no cached questions are available for this subject."
        );
      }
      if (!cancelled) setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [storageKey, examName, subjectName, yearName]);

  const handleAnswer = useCallback(async () => {
    if (subscribed) return;
    const result = await consumeTrial(tKey);
    if (!result.allowed) {
      setLocked(true);
      setShowPaywall(true);
    }
  }, [subscribed, tKey]);

  const handleSubmit = useCallback(
    async (score: number, total: number) => {
      await saveAttempt({
        key: storageKey,
        exam: examName,
        subject: subjectName,
        year: yearName,
        score,
        total,
        percentage: total ? Math.round((score / total) * 100) : 0,
        date: new Date().toISOString(),
      });
    },
    [storageKey, examName, subjectName, yearName]
  );

  const handleToggleBookmark = useCallback(async (id: string | number) => {
    const nowBookmarked = await toggleBookmark(id);
    setBookmarks((prev) => {
      const next = new Set(prev);
      if (nowBookmarked) next.add(String(id));
      else next.delete(String(id));
      return next;
    });
  }, []);

  const title = `${examName} ${titleCase(subjectName)} ${yearName} Past Questions`;

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950 py-10">
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
          <Loader2 className="w-8 h-8 animate-spin" />
          <p>Loading questions…</p>
        </div>
      ) : error ? (
        <div className="max-w-md mx-auto text-center py-20 px-6">
          <AlertTriangle className="w-10 h-10 mx-auto mb-4 text-amber-500" />
          <p className="text-slate-600 dark:text-slate-300">{error}</p>
          <Link
            href="/"
            className="inline-block mt-4 text-blue-600 font-medium underline"
          >
            Choose a different subject
          </Link>
        </div>
      ) : (
        <>
          {offline && (
            <div className="max-w-4xl mx-auto px-4 mb-4">
              <div className="flex items-center gap-2 text-sm bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 px-4 py-2 rounded-lg">
                <WifiOff className="w-4 h-4" />
                You&apos;re offline — showing cached questions.
              </div>
            </div>
          )}
          <CbtPractice
            title={title}
            questions={questions}
            durationMinutes={Math.max(1, Math.min(30, Math.ceil(questions.length * 2)))}
            locked={locked}
            onAnswer={handleAnswer}
            onSubmit={handleSubmit}
            bookmarks={bookmarks}
            onToggleBookmark={handleToggleBookmark}
          />
        </>
      )}

      <PaywallModal
        open={showPaywall}
        onClose={() => setShowPaywall(false)}
        exam={examName}
        subject={subjectName}
        year={yearName}
        onUnlocked={() => {
          localStorage.setItem("jambito_subscribed", "1");
          setSubscribed(true);
          setLocked(false);
          setShowPaywall(false);
        }}
      />
    </main>
  );
}
