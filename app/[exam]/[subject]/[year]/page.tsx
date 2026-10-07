import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Play, CheckCircle2 } from "lucide-react";
import { getQuestions } from "@/lib/questions";
import { examSlugToName, deslugify, titleCase } from "@/lib/catalog";
import type { Question } from "@/lib/types";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ exam: string; subject: string; year: string }>;
}

function slugMeta(exam: string, subject: string) {
  const examName = examSlugToName(exam);
  const subjectName = deslugify(subject);
  const displaySubject = titleCase(subjectName);
  return { examName, subjectName, displaySubject };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { exam, subject, year } = await params;
  const { examName, displaySubject } = slugMeta(exam, subject);
  const title = `${examName} ${displaySubject} ${year} Past Questions and Answers`;
  const description = `Free ${examName} ${displaySubject} ${year} past questions with answers and detailed explanations. Practice online or offline with Jambito.`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
    },
    twitter: { card: "summary", title, description },
  };
}

export default async function QuestionSetPage({ params }: PageProps) {
  const { exam, subject, year } = await params;
  const { examName, subjectName, displaySubject } = slugMeta(exam, subject);

  let result;
  try {
    result = await getQuestions({
      exam: examName,
      exam_year_id: year,
      subject: subjectName,
      page: 1,
    });
  } catch (error) {
    console.error("Failed to load questions:", error);
    notFound();
  }

  const questions: Question[] = result?.data?.questions ?? [];
  if (!questions.length) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Quiz",
    name: `${examName} ${displaySubject} ${year} Past Questions`,
    about: { "@type": "EducationalOrganization", name: examName },
    educationalLevel: "Secondary / Tertiary",
    hasPart: questions.slice(0, 20).map((q, i) => ({
      "@type": "Question",
      name: q.question,
      text: q.question,
      position: i + 1,
      suggestedAnswer: {
        "@type": "Answer",
        text: q.options[q.correctAnswer] ?? q.correctAnswer,
      },
      acceptedAnswer: {
        "@type": "Answer",
        text: q.options[q.correctAnswer] ?? q.correctAnswer,
      },
    })),
  };

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />

      <section className="bg-slate-900 text-white">
        <div className="max-w-4xl mx-auto px-4 py-12">
          <p className="text-sm uppercase tracking-widest text-blue-300">
            {examName} Past Questions
          </p>
          <h1 className="text-3xl md:text-4xl font-bold mt-2">
            {displaySubject} {year}
          </h1>
          <p className="text-slate-300 mt-3 max-w-2xl">
            {questions.length} free {examName} {displaySubject} {year} questions
            with correct answers and explanations.
          </p>
          <Link
            href={`/cbt?exam=${encodeURIComponent(examName)}&subject=${encodeURIComponent(subjectName)}&year=${encodeURIComponent(year)}`}
            className="inline-flex items-center gap-2 mt-6 px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition"
          >
            <Play className="w-4 h-4" /> Practice this set
          </Link>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-4 py-10 space-y-6">
        {questions.map((q, index) => (
          <article
            key={q.id ?? index}
            className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6"
          >
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">
              <span className="text-blue-600 mr-2">Q{index + 1}.</span>
              {q.question}
            </h2>
            <ul className="mt-4 space-y-2">
              {Object.entries(q.options).map(([key, value]) => (
                <li
                  key={key}
                  className={
                    key === q.correctAnswer
                      ? "flex items-start gap-2 text-green-700 dark:text-green-400 font-medium"
                      : "flex items-start gap-2 text-slate-600 dark:text-slate-300"
                  }
                >
                  {key === q.correctAnswer ? (
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                  ) : (
                    <span className="w-4 text-right shrink-0 font-bold">
                      {key}.
                    </span>
                  )}
                  <span>{value}</span>
                </li>
              ))}
            </ul>
            {q.explanation && (
              <p className="mt-4 text-sm text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg">
                <span className="font-semibold">Explanation: </span>
                {q.explanation}
              </p>
            )}
          </article>
        ))}

        <div className="text-center pt-4">
          <Link
            href={`/cbt?exam=${encodeURIComponent(examName)}&subject=${encodeURIComponent(subjectName)}&year=${encodeURIComponent(year)}`}
            className="inline-flex items-center gap-2 px-8 py-3 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg font-semibold hover:opacity-90 transition"
          >
            <Play className="w-4 h-4" /> Start CBT Practice
          </Link>
        </div>
      </section>
    </main>
  );
}
