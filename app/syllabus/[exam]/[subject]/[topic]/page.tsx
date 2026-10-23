import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ChevronRight, Zap } from "lucide-react";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import Breadcrumbs from "@/components/syllabus/Breadcrumbs";
import JsonLd from "@/components/syllabus/JsonLd";
import PracticeCta from "@/components/syllabus/PracticeCta";
import TopicMapping from "@/components/syllabus/TopicMapping";
import {
  buildSyllabusPracticeHref,
  countTopicObjectives,
  getSyllabusTopic,
  getSyllabusTopicParams,
  type SyllabusTopicLocation,
} from "@/lib/syllabus";
import { SITE_URL } from "@/lib/site";

/**
 * One topic (`/syllabus/jamb/mathematics/number-bases`).
 *
 * These are the long-tail SEO pages: 729 of them, each with the topic's content,
 * the candidate objective(s) and links back into the subject outline. They are
 * prerendered at build time and deliberately excluded from the service-worker
 * precache (see `serwist.config.mjs`) so the install stays small.
 */

interface PageProps {
  params: Promise<{ exam: string; subject: string; topic: string }>;
}

export function generateStaticParams() {
  return getSyllabusTopicParams();
}

/** Short, deterministic meta description built from the first content/objective. */
function buildDescription({
  subject,
  topic,
}: SyllabusTopicLocation): string {
  const firstContent = topic.subtopics[0]?.content ?? "";
  const firstObjective =
    topic.subtopics.find((item) => item.objective)?.objective ??
    topic.objectives[0] ??
    "";

  const parts = [`${topic.title} in the ${subject.exam} ${subject.name} syllabus.`];
  if (firstContent) parts.push(`Content: ${firstContent}.`);
  if (firstObjective) parts.push(`Objective: ${firstObjective}.`);

  const description = parts.join(" ").replace(/\s+/g, " ").trim();
  return description.length > 157
    ? `${description.slice(0, 156).trimEnd()}…`
    : description;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { exam, subject: subjectParam, topic: topicParam } = await params;
  const location = getSyllabusTopic(exam, subjectParam, topicParam);

  if (!location) {
    return { title: "Syllabus topic not found", robots: { index: false, follow: false } };
  }

  const { subject, section, topic } = location;
  const title = `${topic.title} — ${subject.exam} ${subject.name} Syllabus`;
  const description = buildDescription(location);
  const path = topic.href;

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      type: "article",
      siteName: "CBT-Practice",
    },
    twitter: { card: "summary", title, description },
    other: { "article:section": section.title },
  };
}

