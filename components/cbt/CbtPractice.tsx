"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  Clock,
  RotateCcw,
  Lock,
  Bookmark,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import type { PracticeQuestion } from "@/lib/types";
import { cn } from "@/lib/utils";
import { DEFAULT_PLAN, TRIAL_LIMIT } from "@/lib/plans";

export type { PracticeQuestion };

interface CbtPracticeProps {
  title?: string;
  /**
   * Full questions, or a locked teaser set whose answer key was stripped by the
   * API. Anything that grades or reveals an answer must check for that.
   */
  questions: PracticeQuestion[];
  durationMinutes?: number;
  /** When true, option selection is disabled (trial exhausted). */
  locked?: boolean;
  /**
   * Seconds a locked visitor may read the set before the paywall overlay
   * covers it. `0` (the default) covers it immediately.
   */
  previewSeconds?: number;
  /** Called once when the user answers a question for the first time. */
  onAnswer?: (questionId: PracticeQuestion["id"]) => void;
  /** Called when the test is submitted with the final score. */
  onSubmit?: (score: number, total: number) => void;
  bookmarks?: Set<string>;
  onToggleBookmark?: (questionId: PracticeQuestion["id"]) => void;
  canRetake?: boolean;
  onSubscribe?: () => void;
}

export default function CbtPractice({
  title = "Past Questions Practice",
  questions,
  durationMinutes = 10,
  locked = false,
  previewSeconds = 0,
  onAnswer,
  onSubmit,
  bookmarks,
  onToggleBookmark,
  canRetake = false,
  onSubscribe,
}: CbtPracticeProps) {
  const [selectedAnswers, setSelectedAnswers] = useState<{
    [key: string]: string;
  }>({});
  const [timeLeft, setTimeLeft] = useState(durationMinutes * 60);
  const [isSubmitted, setIsSubmitted] = useState(false);
  // True once the paywall overlay covers the set (trial exhausted).
  const [previewDone, setPreviewDone] = useState(false);
  // Restart the preview window whenever the set becomes locked (React's
  // "adjust state when props change" pattern — no effect needed).
  const [wasLocked, setWasLocked] = useState(locked);
  if (wasLocked !== locked) {
    setWasLocked(locked);
    setPreviewDone(false);
  }

  // A trial-exhausted visitor gets a short readable preview, then the overlay
  // covers everything so the questions can't keep being read for free.
  useEffect(() => {
    if (!locked || previewDone || previewSeconds <= 0) return;
    const timer = setTimeout(() => setPreviewDone(true), previewSeconds * 1000);
    return () => clearTimeout(timer);
  }, [locked, previewDone, previewSeconds]);

  const covered = locked && (previewSeconds <= 0 || previewDone);

  // Countdown timer with auto-submit on expiration. Paused while covered so a
  // locked session can't silently run out of time behind the overlay.
  useEffect(() => {
    if (isSubmitted || covered || timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setIsSubmitted(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isSubmitted, covered, timeLeft]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  };

  const answeredCount = Object.keys(selectedAnswers).length;

  const handleSelectOption = (questionId: PracticeQuestion["id"], key: string) => {
    if (isSubmitted || locked) return;
    const wasUnanswered = !selectedAnswers[questionId as string];
    setSelectedAnswers((prev) => ({ ...prev, [questionId]: key }));
    if (wasUnanswered) onAnswer?.(questionId);
  };

  const calculateScore = useCallback(() => {
    let score = 0;
    questions.forEach((q) => {
      // Teaser questions have no answer key: `undefined === undefined` must
      // never be scored as a correct answer.
      if (
        q.correctAnswer !== undefined &&
        selectedAnswers[q.id as string] === q.correctAnswer
      ) {
        score++;
      }
    });
    return score;
  }, [questions, selectedAnswers]);

  const handleSubmit = () => {
    if (isSubmitted) return;
    setIsSubmitted(true);
    onSubmit?.(calculateScore(), questions.length);
  };

  const resetTest = () => {
    setSelectedAnswers({});
    setTimeLeft(durationMinutes * 60);
    setIsSubmitted(false);
  };

  if (!questions || questions.length === 0) {
    return <div className="p-6 text-center">No questions provided.</div>;
  }

  const score = calculateScore();

  return (
    <div
      className={cn(
        "max-w-4xl mx-auto p-4 md:p-6 space-y-6 transition-all duration-300",
        covered && "pointer-events-none select-none blur-sm"
      )}
      aria-hidden={covered || undefined}
      inert={covered || undefined}
    >
      {/* Sticky header: title + timer + submit */}
      <div className="sticky top-0 z-30 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">
            {title}
          </h1>
          <p className="text-sm text-slate-500">
            {answeredCount} of {questions.length} answered
            {isSubmitted && ` · Score: ${score}/${questions.length}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg font-mono font-bold text-sm",
              timeLeft < 180
                ? "bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400 animate-pulse"
                : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
            )}
          >
            <Clock className="w-4 h-4" />
            <span>{formatTime(timeLeft)}</span>
          </div>
          {!isSubmitted && (
            <button
              onClick={handleSubmit}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg text-sm transition"
            >
              Submit Test
            </button>
          )}
        </div>
      </div>

      {locked && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4 rounded-xl">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200 text-sm">
            <Lock className="w-4 h-4" />
            You&apos;ve reached your {TRIAL_LIMIT}-question free trial limit.
          </div>
          <button
            onClick={onSubscribe}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition"
          >
            Unlock 12 months of access
          </button>
        </div>
      )}
      {isSubmitted && (
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 text-center space-y-4">
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
            Test Completed!
          </h2>
          <div className="inline-block p-6 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
            <span className="text-4xl font-extrabold text-blue-600 dark:text-blue-400">
              {score} / {questions.length}
            </span>
            <p className="text-sm text-slate-500 mt-1">
              Score: {Math.round((score / questions.length) * 100)}%
            </p>
          </div>
          <div className="flex justify-center gap-4">
            {canRetake ? (
              <button
                onClick={resetTest}
                className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition"
              >
                <RotateCcw className="w-4 h-4" /> Retake Test
              </button>
            ) : (
              <button
                onClick={onSubscribe}
                className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition"
              >
                <Lock className="w-4 h-4" /> Unlock 12 months of access
              </button>
            )}
          </div>
        </div>
      )}
      <div className="space-y-6">
        {questions.map((q, index) => {
          const userAnswer = selectedAnswers[q.id as string];
          const isBookmarked = bookmarks?.has(String(q.id)) ?? false;

          return (
            <article
              key={q.id}
              className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6"
            >
              <div className="flex items-start justify-between gap-3 mb-4">
                <h2 className="font-semibold text-slate-800 dark:text-slate-100">
                  <span className="text-blue-600 mr-2">Q{index + 1}.</span>
                  {q.question}
                </h2>
                <button
                  onClick={() => onToggleBookmark?.(q.id)}
                  className="p-1 rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
                  aria-label="Bookmark question"
                >
                  <Bookmark
                    className={cn(
                      "w-5 h-5",
                      isBookmarked && "fill-current text-blue-600"
                    )}
                  />
                </button>
              </div>

              <div className="space-y-2">
                {Object.entries(q.options).map(([key, value]) => {
                  const isSelected = userAnswer === key;
                  const isCorrectOption = key === q.correctAnswer;

                  let style =
                    "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-900";

                  if (isSubmitted) {
                    if (isCorrectOption) {
                      style =
                        "border-green-500 bg-green-50 dark:bg-green-950/20";
                    } else if (isSelected && !isCorrectOption) {
                      style = "border-red-500 bg-red-50 dark:bg-red-950/20";
                    }
                  } else if (isSelected) {
                    style =
                      "border-blue-500 bg-blue-50 dark:bg-blue-900/20";
                  }

                  return (
                    <button
                      key={key}
                      onClick={() => handleSelectOption(q.id, key)}
                      disabled={locked}
                      className={cn(
                        "w-full text-left p-3.5 rounded-lg border transition flex items-start gap-3",
                        style,
                        locked && "opacity-60 cursor-not-allowed"
                      )}
                    >
                      <span className="font-bold text-sm px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 shrink-0">
                        {key}
                      </span>
                      <span className="flex-1 text-slate-800 dark:text-slate-200">
                        {value}
                      </span>
                      {isSubmitted && isCorrectOption && (
                        <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                      )}
                      {isSubmitted && isSelected && !isCorrectOption && (
                        <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                      )}
                    </button>
                  );
                })}
              </div>

              {isSubmitted && q.explanation && (
                <div className="mt-4 p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
                    Explanation
                  </p>
                  <p className="text-sm text-slate-700 dark:text-slate-300">
                    {q.explanation}
                  </p>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {/*
        Portaled to <body> so the blurred wrapper above (a `filter` on an
        ancestor becomes the containing block for `position: fixed`) doesn't
        reposition the overlay. z-40 clears the sticky SiteHeader; the z-50
        PaywallModal and z-100 AuthModal still paint on top of it.
      */}
      {covered &&
        createPortal(
          <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="cbt-trial-overlay-title"
              className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6 text-center space-y-4"
            >
              <div className="mx-auto w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-950/40 flex items-center justify-center">
                <Lock className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <h2
                id="cbt-trial-overlay-title"
                className="text-xl font-bold text-slate-800 dark:text-slate-100"
              >
                You&apos;ve reached your {TRIAL_LIMIT}-question free trial limit
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Unlock 12 months of unlimited access to past questions and
                answers with a single ₦
                {DEFAULT_PLAN.priceNaira.toLocaleString()} payment.
              </p>
              <button
                onClick={onSubscribe}
                className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition"
              >
                Unlock 12 months of access
              </button>
              <Link
                href="/"
                className="block text-sm text-slate-500 hover:text-blue-600 underline"
              >
                Browse other subjects
              </Link>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
