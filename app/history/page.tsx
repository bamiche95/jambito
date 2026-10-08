import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import HistoryView from "@/components/HistoryView";

export const metadata: Metadata = {
  title: "Practice History",
  description:
    "Resume unfinished JAMB, WAEC and POST UTME practice sessions or review completed scores.",
};

export default function HistoryPage() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      <main className="flex-1 bg-slate-50">
        <section className="bg-slate-950 text-white">
          <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-300">
              Your study log
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
              Practice history
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
              Pick up where you paused or revisit a completed past-question set.
            </p>
          </div>
        </section>
        <section className="mx-auto w-full max-w-4xl px-4 py-6 sm:py-9">
          <HistoryView />
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
