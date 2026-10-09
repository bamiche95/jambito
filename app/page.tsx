import Link from "next/link";
import { WifiOff, BookOpen, Timer, CheckCircle2 } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import InstallPwaBanner, { InstallHint } from "@/components/InstallPwaBanner";
import Hero from "@/components/home/Hero";
import { getPlan } from "@/lib/pricingStore";
import ExamPicker from "@/components/practice/ExamPicker";

/**
 * The page quotes the live price, which is read from Mongo, so it is cached and
 * refreshed rather than fully static. An admin edit calls revalidatePath("/")
 * and shows up on the next request; the window below is the backstop for the
 * first read after a deploy or a price changed outside the dashboard.
 *
 * A database that cannot be read is not fatal here: getPlan() falls back to the
 * built-in figure, so the landing page still renders (with the default price)
 * even if the pricing document is missing.
 */
export const revalidate = 60;

export async function generateMetadata() {
  const plan = await getPlan();
  return {
    title: "CBT-Practice — JAMB, WAEC & POST UTME Past Questions Practice",
    description: `Practice real JAMB, WAEC and POST UTME past questions offline with instant answers and explanations. Try 40 questions free, then ₦${plan.priceNaira.toLocaleString()} for a full year.`,
  };
}

const benefits = [
  {
    icon: WifiOff,
    title: "Offline-first",
    text: "Once loaded, questions and explanations are stored on your device — study anywhere, even without internet.",
  },
  {
    icon: Timer,
    title: "Real CBT simulation",
    text: "Countdown timer, question palette, flagging and auto-submit just like the actual exam.",
  },
  {
    icon: CheckCircle2,
    title: "Instant explanations",
    text: "See the correct answer and a full explanation the moment you pick an option.",
  },
  {
    icon: BookOpen,
    title: "Real past questions",
    text: "Curated JAMB, WAEC and POST UTME questions spanning subjects and years.",
  },
];

export default async function Home() {
  const plan = await getPlan();
  return (
    <div className="flex flex-1 flex-col bg-cream">
      <SiteHeader />

      {/* Hero. Purely presentational — the live price is read below and shown
          in the pricing card. */}
      <Hero />

      {/* Exam board picker */}
      <section id="subjects" className="mx-auto max-w-6xl px-4 py-14 sm:py-16">
        <h2 className="text-2xl font-bold text-slate-900 md:text-3xl">
          Pick your exam board
        </h2>
        <p className="mt-2 text-slate-600">
          Choose a board, then a year and a subject. Sign in for 40 free
          questions — no payment needed.
        </p>

        <ExamPicker />
      </section>

      {/* Benefits */}
      <section className="border-y border-slate-200/80 bg-cream-deep">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:py-16">
          <h2 className="text-center text-2xl font-bold text-slate-900 md:text-3xl">
            Why students choose CBT-Practice
          </h2>
          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {benefits.map((b) => (
              <div
                key={b.title}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-brand-blue">
                  <b.icon className="h-6 w-6" aria-hidden />
                </span>
                <h3 className="font-semibold text-slate-900">{b.title}</h3>
                <p className="mt-2 text-sm text-slate-500">{b.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      {/* Pricing — one offer, so one card. The figure is read from the database
          above, so an admin edit shows up here without a deploy. */}
      <section id="pricing" className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-center text-2xl font-bold text-slate-900 md:text-3xl">
          One payment. A full year.
        </h2>
        <p className="mt-2 text-center text-slate-600">
          ₦{plan.priceNaira.toLocaleString()} once unlocks every exam board,
          subject and year for 12 months. Nothing renews and nothing is charged
          automatically.
        </p>
        <div className="mx-auto mt-10 max-w-md">
          <div className="relative rounded-2xl bg-linear-to-br from-blue-700 via-blue-600 to-indigo-700 p-6 text-white shadow-xl ring-4 ring-blue-500/20">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-orange px-3 py-0.5 text-xs font-bold text-white shadow-sm">
              Pay once
            </span>
            <h3 className="font-semibold">{plan.name}</h3>
            <p className="mt-3">
              <span className="text-3xl font-extrabold">
                ₦{plan.priceNaira.toLocaleString()}
              </span>
              <span className="text-sm text-white/80"> for 12 months</span>
            </p>
            <p className="mt-2 text-sm text-white/80">{plan.description}</p>
            <ul className="mt-4 space-y-2 text-sm">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <CheckCircle2
                    className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300"
                    aria-hidden
                  />
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href="/practice"
              className="mt-6 block rounded-full bg-brand-orange py-3 text-center font-bold shadow-md shadow-black/20 transition hover:bg-[#E64A19] active:scale-[0.98]"
            >
              Start practicing
            </Link>
          </div>
        </div>
      </section>

      {/* Install CTA — light, so the footer wave below has something to cut
          into. Both install affordances are in their light variant. */}
      <section className="mx-auto max-w-6xl px-4 pb-16">
        <div className="rounded-3xl border border-slate-200 bg-cream-deep px-4 py-14 text-center shadow-sm">
          <h2 className="text-2xl font-bold text-slate-900 md:text-3xl">
            Take CBT-Practice everywhere you go
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-slate-600">
            Install it on your phone or laptop and keep practicing even with no
            network.
          </p>
          <div className="mt-6 flex flex-col items-center gap-3">
            <InstallPwaBanner variant="light" />
            <InstallHint variant="light" />
          </div>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
