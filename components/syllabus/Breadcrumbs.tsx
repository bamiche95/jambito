import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BreadcrumbItem {
  label: string;
  /** Omit on the final crumb (it is the current page). */
  href?: string;
}

/**
 * Breadcrumb trail shared by the syllabus pages.
 *
 * Two tones because the detail pages open on a navy hero (`dark`) while the
 * subject index sits on the cream page background (`light`). The trail is a
 * plain server component so it adds no JavaScript to a 729-page tree.
 */
export default function Breadcrumbs({
  items,
  tone = "light",
}: {
  items: BreadcrumbItem[];
  tone?: "light" | "dark";
}) {
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol
        className={cn(
          "flex flex-wrap items-center gap-1.5 text-xs font-medium",
          tone === "dark" ? "text-slate-300" : "text-slate-500",
        )}
      >
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1.5">
              {index > 0 ? (
                <ChevronRight aria-hidden className="h-3 w-3 shrink-0 opacity-60" />
              ) : null}
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className={cn(
                    "truncate transition",
                    tone === "dark" ? "hover:text-white" : "hover:text-brand-blue",
                  )}
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={isLast ? "page" : undefined}
                  className={cn(
                    "truncate",
                    tone === "dark" ? "text-white" : "text-slate-700",
                  )}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
