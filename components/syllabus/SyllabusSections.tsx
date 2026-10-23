import Link from "next/link";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import PracticeCta from "@/components/syllabus/PracticeCta";
import TopicMapping from "@/components/syllabus/TopicMapping";
import { countTopicObjectives, type SyllabusSubject } from "@/lib/syllabus";

/**
 * Section → topic accordion for a subject page.
 *
 * Native `<details>`/`<summary>` on purpose:
 *  - the 729-topic tree stays fully static (works with JavaScript disabled, and
 *    crawlers see every objective in the HTML),
 *  - opening/closing costs no hydration,
 *  - the anchor ids double as deep links (`OpenHashDetails` expands them).
 *
 * Tap targets are at least 56px (`min-h-14`) for the mobile-first requirement.
 */
export default function SyllabusSections({
  subject,
  practiceHref,
}: {
  subject: SyllabusSubject;
  practiceHref: string;
}) {
  return (
    <div className="space-y-4">
      {subject.sections.map((section, sectionIndex) => {
        const sectionObjectives = section.topics.reduce(
          (total, topic) => total + countTopicObjectives(topic),
          0,
        );

        return (
          <details
            key={section.key}
            id={section.slug}
            open={sectionIndex === 0}
            className="group scroll-mt-24 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm open:border-blue-200 open:shadow-md"
          >
            <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-3 py-3.5 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-blue sm:px-4 [&::-webkit-details-marker]:hidden">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 text-sm font-extrabold text-brand-blue">
                {sectionIndex + 1}
              </span>
              <span className="min-w-0 flex-1">
                <h2 className="text-sm font-bold leading-snug text-slate-900 sm:text-base">
                  {section.title}
                </h2>
                <span className="mt-0.5 block text-[11px] font-medium text-slate-500">
                  {section.topics.length}{" "}
                  {section.topics.length === 1 ? "topic" : "topics"} ·{" "}
                  {sectionObjectives}{" "}
                  {sectionObjectives === 1 ? "objective" : "objectives"}
                </span>
              </span>
              <ChevronDown
                aria-hidden
                className="h-5 w-5 shrink-0 text-slate-400 transition-transform duration-200 group-open:rotate-180"
              />
            </summary>

            <div className="space-y-2.5 border-t border-slate-100 bg-slate-50/50 px-2.5 pb-3 pt-3 sm:px-4 sm:pb-4">
              {section.topics.map((topic, topicIndex) => {
                const objectiveCount = countTopicObjectives(topic);
                return (
                  <details
                    key={topic.key}
                    id={topic.slug}
                    className="group/topic scroll-mt-24 rounded-xl border border-slate-200 bg-white open:border-blue-200 open:bg-blue-50/20"
                  >
                    <summary className="flex min-h-14 cursor-pointer list-none items-center gap-2.5 px-3 py-3 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-blue [&::-webkit-details-marker]:hidden">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[11px] font-bold text-slate-600">
                        {topicIndex + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <h3 className="text-sm font-semibold leading-snug text-slate-900">
                          {topic.title}
                        </h3>
                        <span className="mt-0.5 block text-[11px] font-medium text-slate-500">
                          {topic.subtopics.length} content{" "}
                          {topic.subtopics.length === 1 ? "item" : "items"} ·{" "}
                          {objectiveCount}{" "}
                          {objectiveCount === 1 ? "objective" : "objectives"}
                        </span>
                      </span>
                      <ChevronDown
                        aria-hidden
                        className="h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 group-open/topic:rotate-180"
                      />
                    </summary>

                    <div className="border-t border-slate-100 px-3 pb-3.5 pt-3">
                      <TopicMapping topic={topic} />
                      <PracticeCta href={practiceHref} subjectName={subject.name} />
                      <Link
                        href={topic.href}
                        className="mt-3 inline-flex items-center gap-1 rounded text-xs font-semibold text-brand-blue transition hover:text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2"
                      >
                        Open “{topic.title}” as a full page
                        <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </details>
                );
              })}
            </div>
          </details>
        );
      })}
    </div>
  );
}
