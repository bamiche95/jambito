import Link from "next/link";
import { GraduationCap } from "lucide-react";
import AuthButton from "@/components/AuthButton";

/**
 * App header.
 *
 * On phones this is a slim branded bar: the logo plus the account avatar, with
 * the tab destinations living in the fixed bottom bar
 * (components/BottomNav.tsx). Squeezing Home/Practice/Contact next to a logo and
 * an account button on a 360px screen is what made the app read as a website —
 * at `md` and up there is room again, so the full link row comes back.
 */
export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
      <div className="max-w-6xl mx-auto px-4 h-14 md:h-16 flex items-center justify-between gap-4">
        <Link
          href="/"
          className="flex min-w-0 items-center gap-2 font-bold text-base md:text-lg text-slate-900 dark:text-white"
        >
          <span className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-blue-600 flex items-center justify-center shrink-0">
            <GraduationCap className="w-5 h-5 text-white" />
          </span>
          <span className="truncate">CBT-Practice</span>
        </Link>
        <nav className="hidden md:flex items-center gap-5 text-sm font-medium text-slate-600 dark:text-slate-300">
          <Link href="/" className="hover:text-slate-900 dark:hover:text-white">
            Home
          </Link>
          <Link href="/practice" className="hover:text-slate-900 dark:hover:text-white">
            Practice
          </Link>
          <Link
            href="/contact"
            className="hover:text-slate-900 dark:hover:text-white"
          >
            Contact
          </Link>
        </nav>
        <AuthButton />
      </div>
    </header>
  );
}


