import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookMarked, Target, Zap } from "lucide-react";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import Breadcrumbs from "@/components/syllabus/Breadcrumbs";
import JsonLd from "@/components/syllabus/JsonLd";
import SyllabusBrowser from "@/components/syllabus/SyllabusBrowser";
import {
  getSyllabusSummaries,
  getSyllabusTotals,
  SYLLABUS_CATEGORIES,
} from "@/lib/syllabus";
import { SITE_URL } from "@/lib/site";

/**
 * JAMB syllabus index.
 *
 * Fully static: the data lives in the bundle, so this page is prerendered at
 * build time and served from the CDN/PWA cache. The only JavaScript it ships is
 * the `SyllabusBrowser` search island — every subject link is already in the
 * HTML for crawlers.
 */

const totals = getSyllabusTotals();
const summaries = getSyllabusSummaries();

const PAGE_TITLE = "JAMB Syllabus — All Subjects, Topics & Objectives";
const PAGE_DESCRIPTION = `Browse the official JAMB (UTME) syllabus for all ${totals.subjects} subjects: ${totals.topics} topics and ${totals.objectives.toLocaleString("en-US")} candidate objectives, each with free CBT practice.`;

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: "/syllabus" },
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: "/syllabus",
    type: "website",
    siteName: "CBT-Practice",
  },
  twitter: { card: "summary", title: PAGE_TITLE, description: PAGE_DESCRIPTION },
};

const HOW_TO_USE = [
  {
    icon: BookMarked,
    title: "1. Study the outline",
    body: "Open a subject and every section of the official outline is there — from “Number Bases” to “Federalism” — so you never revise a topic JAMB has dropped.",
  },
  {
    icon: Target,
    title: "2. Read the objectives",
    body: "Each content item sits beside the candidate objective JAMB expects. That wording tells you the depth required: define, calculate, compare or explain.",
  },
  {
    icon: Zap,
    title: "3. Practise immediately",
    body: "Every topic has a practice button that opens past questions for that subject, so you can test yourself the moment you finish revising.",
  },
];

export default function SyllabusIndexPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: `${SITE_URL}/syllabus`,
    isPartOf: { "@type": "WebSite", name: "CBT-Practice", url: SITE_URL },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: summaries.length,
      itemListElement: summaries.map((subject, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: `JAMB ${subject.name} Syllabus`,
        url: `${SITE_URL}${subject.href}`,
      })),
    },
  };

  const stats = [
    { label: "Subjects", value: totals.subjects },
    { label: "Topics", value: totals.topics },
    { label: "Objectives", value: totals.objectives.toLocaleString("en-US") },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-cream">
      <JsonLd data={jsonLd} />
      <SiteHeader />

      <main className="flex-1">
        <section className="relative overflow-hidden bg-linear-to-br from-navy via-navy-deep to-blue-900 text-white">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -left-24 bottom-0 h-64 w-64 rounded-full bg-brand-orange/10 blur-3xl"
          />
          <div className="relative mx-auto w-full max-w-6xl px-4 pb-10 pt-5 sm:pb-14 sm:pt-7">
            <Breadcrumbs
              tone="dark"
              items={[{ label: "Home", href: "/" }, { label: "Syllabus" }]}
            />

            <p className="mt-6 text-[11px] font-bold uppercase tracking-[0.18em] text-blue-300">
              Official UTME outline
            </p>
            <h1 className="mt-2 max-w-3xl text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl md:text-[2.75rem]">
              JAMB Syllabus — every subject, topic and objective
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
              The complete JAMB (UTME) syllabus for all {totals.subjects} subjects,
              broken into {totals.sections} sections and {totals.topics} topics. Study
              each content item next to the objective JAMB expects — then practise it.
            </p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="#all-subjects"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-blue px-5 text-sm font-bold text-white shadow-lg shadow-blue-900/30 transition hover:bg-blue-700 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
              >
                Browse subjects
                <ArrowRight aria-hidden className="h-4 w-4" />
              </Link>
              <Link
                href="/cbt"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/25 px-5 text-sm font-bold text-white transition hover:bg-white/10 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <Zap aria-hidden className="h-4 w-4" />
                Start practising
              </Link>
            </div>

            <dl className="mt-8 grid max-w-xl grid-cols-3 gap-3">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 backdrop-blur"
                >
                  <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-300">
                    {stat.label}
                  </dt>
                  <dd className="mt-1 text-xl font-extrabold text-white sm:text-2xl">
                    {stat.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section
          id="all-subjects"
          className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-10 sm:py-14"
        >
          <div className="max-w-2xl">
            <h2 className="text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">
              All {totals.subjects} JAMB subjects
            </h2>
            <p className="mt-1.5 text-sm leading-6 text-slate-600">
              Pick a subject to see every section, topic and candidate objective.
              Nothing here is hidden behind a login.
            </p>
          </div>
          <div className="mt-6">
            <SyllabusBrowser subjects={summaries} categories={SYLLABUS_CATEGORIES} />
          </div>
        </section>

        <section className="border-y border-slate-200 bg-white">
          <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:py-14">
            <h2 className="text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">
              How to use the syllabus
            </h2>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {HOW_TO_USE.map(({ icon: Icon, title, body }) => (
                <div
                  key={title}
                  className="rounded-2xl border border-slate-200 bg-cream-deep p-4"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-blue/10 text-brand-blue">
                    <Icon aria-hidden className="h-5 w-5" />
                  </span>
                  <h3 className="mt-3 text-sm font-bold text-slate-900">{title}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-slate-600">{body}</p>
                </div>
              ))}
            </div>
            <p className="mt-6 max-w-3xl text-sm leading-6 text-slate-600">
              Every outline is the official JAMB brochure content, reproduced topic by
              topic — including the general objectives and recommended texts where JAMB
              publishes them.
            </p>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:py-14">
          <div className="overflow-hidden rounded-2xl bg-linear-to-br from-blue-600 via-blue-700 to-indigo-700 p-6 text-white shadow-xl sm:p-8">
            <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">
              Know the syllabus. Then practise it.
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-blue-100">
              Reading the outline is half the job — timed practice is what moves the
              score. Start a free CBT session and see exactly where you stand.
            </p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/practice"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-bold text-blue-700 shadow-sm transition hover:bg-blue-50 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-blue-700"
              >
                Choose an exam board
                <ArrowRight aria-hidden className="h-4 w-4" />
              </Link>
              <Link
                href="/cbt"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/40 px-5 text-sm font-bold text-white transition hover:bg-white/10 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <Zap aria-hidden className="h-4 w-4" />
                Start a CBT now
              </Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
