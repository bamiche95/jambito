import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { BookOpen, ChevronRight, Play } from "lucide-react";
import { getSubjects } from "@/lib/questions";
import {
  examSlugToName,
  examLabel,
  titleCase,
  buildCbtHref,
} from "@/lib/catalog";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ exam: string; year: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { exam, year } = await params;
  const label = examLabel(examSlugToName(exam));
  const title = `${label} ${year} Past Questions — Choose a Subject`;
  const description = `Choose a subject for ${label} ${year} past questions and start a free CBT practice session with instant answers and explanations.`;
  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary", title, description },
  };
}

export default async function ExamYearSubjectsPage({ params }: PageProps) {
  const { exam, year } = await params;
  const examName = examSlugToName(exam);
  const label = examLabel(examName);

  let subjects: string[] = [];
  try {
    const result = await getSubjects(examName, year);
    subjects = Array.isArray(result?.data) ? result.data : [];
  } catch (error) {
    console.error("Failed to load subjects:", error);
    notFound();
  }

  if (!subjects.length) notFound();

  return (
    <main className="min-h-screen bg-slate-950">
      <section className="bg-slate-900 text-white">
        <div className="max-w-4xl mx-auto px-4 py-12">
          <nav className="flex items-center gap-1 text-sm text-slate-300">
            <Link href="/" className="hover:text-white transition">
              Home
            </Link>
            <ChevronRight className="w-4 h-4" />
            <Link
              href={`/practice/${exam}`}
              className="hover:text-white transition"
            >
              {label}
            </Link>
            <ChevronRight className="w-4 h-4" />
            <span className="text-slate-100 font-medium">{year}</span>
          </nav>
          <h1 className="text-3xl md:text-4xl font-bold mt-4">
            {label} {year} Past Questions
          </h1>
          <p className="text-slate-300 mt-3 max-w-2xl">
            Pick a subject to start your practice session.
          </p>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-4 py-10">
        <h2 className="text-lg font-semibold text-slate-100 mb-4">
          Choose a subject
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {subjects.map((subject) => (
            <Link
              key={subject}
              href={buildCbtHref(examName, subject, year)}
              className="group flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900 p-5 hover:border-blue-500 hover:bg-slate-800 transition"
            >
              <span className="flex items-center gap-3">
                <BookOpen className="w-5 h-5 text-blue-400 shrink-0" />
                <span className="font-semibold text-slate-100">
                  {titleCase(subject)}
                </span>
              </span>
              <Play className="w-4 h-4 text-slate-500 group-hover:text-blue-400 transition" />
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
