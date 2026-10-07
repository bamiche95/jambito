import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
      <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-500 dark:text-slate-400">
        <p>© {new Date().getFullYear()} Jambito. Made for Nigerian students.</p>
        <div className="flex items-center gap-5">
          <Link href="/contact" className="hover:text-slate-800 dark:hover:text-slate-200">Contact</Link>
          <Link href="/cbt" className="hover:text-slate-800 dark:hover:text-slate-200">Practice</Link>
        </div>
      </div>
    </footer>
  );
}
