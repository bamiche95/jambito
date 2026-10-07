"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Clock,
  Flag,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Bookmark,
  Lock,
} from "lucide-react";
import type { Question } from "@/lib/types";
import { cn } from "@/lib/utils";

export type { Question };

interface CbtPracticeProps {
  title?: string;
  questions: Question[];
  durationMinutes?: number;
  /** When true, option selection is disabled (used to gate the freemium trial). */
  locked?: boolean;
  /** Called once when the user answers a question for the first time. */
  onAnswer?: (questionId: Question["id"]) => void;
  /** Called when the test is submitted with the final score. */
  onSubmit?: (score: number, total: number) => void;
  /** Bookmark state + toggle (optional). */
  bookmarks?: Set<string>;
  onToggleBookmark?: (questionId: Question["id"]) => void;
}

export default function CbtPractice({
  title = "CBT Past Questions Practice",
  questions,
  durationMinutes = 10,
  locked = false,
  onAnswer,
  onSubmit,
  bookmarks,
  onToggleBookmark,
}: CbtPracticeProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<{
    [key: string]: string;
  }>({});
  const [flagged, setFlagged] = useState<{ [key: string]: boolean }>({});
  const [timeLeft, setTimeLeft] = useState(durationMinutes * 60);
  const [isSubmitted, setIsSubmitted] = useState(false);

  // Countdown timer with auto-submit on expiration.
  useEffect(() => {
    if (isSubmitted || timeLeft <= 0) return;

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
  }, [isSubmitted, timeLeft]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  };

  const currentQ = questions[currentIndex];
  const userSelection = selectedAnswers[currentQ?.id as string];

  const handleSelectOption = (key: string) => {
    if (isSubmitted || locked) return;
    const wasUnanswered = !selectedAnswers[currentQ.id as string];
    setSelectedAnswers((prev) => ({
      ...prev,
      [currentQ.id]: key,
    }));
    if (wasUnanswered) {
      onAnswer?.(currentQ.id);
    }
  };

  const toggleFlag = () => {
    if (isSubmitted) return;
    setFlagged((prev) => ({
      ...prev,
      [currentQ.id]: !prev[currentQ.id],
    }));
  };

  const handleBookmark = () => {
    onToggleBookmark?.(currentQ.id);
  };

  const calculateScore = useCallback(() => {
    let score = 0;
    questions.forEach((q) => {
      if (selectedAnswers[q.id as string] === q.correctAnswer) {
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
    setFlagged({});
    setCurrentIndex(0);
    setTimeLeft(durationMinutes * 60);
    setIsSubmitted(false);
  };

  if (!questions || questions.length === 0) {
    return <div className="p-6 text-center">No questions provided.</div>;
  }

  const isBookmarked = bookmarks?.has(String(currentQ.id)) ?? false;

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white dark:bg-slate-900 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">{title}</h1>
          <p className="text-sm text-slate-500">Question {currentIndex + 1} of {questions.length}</p>
        </div>
        <div className={cn("flex items-center gap-2 px-4 py-2 rounded-lg font-mono font-bold text-lg", timeLeft < 180 ? "bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400 animate-pulse" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200")}>
          <Clock className="w-5 h-5" />
          <span>{formatTime(timeLeft)}</span>
        </div>
      </div>

      {/* Main Examination Layout */}
      {!isSubmitted ? (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Question & Options Area */}
          <div className="lg:col-span-3 bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between min-h-[420px] relative">
            {locked && (
              <div className="absolute inset-0 z-10 bg-white/70 dark:bg-slate-950/70 backdrop-blur-sm rounded-xl flex items-center justify-center">
                <div className="text-center px-6">
                  <Lock className="w-8 h-8 mx-auto mb-3 text-slate-500" />
                  <p className="font-semibold text-slate-700 dark:text-slate-200">Free trial limit reached</p>
                  <p className="text-sm text-slate-500 mt-1">Subscribe to continue answering questions.</p>
                </div>
              </div>
            )}

            <div>
              {/* Question Header Actions */}
              <div className="flex justify-between items-center mb-4">
                <span className="px-3 py-1 bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 font-semibold text-xs rounded-full">Question {currentIndex + 1}</span>
                <div className="flex items-center gap-2">
                  <button onClick={handleBookmark} className={cn("flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-md transition", isBookmarked ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800")}>
                    <Bookmark className={cn("w-3.5 h-3.5", isBookmarked && "fill-current")} />
                    {isBookmarked ? "Bookmarked" : "Bookmark"}
                  </button>
                  <button onClick={toggleFlag} className={cn("flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-md transition", flagged[currentQ.id] ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800")}>
                    <Flag className="w-3.5 h-3.5" />
                    {flagged[currentQ.id] ? "Flagged" : "Flag for review"}
                  </button>
                </div>
              </div>

              {/* Question Text */}
              <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-6">{currentQ.question}</h2>

              {/* Options List */}
              <div className="space-y-3">
                {Object.entries(currentQ.options).map(([key, value]) => {
                  const isSelected = userSelection === key;
                  const isCorrect = key === currentQ.correctAnswer;
                  let optionStyle = "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-900";
                  if (userSelection) {
                    if (isCorrect) optionStyle = "border-green-500 bg-green-50 dark:bg-green-950/20 text-green-900 dark:text-green-200 font-medium";
                    else if (isSelected && !isCorrect) optionStyle = "border-red-500 bg-red-50 dark:bg-red-950/20 text-red-900 dark:text-red-200";
                  }
                  return (
                    <button key={key} onClick={() => handleSelectOption(key)} disabled={locked} className={cn("w-full text-left p-4 rounded-lg border transition flex items-start gap-3", optionStyle, locked && "opacity-60 cursor-not-allowed")}>
                      <span className="font-bold text-sm px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">{key}</span>
                      <span className="flex-1 text-slate-800 dark:text-slate-200">{value}</span>
                    </button>
                  );
                })}
              </div>
              {/* Instant explanation */}
              {userSelection && currentQ.explanation && (
                <div className="mt-5 p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Explanation</p>
                  <p className="text-sm text-slate-700 dark:text-slate-300">{currentQ.explanation}</p>
                </div>
              )}
            </div>

            {/* Navigation */}
            <div className="flex justify-between items-center mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
              <button onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))} disabled={currentIndex === 0} className="flex items-center gap-1 px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40">
                <ChevronLeft className="w-4 h-4" /> Previous
              </button>
              <button onClick={() => setCurrentIndex((prev) => Math.min(questions.length - 1, prev + 1))} disabled={currentIndex === questions.length - 1} className="flex items-center gap-1 px-4 py-2 text-sm font-medium rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 disabled:opacity-40">
                Next <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Question Palette Sidebar */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
            <div>
              <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-4">Question Palette</h3>
              <div className="grid grid-cols-4 gap-2">
                {questions.map((q, idx) => {
                  const isAnswered = !!selectedAnswers[q.id as string];
                  const isFlagged = !!flagged[q.id];
                  const isCurrent = idx === currentIndex;
                  let btnStyle = "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300";
                  if (isAnswered) btnStyle = "bg-blue-600 text-white";
                  if (isFlagged) btnStyle = "bg-amber-500 text-white";
                  if (isCurrent) btnStyle += " ring-2 ring-slate-900 dark:ring-slate-100 font-bold";
                  return (
                    <button key={q.id} onClick={() => setCurrentIndex(idx)} className={`h-10 rounded-lg text-sm transition relative flex items-center justify-center ${btnStyle}`}>
                      {idx + 1}
                    </button>
                  );
                })}
              </div>
            </div>
            <button onClick={handleSubmit} className="w-full mt-6 py-2.5 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg text-sm transition">Submit Test</button>
          </div>
        </div>
      ) : (
        /* Summary Dashboard */
        <div className="bg-white dark:bg-slate-900 p-8 rounded-xl border border-slate-200 dark:border-slate-800 text-center space-y-6">
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Test Completed!</h2>
          <div className="inline-block p-6 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
            <span className="text-4xl font-extrabold text-blue-600 dark:text-blue-400">{calculateScore()} / {questions.length}</span>
            <p className="text-sm text-slate-500 mt-1">Score: {Math.round((calculateScore() / questions.length) * 100)}%</p>
          </div>
          <div className="flex justify-center gap-4">
            <button onClick={resetTest} className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition">
              <RotateCcw className="w-4 h-4" /> Retake Test
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