export default async function SyllabusTopicPage({ params }: PageProps) {
  const { exam, subject: subjectParam, topic: topicParam } = await params;
  const location = getSyllabusTopic(exam, subjectParam, topicParam);

  if (!location) notFound();

  const { subject, section, topic, previous, next } = location;
  const examName = subject.exam;
  const subjectHref = `/syllabus/${subject.examSlug}/${subject.slug}`;
  const practiceHref = buildSyllabusPracticeHref(subject);
  const sectionIndex = subject.sections.findIndex((entry) => entry.key === section.key);
  const siblings = section.topics.filter((entry) => entry.key !== topic.key);
  const description = buildDescription(location);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
          {
            "@type": "ListItem",
            position: 2,
            name: "Syllabus",
            item: `${SITE_URL}/syllabus`,
          },
          {
            "@type": "ListItem",
            position: 3,
            name: `${examName} Syllabus`,
            item: `${SITE_URL}/syllabus/${subject.examSlug}`,
          },
          {
            "@type": "ListItem",
            position: 4,
            name: `${subject.name} Syllabus`,
            item: `${SITE_URL}${subjectHref}`,
          },
          {
            "@type": "ListItem",
            position: 5,
            name: topic.title,
            item: `${SITE_URL}${topic.href}`,
          },
        ],
      },
      {
        "@type": "WebPage",
        name: `${examName} ${subject.name} — ${topic.title}`,
        url: `${SITE_URL}${topic.href}`,
        description,
        isPartOf: { "@type": "WebSite", name: "CBT-Practice", url: SITE_URL },
        about: {
          "@type": "Thing",
          name: `${examName} ${subject.name} syllabus`,
        },
      },
    ],
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
          <div className="relative mx-auto w-full max-w-4xl px-4 pb-9 pt-5 sm:pb-12 sm:pt-7">
            <Breadcrumbs
              tone="dark"
              items={[
                { label: "Home", href: "/" },
                { label: "Syllabus", href: "/syllabus" },
                { label: examName, href: `/syllabus/${subject.examSlug}` },
                { label: subject.name, href: subjectHref },
                { label: topic.title },
              ]}
            />

            <p className="mt-6 text-[11px] font-bold uppercase tracking-[0.16em] text-blue-300">
              {examName} {subject.name} · Section {sectionIndex + 1}
            </p>
            <h1 className="mt-2 text-2xl font-extrabold leading-tight tracking-tight sm:text-4xl">
              {topic.title}
            </h1>
            <p className="mt-2 text-sm text-slate-300">{section.title}</p>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <Link
                href={practiceHref}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-blue px-5 text-sm font-bold text-white shadow-lg shadow-blue-900/30 transition hover:bg-blue-700 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
              >
                <Zap aria-hidden className="h-4 w-4" />
                Practice this topic now
              </Link>
              <Link
                href={subjectHref}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/25 px-5 text-sm font-bold text-white transition hover:bg-white/10 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <ArrowLeft aria-hidden className="h-4 w-4" />
                Full {subject.name} outline
              </Link>
            </div>

            <dl className="mt-7 flex flex-wrap gap-2">
              {[
                { label: "Content items", value: topic.subtopics.length },
                { label: "Objectives", value: countTopicObjectives(topic) },
                { label: "Section topics", value: section.topics.length },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 backdrop-blur"
                >
                  <dt className="sr-only">{stat.label}</dt>
                  <dd className="text-xs font-semibold text-slate-200">
                    <span className="mr-1 font-extrabold text-white">{stat.value}</span>
                    {stat.label.toLowerCase()}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <h2 className="text-base font-extrabold text-slate-900 sm:text-lg">
              Syllabus content and objectives
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Official {examName} {subject.name} outline · {section.title}
            </p>
            <div className="mt-4">
              <TopicMapping topic={topic} />
            </div>
            <PracticeCta href={practiceHref} subjectName={subject.name} />
          </article>

          <nav
            aria-label="Previous and next topic"
            className="mt-6 grid gap-3 sm:grid-cols-2"
          >
            {previous ? (
              <Link
                href={`${subjectHref}/${previous.slug}`}
                className="group flex flex-col rounded-xl border border-slate-200 bg-white p-4 transition hover:border-blue-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2"
              >
                <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400 transition group-hover:text-brand-blue">
                  <ArrowLeft aria-hidden className="h-3.5 w-3.5" />
                  Previous topic
                </span>
                <span className="mt-1 text-sm font-semibold leading-snug text-slate-900">
                  {previous.title}
                </span>
              </Link>
            ) : (
              <span aria-hidden className="hidden sm:block" />
            )}

            {next ? (
              <Link
                href={`${subjectHref}/${next.slug}`}
                className="group flex flex-col rounded-xl border border-slate-200 bg-white p-4 transition hover:border-blue-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2 sm:col-start-2 sm:items-end sm:text-right"
              >
                <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400 transition group-hover:text-brand-blue">
                  Next topic
                  <ArrowRight aria-hidden className="h-3.5 w-3.5" />
                </span>
                <span className="mt-1 text-sm font-semibold leading-snug text-slate-900">
                  {next.title}
                </span>
              </Link>
            ) : null}
          </nav>

          {siblings.length > 0 ? (
            <section aria-labelledby="more-topics" className="mt-8">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="more-topics" className="text-base font-extrabold text-slate-900">
                  More topics in this section
                </h2>
                <Link
                  href={`${subjectHref}#${section.slug}`}
                  className="text-xs font-semibold text-brand-blue transition hover:text-blue-700 hover:underline"
                >
                  Open section in the full outline
                </Link>
              </div>
              <ul className="mt-3 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                {siblings.map((sibling) => {
                  const objectiveCount = countTopicObjectives(sibling);
                  return (
                    <li key={sibling.key}>
                      <Link
                        href={`${subjectHref}/${sibling.slug}`}
                        className="flex min-h-12 items-center gap-3 px-4 py-3 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-blue"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium leading-snug text-slate-800">
                            {sibling.title}
                          </span>
                          <span className="mt-0.5 block text-[11px] text-slate-500">
                            {objectiveCount}{" "}
                            {objectiveCount === 1 ? "objective" : "objectives"}
                          </span>
                        </span>
                        <ChevronRight
                          aria-hidden
                          className="h-4 w-4 shrink-0 text-slate-300"
                        />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          <div className="mt-8 rounded-2xl bg-linear-to-br from-navy to-blue-900 p-5 text-white sm:p-6">
            <h2 className="text-base font-bold sm:text-lg">
              Done revising {topic.title}?
            </h2>
            <p className="mt-1 max-w-xl text-sm leading-6 text-slate-300">
              Answer {subject.name} past questions under the same timed conditions as the
              real CBT exam — then come back and tick off the next topic.
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <Link
                href={practiceHref}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-bold text-blue-700 shadow-sm transition hover:bg-blue-50 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
              >
                <Zap aria-hidden className="h-4 w-4" />
                Practice Past Questions on this Topic
              </Link>
              <Link
                href={subjectHref}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/30 px-5 text-sm font-bold text-white transition hover:bg-white/10 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                Back to the syllabus
              </Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
