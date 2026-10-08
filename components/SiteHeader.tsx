import Link from "next/link";
import { GraduationCap } from "lucide-react";
import AuthButton from "@/components/AuthButton";

export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg text-slate-900 dark:text-white">
          <span className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-blue-600 flex items-center justify-center">
            <GraduationCap className="w-5 h-5 text-white" />
          </span>
          CBT-Practice
        </Link>
        <nav className="flex items-center gap-5 text-sm font-medium text-slate-600 dark:text-slate-300">
          <Link href="/" className="hover:text-slate-900 dark:hover:text-white">Home</Link>
          <Link href="/cbt" className="hover:text-slate-900 dark:hover:text-white">Practice</Link>
          <Link href="/contact" className="hover:text-slate-900 dark:hover:text-white">Contact</Link>
          <AuthButton />
        </nav>
      </div>
    </header>
  );
}

