import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, ChevronDown, Zap } from "lucide-react";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import Breadcrumbs from "@/components/syllabus/Breadcrumbs";
import JsonLd from "@/components/syllabus/JsonLd";
import OpenHashDetails from "@/components/syllabus/OpenHashDetails";
import SyllabusSections from "@/components/syllabus/SyllabusSections";
import {
  buildSyllabusPracticeHref,
  getSyllabusExamName,
  getSyllabusSubject,
  getSyllabusSubjectParams,
  type SyllabusSubject,
} from "@/lib/syllabus";
import { SITE_URL } from "@/lib/site";

/**
 * Subject syllabus page (`/syllabus/jamb/mathematics`).
 *
 * This is the page students actually study from and the one search engines rank
 * for "<subject> syllabus". Every section and topic is in the HTML inside native
 * `<details>` accordions, so the content is indexable and readable without
 * JavaScript; `OpenHashDetails` is the only island and it just expands the
 * accordion named in the URL hash.
 */

interface PageProps {
  params: Promise<{ exam: string; subject: string }>;
}

export function generateStaticParams() {
  return getSyllabusSubjectParams();
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { exam, subject: subjectParam } = await params;
  const subject = getSyllabusSubject(exam, subjectParam);

  if (!subject) {
    return { title: "Syllabus not found", robots: { index: false, follow: false } };
  }

  const examName = getSyllabusExamName(subject.examSlug);
  const path = `/syllabus/${subject.examSlug}/${subject.slug}`;
  const title = `${examName} ${subject.name} Syllabus — Topics & Objectives`;
  const description = `The official ${examName} ${subject.name} syllabus: ${subject.stats.sections} sections, ${subject.stats.topics} topics and ${subject.stats.objectives} candidate objectives, each with free CBT practice.`;

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
  };
}

/** Section jumper, reused by the mobile disclosure and the desktop sidebar. */
function SectionLinks({ subject }: { subject: SyllabusSubject }) {
  return (
    <ol className="space-y-0.5">
      {subject.sections.map((section, index) => (
        <li key={section.key}>
          <a
            href={`#${section.slug}`}
            className="flex gap-2 rounded-lg px-2 py-1.5 text-sm leading-snug text-slate-600 transition hover:bg-blue-50 hover:text-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
          >
            <span className="text-slate-400">{index + 1}.</span>
            <span className="min-w-0">{section.title}</span>
          </a>
        </li>
      ))}
    </ol>
  );
}

