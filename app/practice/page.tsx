import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import ExamPicker from "@/components/practice/ExamPicker";

export const metadata: Metadata = {
  title: "Choose an Exam Board",
  description:
    "Choose JAMB, WAEC or POST UTME to browse past questions by year and subject.",
};

export default function PracticeHomePage() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      <main className="flex-1 bg-slate-50">
        <section className="bg-slate-950 text-white">
          <div className="mx-auto max-w-6xl px-4 py-9 sm:py-12">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-300">
              Practice library
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
              Choose your exam board
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
              Browse past questions by year and subject, then continue in a timed
              practice session.
            </p>
          </div>
        </section>
        <section className="mx-auto w-full max-w-6xl px-4 py-7 sm:py-10">
          <h2 className="text-lg font-semibold text-slate-900">
            Select a board
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Your unfinished sessions stay available in History.
          </p>
          <ExamPicker boardGrid />
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}