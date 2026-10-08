import Link from "next/link";
import {
  Play,
  WifiOff,
  BookOpen,
  Timer,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import InstallPrompt, { InstallHint } from "@/components/InstallPrompt";
import { PLANS } from "@/lib/plans";
import ExamPicker from "@/components/practice/ExamPicker";

export const metadata = {
  title: "CBT-Practice — JAMB, WAEC & POST UTME Past Questions Practice",
  description:
    "Practice real JAMB, WAEC and POST UTME past questions offline with instant answers and explanations. Try 5 questions free.",
};

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

export default function Home() {
  return (
    <div className="flex flex-col flex-1">
      <SiteHeader />

      {/* Hero */}
      <section className="bg-slate-900 text-white">
        <div className="max-w-6xl mx-auto px-4 py-16 md:py-24 text-center">
          <span className="inline-block px-3 py-1 text-xs font-semibold uppercase tracking-wider bg-blue-600/20 text-blue-300 rounded-full">
            Built for Nigerian students
          </span>
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mt-5 leading-tight">
            Pass JAMB, WAEC &amp; POST UTME with confidence
          </h1>
          <p className="text-lg text-slate-300 mt-5 max-w-2xl mx-auto">
            Practice thousands of real past questions with a full CBT engine,
            instant explanations and 100% offline access.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8">
            <Link
              href="/cbt"
              className="inline-flex items-center gap-2 px-7 py-3.5 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition"
            >
              <Play className="w-5 h-5" /> Start Practicing Free
            </Link>
            <a
              href="#subjects"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-lg font-semibold text-slate-200 border border-slate-600 hover:bg-slate-800 transition"
            >
              Browse Past Questions <ArrowRight className="w-4 h-4" />
            </a>
          </div>
          <div className="mt-8">
            <InstallPrompt />
          </div>
        </div>
      </section>

      {/* Exam board picker */}
      <section id="subjects" className="max-w-6xl mx-auto px-4 py-16">
        <h2 className="text-2xl md:text-3xl font-bold text-slate-900">
          Pick your exam board
        </h2>
        <p className="text-slate-500 mt-2">
          Choose a board, then a year and a subject. Free trials available — no
          sign-up required.
        </p>

        <ExamPicker />
      </section>

      {/* Benefits */}
      <section className="bg-slate-50 border-y border-slate-200">
        <div className="max-w-6xl mx-auto px-4 py-16">
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 text-center">
            Why students choose CBT-Practice
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mt-10">
            {benefits.map((b) => (
              <div
                key={b.title}
                className="bg-white rounded-xl border border-slate-200 p-6"
              >
                <b.icon className="w-8 h-8 text-blue-600 mb-4" />
                <h3 className="font-semibold text-slate-900">{b.title}</h3>
                <p className="text-sm text-slate-500 mt-2">{b.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      {/* Pricing */}
      <section id="pricing" className="max-w-6xl mx-auto px-4 py-16">
        <h2 className="text-2xl md:text-3xl font-bold text-slate-900 text-center">
          Simple, affordable pricing
        </h2>
        <p className="text-slate-500 text-center mt-2">
          Start with 5 free questions per subject/year. Upgrade when you&apos;re ready.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mt-10">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={
                plan.popular
                  ? "relative bg-slate-900 text-white rounded-2xl p-6 ring-2 ring-blue-500"
                  : "bg-white rounded-2xl border border-slate-200 p-6"
              }
            >
              {plan.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-blue-600 text-white text-xs font-bold rounded-full">
                  Most popular
                </span>
              )}
              <h3 className="font-semibold">{plan.name}</h3>
              <p className="mt-3">
                <span className="text-3xl font-extrabold">
                  ₦{plan.priceNaira.toLocaleString()}
                </span>
                <span className="text-sm opacity-70"> / {plan.interval}</span>
              </p>
              <p className="text-sm mt-2 opacity-70">{plan.description}</p>
              <ul className="mt-4 space-y-2 text-sm">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-blue-500" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/cbt"
                className={
                  plan.popular
                    ? "block text-center mt-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 font-semibold transition"
                    : "block text-center mt-6 py-2.5 rounded-lg bg-slate-900 text-white hover:opacity-90 font-semibold transition"
                }
              >
                Get started
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Install CTA */}
      <section className="bg-slate-900 text-white">
        <div className="max-w-3xl mx-auto px-4 py-16 text-center">
          <h2 className="text-2xl md:text-3xl font-bold">
            Take CBT-Practice everywhere you go
          </h2>
          <p className="text-slate-300 mt-3">
            Install it on your phone or laptop and keep practicing even with no
            network.
          </p>
          <div className="mt-6 flex flex-col items-center gap-3">
            <InstallPrompt />
            <InstallHint />
          </div>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