export default async function SyllabusSubjectPage({ params }: PageProps) {
  const { exam, subject: subjectParam } = await params;
  const subject = getSyllabusSubject(exam, subjectParam);

  if (!subject) notFound();

  const examName = getSyllabusExamName(subject.examSlug);
  const practiceHref = buildSyllabusPracticeHref(subject);
  const path = `/syllabus/${subject.examSlug}/${subject.slug}`;
  const topics = subject.sections.flatMap((section) => section.topics);

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
            item: `${SITE_URL}${path}`,
          },
        ],
      },
      {
        "@type": "CollectionPage",
        name: `${examName} ${subject.name} Syllabus`,
        url: `${SITE_URL}${path}`,
        isPartOf: { "@type": "WebSite", name: "CBT-Practice", url: SITE_URL },
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: topics.length,
          itemListElement: topics.map((topic, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: topic.title,
            url: `${SITE_URL}${topic.href}`,
          })),
        },
      },
    ],
  };

  return (
    <div className="flex min-h-screen flex-col bg-cream">
      <JsonLd data={jsonLd} />
      <OpenHashDetails />
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
                { label: examName, href: `/syllabus/${subject.examSlug}` },
                { label: subject.name },
              ]}
            />

            <h1 className="mt-5 max-w-3xl text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
              {examName} {subject.name} Syllabus
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
              Every section, topic and candidate objective in the official {examName}{" "}
              {subject.name} outline — {subject.stats.sections} sections,{" "}
              {subject.stats.topics} topics and {subject.stats.objectives} objectives.
            </p>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <Link
                href={practiceHref}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-blue px-5 text-sm font-bold text-white shadow-lg shadow-blue-900/30 transition hover:bg-blue-700 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
              >
                <Zap aria-hidden className="h-4 w-4" />
                Practice {subject.name} questions
              </Link>
              <Link
                href={`/syllabus/${subject.examSlug}`}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/25 px-5 text-sm font-bold text-white transition hover:bg-white/10 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <BookOpen aria-hidden className="h-4 w-4" />
                All {examName} subjects
              </Link>
            </div>

            <dl className="mt-7 flex flex-wrap gap-2">
              {[
                { label: "Sections", value: subject.stats.sections },
                { label: "Topics", value: subject.stats.topics },
                { label: "Objectives", value: subject.stats.objectives },
                { label: "Category", value: subject.category },
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

        <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">
          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start lg:gap-8">
            <div className="min-w-0 lg:order-1">
              {subject.generalObjectives.length > 0 ? (
                <section
                  aria-labelledby="general-objectives"
                  className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
                >
                  <h2
                    id="general-objectives"
                    className="text-base font-bold text-slate-900"
                  >
                    General objectives
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    What {examName} expects you to be able to do across the whole
                    subject.
                  </p>
                  <ul className="mt-3 grid gap-2 text-sm leading-relaxed text-slate-700 sm:grid-cols-2">
                    {subject.generalObjectives.map((objective, index) => (
                      <li key={index} className="flex gap-2">
                        <span
                          aria-hidden
                          className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-emerald"
                        />
                        <span className="min-w-0">{objective}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {subject.sections.length > 1 ? (
                <details className="mb-5 rounded-2xl border border-slate-200 bg-white shadow-sm lg:hidden">
                  <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-bold text-slate-900 [&::-webkit-details-marker]:hidden">
                    Jump to a section
                    <ChevronDown aria-hidden className="h-4 w-4 text-slate-400" />
                  </summary>
                  <nav
                    aria-label="Syllabus sections"
                    className="border-t border-slate-100 px-2 pb-3 pt-2"
                  >
                    <SectionLinks subject={subject} />
                  </nav>
                </details>
              ) : null}

              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-extrabold text-slate-900 sm:text-xl">
                  Syllabus sections
                </h2>
                <span className="text-xs text-slate-500">
                  {subject.sections.length}{" "}
                  {subject.sections.length === 1 ? "section" : "sections"}
                </span>
              </div>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Tap a section to open it, then tap a topic to see its content and
                objectives.
              </p>
              <div className="mt-4">
                <SyllabusSections subject={subject} practiceHref={practiceHref} />
              </div>

              {subject.recommendedTexts.length > 0 ? (
                <details className="group mt-5 rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0 flex-1">
                      <h2 className="text-sm font-bold text-slate-900">
                        Recommended texts
                      </h2>
                      <span className="mt-0.5 block text-[11px] font-medium text-slate-500">
                        {subject.recommendedTexts.length}{" "}
                        {subject.recommendedTexts.length === 1 ? "book" : "books"} listed
                        by {subject.exam}
                      </span>
                    </span>
                    <ChevronDown
                      aria-hidden
                      className="h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 group-open:rotate-180"
                    />
                  </summary>
                  <ol className="space-y-2 border-t border-slate-100 px-4 py-3 text-sm leading-relaxed text-slate-600">
                    {subject.recommendedTexts.map((text, index) => (
                      <li key={index} className="flex gap-2">
                        <span aria-hidden className="font-semibold text-slate-400">
                          {index + 1}.
                        </span>
                        <span className="min-w-0">{text}</span>
                      </li>
                    ))}
                  </ol>
                </details>
              ) : null}
            </div>

            <aside className="hidden lg:order-2 lg:block">
              <div className="sticky top-20 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-sm font-bold text-slate-900">Sections</h2>
                <nav
                  aria-label="Syllabus sections"
                  className="mt-2 max-h-[55vh] overflow-y-auto pr-1"
                >
                  <SectionLinks subject={subject} />
                </nav>
                <Link
                  href={practiceHref}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-blue px-3 py-2.5 text-xs font-bold text-white transition hover:bg-blue-700 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2"
                >
                  <Zap aria-hidden className="h-3.5 w-3.5" />
                  Practice {subject.name}
                </Link>
              </div>
            </aside>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
