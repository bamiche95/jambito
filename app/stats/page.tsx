import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import StatsView from "@/components/StatsView";

export const metadata: Metadata = {
  title: "Practice Progress",
  description:
    "Track completed question scores, subject coverage and estimated readiness for JAMB, WAEC and POST UTME.",
};

export default function StatsPage() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      <main className="flex-1 bg-slate-50">
        <section className="bg-slate-950 text-white">
          <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-300">
              Progress dashboard
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
              Your preparation
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
              Follow score trends and see which subjects you have practiced most.
            </p>
          </div>
        </section>
        <section className="mx-auto w-full max-w-6xl px-4 py-6 sm:py-9">
          <StatsView />
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
