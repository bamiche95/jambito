import { NotebookPen, Target } from "lucide-react";
import type { SyllabusTopic } from "@/lib/syllabus";

/**
 * The content ↔ objective mapping.
 *
 * Three source shapes exist, so there are three layouts and no guessing:
 *
 *  - **Paired** (21 subjects): every `content` sits next to its `objective` in a
 *    two-column card. Stacks to one column on phones, where the objective gets
 *    its own labelled block instead of a cramped half-width column.
 *  - **Split** (Physics, PHE, Music, Principles of Accounting): the content
 *    outline and the objective list are separate arrays, so they render as two
 *    equal cards. Pairing them by index would invent relationships that the
 *    syllabus does not state.
 *  - **Contents-only**: a handful of topics list no objectives at all.
 */
export default function TopicMapping({ topic }: { topic: SyllabusTopic }) {
  const hasPairedObjectives = topic.subtopics.some((item) => item.objective);

  if (hasPairedObjectives) {
    return (
      <div className="space-y-2">
        {topic.subtopics.map((item, index) => (
          <div
            key={`${topic.key}-${index}`}
            className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3 sm:grid-cols-2 sm:gap-4 sm:p-4"
          >
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-brand-blue">
                Content
              </p>
              <p className="mt-1 text-sm leading-relaxed text-slate-800">{item.content}</p>
            </div>
            <div className="min-w-0 border-t border-slate-200 pt-2 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-brand-orange-soft">
                Objective
              </p>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">
                {item.objective ?? "No separate objective is listed for this item."}
              </p>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (topic.objectives.length > 0) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 sm:p-4">
          <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-brand-blue">
            <NotebookPen aria-hidden className="h-3.5 w-3.5" />
            Contents / notes
          </p>
          <ul className="mt-2 space-y-2 text-sm leading-relaxed text-slate-800">
            {topic.subtopics.map((item, index) => (
              <li key={`${topic.key}-content-${index}`} className="flex gap-2">
                <span
                  aria-hidden
                  className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-blue"
                />
                <span className="min-w-0">{item.content}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 sm:p-4">
          <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-brand-orange-soft">
            <Target aria-hidden className="h-3.5 w-3.5" />
            Candidate objectives
          </p>
          <ul className="mt-2 space-y-2 text-sm leading-relaxed text-slate-600">
            {topic.objectives.map((objective, index) => (
              <li key={`${topic.key}-objective-${index}`} className="flex gap-2">
                <span
                  aria-hidden
                  className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-orange-soft"
                />
                <span className="min-w-0">{objective}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <ul className="space-y-2 text-sm leading-relaxed text-slate-800">
      {topic.subtopics.map((item, index) => (
        <li
          key={`${topic.key}-content-${index}`}
          className="flex gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5"
        >
          <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-blue" />
          <span className="min-w-0">{item.content}</span>
        </li>
      ))}
    </ul>
  );
}
