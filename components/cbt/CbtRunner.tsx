"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, WifiOff, AlertTriangle, Lock } from "lucide-react";
import CbtPractice from "./CbtPractice";
import PaywallModal from "./PaywallModal";
import AuthModal from "@/components/auth/AuthModal";
import { useAuth } from "@/lib/auth";
import {
  questionKey,
  saveQuestions,
  getCachedQuestions,
  deleteCachedQuestions,
  saveAttempt,
  getBookmarkIds,
  getEntitlement,
  isEntitlementLocked,
  toggleBookmark,
} from "@/lib/offlineStore";
import { examSlugToName, deslugify, titleCase } from "@/lib/catalog";
import { TRIAL_LIMIT, TRIAL_PREVIEW_SECONDS } from "@/lib/plans";
import type { PracticeQuestion } from "@/lib/types";

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

  const {
    user,
    loading: authLoading,
    isSubscribed,
    trialRemaining,
    entitlementKnown,
    refreshStatus,
    getIdToken,
  } = useAuth();

  const [questions, setQuestions] = useState<PracticeQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  // The API answered 402: this account's trial is spent (authoritative).
  const [teaserOnly, setTeaserOnly] = useState(false);
  // Non-blocking notice shown when the quota couldn't be verified.
  const [quotaWarning, setQuotaWarning] = useState<string | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  // Bumped after subscribing so the full set is fetched again.
  const [reloadKey, setReloadKey] = useState(0);
  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set());
  // Local mirror of the quota, decremented on every answer so an offline
  // (unverifiable) session still fails closed at 0. Dropped as soon as the
  // provider reports a fresh number.
  const [optimisticRemaining, setOptimisticRemaining] = useState<number | null>(
    null
  );
  const [statusRemaining, setStatusRemaining] = useState(trialRemaining);
  if (statusRemaining !== trialRemaining) {
    setStatusRemaining(trialRemaining);
    setOptimisticRemaining(null);
  }
  const remaining = optimisticRemaining ?? trialRemaining;
  // Locked when the global trial is exhausted and the user isn't subscribed. A
  // 402 from the API is authoritative; the remaining count is only trusted once
  // the server confirmed it, so a blind default can never unlock paid content.
  const locked =
    !isSubscribed && (teaserOnly || (entitlementKnown && remaining <= 0));

  useEffect(() => {
    getBookmarkIds().then((ids) => setBookmarks(new Set(ids.map(String))));
  }, []);

  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;
    const accountUid = user.uid;

    /**
     * Fetches the set from the API. Returns true when questions are on screen
     * (fresh set or locked teaser) and false when there is nothing to show.
     */
    async function fetchFresh() {
      try {
        const token = await getIdToken();
        const res = await fetch("/api/questions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            exam: examName,
            exam_year_id: yearName,
            subject: subjectName,
            page: 1,
          }),
        });
        const json = await res.json().catch(() => null);

        // Trial spent: the API answers 402 with the same set minus every answer
        // key, so the locked preview shows the real list before it is covered.
        if (res.status === 402 && json?.code === "trial_exhausted") {
          if (!cancelled) {
            const teaser = json.teaser?.questions ?? [];
            setQuestions(teaser);
            setTeaserOnly(true);
            setOffline(false);
            if (!teaser.length) {
              setError(json.message || "You've reached your free trial limit.");
            }
          }
          // A full set cached before the trial ran out must not be replayable.
          await deleteCachedQuestions(storageKey);
          refreshStatus();
          return true;
        }

        if (res.status === 401) {
          if (!cancelled) {
            setQuestions([]);
            setError("Your session expired. Please sign in again to continue.");
          }
          return false;
        }

        if (json?.success && json.data?.questions?.length) {
          await saveQuestions(storageKey, {
            questions: json.data.questions,
            pagination: json.data.pagination,
            source: json.source,
          });
          if (!cancelled) {
            setQuestions(json.data.questions);
            setTeaserOnly(false);
            setOffline(false);
          }
          return true;
        }

        if (!cancelled) {
          setError(
            json?.message ||
              (res.ok
                ? "No questions found for this selection."
                : `Couldn't load questions (error ${res.status}).`)
          );
        }
        return false;
      } catch {
        // Network failure — the caller decides whether the cache may stand in.
        return false;
      }
    }

    async function load() {
      setLoading(true);
      setError(null);
      setTeaserOnly(false);

      // Last status the server confirmed for this account. Cached responses
      // can't be re-verified offline, so they are only replayed while that
      // status says the account is still entitled.
      const lastKnown = getEntitlement(accountUid);
      const cached = isEntitlementLocked(lastKnown)
        ? null
        : await getCachedQuestions(storageKey);

      if (cached?.questions?.length) {
        if (!cancelled) {
          setQuestions(cached.questions);
          setOffline(true);
          setLoading(false);
        }
        const fresh = await fetchFresh();
        if (fresh && !cancelled) setOffline(false);
        return;
      }

      const fresh = await fetchFresh();
      if (!fresh && !cancelled && !isEntitlementLocked(lastKnown)) {
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
  }, [
    authLoading,
    user,
    storageKey,
    examName,
    subjectName,
    yearName,
    getIdToken,
    refreshStatus,
    reloadKey,
  ]);

  const handleAnswer = useCallback(async () => {
    if (isSubscribed) return;
    // Charge the answer locally first: when the server can't confirm the quota
    // the session still stops at 0 instead of answering for free.
    setOptimisticRemaining((prev) => Math.max(0, (prev ?? trialRemaining) - 1));
    const token = await getIdToken();
    if (!token) return;
    try {
      const res = await fetch("/api/trial", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        // Session expired or the quota service is unavailable: keep the local
        // count (fail closed) and tell the user instead of swallowing it.
        setQuotaWarning(
          json?.message ||
            "We couldn't verify your free trial. Your remaining questions are counting down locally."
        );
        return;
      }
      setQuotaWarning(null);
      if (json.subscribed) {
        setOptimisticRemaining(null);
      } else if (typeof json.remaining === "number") {
        setOptimisticRemaining(json.remaining);
      }
      if (json.allowed === false) setShowPaywall(true);
      refreshStatus();
    } catch {
      // Offline — the local decrement above already paid for this answer.
      setQuotaWarning(
        "You're offline — your free questions are counting down locally."
      );
    }
  }, [isSubscribed, getIdToken, refreshStatus, trialRemaining]);

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

  if (authLoading) {
    return (
      <main className="min-h-screen bg-slate-50 dark:bg-slate-950 py-20 flex flex-col items-center gap-3 text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin" />
        <p>Preparing your practice session…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-slate-50 dark:bg-slate-950 py-20">
        <div className="max-w-md mx-auto text-center px-6">
          <Lock className="w-10 h-10 mx-auto mb-4 text-slate-400" />
          <h2 className="text-xl font-bold text-slate-900">Sign in to practice</h2>
          <p className="text-slate-500 mt-2">
            You need an account to start your free {TRIAL_LIMIT}-question
            trial. Sign in with Google or email to continue.
          </p>
          <button
            onClick={() => setShowAuth(true)}
            className="mt-6 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition"
          >
            Continue with Google or Email
          </button>
        </div>
        <AuthModal
          open={showAuth}
          onClose={() => setShowAuth(false)}
          onSuccess={() => setShowAuth(false)}
        />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950 py-10">
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
          <Loader2 className="w-8 h-8 animate-spin" />
          <p>Loading questions…</p>
        </div>
      ) : locked && !questions.length ? (
        <div className="max-w-md mx-auto text-center py-20 px-6">
          <Lock className="w-10 h-10 mx-auto mb-4 text-amber-500" />
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            You&apos;ve reached your {TRIAL_LIMIT}-question free trial limit
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mt-2">
            Subscribe to get Unlimited access to Past questions and answers.
          </p>
          <button
            onClick={() => setShowPaywall(true)}
            className="mt-6 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition"
          >
            Subscribe for unlimited access
          </button>
          <Link
            href="/"
            className="inline-block mt-4 text-blue-600 font-medium underline"
          >
            Browse other subjects
          </Link>
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
          {quotaWarning && (
            <div className="max-w-4xl mx-auto px-4 mb-4">
              <div className="flex items-center gap-2 text-sm bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 px-4 py-2 rounded-lg">
                <AlertTriangle className="w-4 h-4" />
                {quotaWarning}
              </div>
            </div>
          )}
          {!isSubscribed && entitlementKnown && remaining > 0 && (
            <div className="max-w-4xl mx-auto px-4 mb-4">
              <div className="text-sm text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-4 py-2 rounded-lg">
                Free trial: <strong>{remaining}</strong> question
                {remaining === 1 ? "" : "s"} left.
              </div>
            </div>
          )}
          <CbtPractice
            title={title}
            questions={questions}
            durationMinutes={Math.max(1, Math.min(30, Math.ceil(questions.length * 2)))}
            locked={locked}
            previewSeconds={TRIAL_PREVIEW_SECONDS}
            onAnswer={handleAnswer}
            onSubmit={handleSubmit}
            bookmarks={bookmarks}
            onToggleBookmark={handleToggleBookmark}
            canRetake={!locked}
            onSubscribe={() => setShowPaywall(true)}
          />
        </>
      )}

      <PaywallModal
        open={showPaywall}
        onClose={() => setShowPaywall(false)}
        onSubscribed={async () => {
          setShowPaywall(false);
          await refreshStatus();
          // Re-fetch so the new subscriber gets the full set, not the teaser.
          setReloadKey((key) => key + 1);
        }}
      />
    </main>
  );
}
