import Link from "next/link";
import AuthButton from "@/components/AuthButton";
import BrandLogo from "@/components/BrandLogo";
import MobileMenu from "@/components/MobileMenu";

/**
 * App header.
 *
 * Wide screens carry the full marketing navigation: the logo, the six
 * destinations the site advertises, and the account buttons. Phones cannot fit
 * a link row next to the logo and two account pills, so the destinations live
 * in the phone drawer (components/MobileMenu.tsx) and the fixed tab bar
 * (components/BottomNav.tsx) instead.
 *
 * The brand lockup itself is small enough for every width — 84px at `h-7` — so
 * it is shown on phones too and carries the home link's accessible name.
 * `AuthButton` drops its outlined "Log In" pill below `sm` to leave the lockup
 * room; signing in is still one tap away through the Register modal's tab
 * switch and through the Profile tab in the bottom bar.
 *
 * Restyled for the edtech brand: navy/green lockup on the cream sticky bar. The
 * `dark:` overrides were dropped here on purpose so the brand look holds on
 * dark-mode devices too; app screens keep theirs.
 */
export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-cream/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 md:h-16 md:gap-4">
        <Link href="/" className="flex min-w-0 shrink-0 items-center">
          <BrandLogo eager className="h-7 md:h-8" />
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

        {/* The account pills and the drawer button travel together so the
            desktop row keeps its old spacing (the button is `md:hidden`). */}
        <div className="flex shrink-0 items-center gap-2">
          <AuthButton />
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}


