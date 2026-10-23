import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Zap } from "lucide-react";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import Breadcrumbs from "@/components/syllabus/Breadcrumbs";
import JsonLd from "@/components/syllabus/JsonLd";
import SubjectCard from "@/components/syllabus/SubjectCard";
import {
  getSyllabusExamName,
  getSyllabusExamSlugs,
  getSyllabusSubjectsForExam,
  normalizeExamSlug,
  SYLLABUS_CATEGORIES,
  toSyllabusSummary,
} from "@/lib/syllabus";
import { SITE_URL } from "@/lib/site";

/**
 * Exam-level syllabus index (`/syllabus/jamb`).
 *
 * Sits between the site-wide index and the subject pages so the breadcrumb is a
 * real, shareable URL, and so adding a second exam board later only needs its
 * JSON files — no new route.
 */

interface PageProps {
  params: Promise<{ exam: string }>;
}

export function generateStaticParams() {
  return getSyllabusExamSlugs().map((exam) => ({ exam }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { exam } = await params;
  const examSlug = normalizeExamSlug(exam);
  const subjects = getSyllabusSubjectsForExam(examSlug);

  if (subjects.length === 0) {
    return { title: "Syllabus not found", robots: { index: false, follow: false } };
  }

  const examName = getSyllabusExamName(examSlug);
  const topicCount = subjects.reduce((total, subject) => total + subject.stats.topics, 0);
  const title = `${examName} Syllabus — All ${subjects.length} Subjects & Topics`;
  const description = `Every ${examName} subject outline in one place: ${subjects.length} subjects, ${topicCount} topics and their candidate objectives, each linked to free CBT practice.`;

  return {
    title,
    description,
    alternates: { canonical: `/syllabus/${examSlug}` },
    openGraph: {
      title,
      description,
      url: `/syllabus/${examSlug}`,
      type: "website",
      siteName: "CBT-Practice",
    },
    twitter: { card: "summary", title, description },
  };
}

export default async function SyllabusExamPage({ params }: PageProps) {
  const { exam } = await params;
  const examSlug = normalizeExamSlug(exam);
  const subjects = getSyllabusSubjectsForExam(examSlug);

  if (subjects.length === 0) notFound();

  const examName = getSyllabusExamName(examSlug);
  const summaries = subjects.map(toSyllabusSummary);
  const topicCount = subjects.reduce((total, subject) => total + subject.stats.topics, 0);
  const groups = SYLLABUS_CATEGORIES.map((category) => ({
    category,
    items: summaries.filter((subject) => subject.category === category),
  })).filter((group) => group.items.length > 0);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${examName} Syllabus`,
    url: `${SITE_URL}/syllabus/${examSlug}`,
    isPartOf: { "@type": "WebSite", name: "CBT-Practice", url: SITE_URL },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: summaries.length,
      itemListElement: summaries.map((subject, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: `${examName} ${subject.name} Syllabus`,
        url: `${SITE_URL}${subject.href}`,
      })),
    },
  };

  return (
    <div className="flex min-h-screen flex-col bg-cream">
      <JsonLd data={jsonLd} />
      <SiteHeader />

      <main className="flex-1">
        <section className="relative overflow-hidden bg-linear-to-br from-navy via-navy-deep to-blue-900 text-white">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-blue-500/20 blur-3xl"
          />
          <div className="relative mx-auto w-full max-w-6xl px-4 pb-9 pt-5 sm:pb-12 sm:pt-7">
            <Breadcrumbs
              tone="dark"
              items={[
                { label: "Home", href: "/" },
                { label: "Syllabus", href: "/syllabus" },
                { label: examName },
              ]}
            />
            <h1 className="mt-5 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
              {examName} Syllabus
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
              All {subjects.length} {examName} subjects and {topicCount} topics, with the
              candidate objectives JAMB publishes for each one.
            </p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/cbt"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-blue px-5 text-sm font-bold text-white shadow-lg shadow-blue-900/30 transition hover:bg-blue-700 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
              >
                <Zap aria-hidden className="h-4 w-4" />
                Practise {examName} questions
              </Link>
              <Link
                href="/practice"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/25 px-5 text-sm font-bold text-white transition hover:bg-white/10 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                Browse past questions
                <ArrowRight aria-hidden className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:py-12">
          <div className="space-y-8">
            {groups.map((group) => {
              const headingId = `group-${group.category
                .replace(/[^a-z0-9]+/gi, "-")
                .toLowerCase()}`;
              return (
                <section key={group.category} aria-labelledby={headingId}>
                  <div className="flex items-center gap-3">
                    <h2
                      id={headingId}
                      className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500"
                    >
                      {group.category}
                    </h2>
                    <span aria-hidden className="h-px flex-1 bg-slate-200" />
                    <span className="text-[11px] font-medium text-slate-400">
                      {group.items.length}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {group.items.map((subject) => (
                      <SubjectCard
                        key={`${subject.examSlug}-${subject.slug}`}
                        subject={subject}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>

          <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
            <h2 className="text-base font-bold text-slate-900">
              Not sure which subject to revise first?
            </h2>
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-600">
              Take a timed {examName} paper first. Your score report shows the subjects
              costing you the most marks, then come back here and study those outlines.
            </p>
            <Link
              href="/cbt"
              className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white transition hover:bg-slate-800 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2"
            >
              <Zap aria-hidden className="h-4 w-4" />
              Start a free CBT
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
