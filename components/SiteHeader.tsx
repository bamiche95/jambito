import Link from "next/link";
import { GraduationCap } from "lucide-react";
import AuthButton from "@/components/AuthButton";

/**
 * App header.
 *
 * Wide screens carry the full marketing navigation: the logo, the five
 * destinations the landing page advertises, and the account buttons. On phones
 * only the logo and the account buttons fit — five links next to them on a
 * 360px screen is what made the app read as a website — so the destinations
 * live in the fixed tab bar (components/BottomNav.tsx) instead.
 *
 * Restyled for the edtech brand: blue logo tile, navy/orange wordmark, cream
 * sticky bar. The `dark:` overrides were dropped here on purpose so the brand
 * look holds on dark-mode devices too; app screens keep theirs.
 */
export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-cream/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 md:h-16 md:gap-4">
        <Link
          href="/"
          className="flex min-w-0 items-center gap-2 text-base font-extrabold md:text-lg"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-blue shadow-sm md:h-9 md:w-9">
            <GraduationCap className="h-5 w-5 text-white" aria-hidden />
          </span>
          <span className="truncate tracking-tight">
            <span className="text-navy">CBT-</span>
            <span className="text-brand-orange-soft">Practice</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-4 text-[13px] font-semibold text-slate-700 md:flex lg:gap-6 lg:text-sm">
          <Link href="/" className="transition hover:text-brand-blue">
            Home
          </Link>
          <Link href="/cbt" className="transition hover:text-brand-blue">
            Practice
          </Link>
          <Link href="/practice" className="transition hover:text-brand-blue">
            Exam Boards
          </Link>
          {/* The SEO-first syllabus tree: subject outlines for every exam board. */}
          <Link href="/syllabus" className="transition hover:text-brand-blue">
            Syllabus
          </Link>
          {/* Anchor into the live price card on the landing page. */}
          <Link href="/#pricing" className="transition hover:text-brand-blue">
            Pricing
          </Link>
          <Link href="/contact" className="hidden transition hover:text-brand-blue lg:inline">
            Contact
          </Link>
        </nav>

        <AuthButton />
      </div>
    </header>
  );
}


