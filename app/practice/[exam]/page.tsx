import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { CalendarDays, ChevronRight } from "lucide-react";
import { getYears } from "@/lib/questions";
import { examSlugToName, examLabel } from "@/lib/catalog";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ exam: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { exam } = await params;
  const label = examLabel(examSlugToName(exam));
  const title = `${label} Past Questions — Choose a Year`;
  const description = `Browse ${label} past questions by year and practice online with answers and detailed explanations on CBT-Practice.`;
  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary", title, description },
  };
}

export default async function ExamYearsPage({ params }: PageProps) {
  const { exam } = await params;
  const examName = examSlugToName(exam);
  const label = examLabel(examName);

  let years: string[] = [];
  try {
    const result = await getYears(examName);
    years = Array.isArray(result?.data) ? result.data : [];
  } catch (error) {
    console.error("Failed to load years:", error);
    notFound();
  }

  if (!years.length) notFound();

  return (
    <main className="min-h-screen bg-slate-950">
      <section className="bg-slate-900 text-white">
        <div className="max-w-4xl mx-auto px-4 py-12">
          <nav className="flex items-center gap-1 text-sm text-slate-300">
            <Link href="/" className="hover:text-white transition">
              Home
            </Link>
            <ChevronRight className="w-4 h-4" />
            <span className="text-slate-100 font-medium">{label}</span>
          </nav>
          <h1 className="text-3xl md:text-4xl font-bold mt-4">
            {label} Past Questions
          </h1>
          <p className="text-slate-300 mt-3 max-w-2xl">
            Pick a year to see the available subjects and start practicing.
          </p>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-4 py-10">
        <h2 className="text-lg font-semibold text-slate-100 mb-4">
          Choose a year
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {years.map((year) => (
            <Link
              key={year}
              href={`/practice/${exam}/${year}`}
              className="group flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4 hover:border-blue-500 hover:bg-slate-800 transition"
            >
              <CalendarDays className="w-5 h-5 text-blue-400 shrink-0" />
              <span className="font-semibold text-slate-100">{year}</span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
