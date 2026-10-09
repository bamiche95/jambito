import Link from "next/link";
import type { ReactElement } from "react";
import { GraduationCap } from "lucide-react";
import NewsletterForm from "@/components/NewsletterForm";
import {
  AppleIcon,
  FacebookIcon,
  GooglePlayIcon,
  InstagramIcon,
  TikTokIcon,
  XIcon,
  YouTubeIcon,
} from "@/components/BrandIcons";
import {
  MortarboardDoodle,
  PlaneDoodle,
  PencilDoodle,
  Sparkle,
  Squiggle,
} from "@/components/home/Doodles";
import { examNameToSlug, examLabel } from "@/lib/catalog";

/**
 * Site footer — the deep navy wave block on the landing page and on every app
 * page that renders `SiteHeader`.
 *
 * It stays a server component: the one interactive part (the newsletter card) is
 * the `NewsletterForm` client island, the same split the contact page uses for
 * `ContactForm`.
 *
 * The wave at the top has no background of its own. Its transparent area shows
 * whatever is behind it, so the crest reads correctly on the cream landing page
 * and on the plain white app pages without the footer having to know which page
 * it is on.
 *
 * The Exam Boards column lists the boards the question provider actually
 * serves, so every link resolves. `lib/catalog.ts`'s `EXAMS` is deliberately
 * not used here: it is the static fallback for the SEO routes (JAMB, WAEC,
 * POST-UTME only), while `/api/questions?get=exam` currently returns five
 * boards — the same five the practice picker already links to. Keep this list
 * in step with that response rather than with the static fallback.
 */

type IconComponent = (props: { className?: string }) => ReactElement;

const QUICK_LINKS = [
  { href: "/", label: "Home" },
  { href: "/cbt", label: "Practice" },
  { href: "/practice", label: "Exam Boards" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/contact", label: "Contact" },
];

/** Support destinations that exist today — no invented routes. */
const SUPPORT_LINKS = [
  { href: "/contact", label: "Help Center" },
  { href: "/cbt", label: "CBT Guide" },
  { href: "/practice", label: "Study Tips" },
  { href: "/contact", label: "Contact Support" },
];

/**
 * The boards the provider serves, in the order students meet them. Exported
 * only so the value is greppable from here — the footer is the sole consumer.
 */
const BOARDS = ["JAMB", "WAEC", "POSTUTME", "GCE", "GST"] as const;

/**
 * Social pills.
 *
 * `href` is deliberately nullable: there are no official profiles yet, and
 * inventing a handle would send students to a stranger's account. Until one is
 * supplied the pill renders as decoration; add a URL and it becomes a real,
 * labelled link with no other change.
 */
const SOCIALS: { label: string; Icon: IconComponent; href: string | null }[] = [
  { label: "TikTok", Icon: TikTokIcon, href: null },
  { label: "YouTube", Icon: YouTubeIcon, href: null },
  { label: "Instagram", Icon: InstagramIcon, href: null },
  { label: "Facebook", Icon: FacebookIcon, href: null },
  { label: "X", Icon: XIcon, href: null },
];

function StoreBadge({
  Icon,
  eyebrow,
  name,
}: {
  Icon: IconComponent;
  eyebrow: string;
  name: string;
}) {
  /*
   * Decorative, not a link. These badges stand in for store listings that do
   * not exist — CBT-Practice installs as a PWA — so pointing them at an App
   * Store or Play Store URL would be a lie. The real affordance is
   * `InstallPwaBanner` on the landing page.
   */
  return (
    <span
      aria-hidden
      className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-black/30 px-3 py-2"
    >
      <Icon className="h-5 w-5 text-white" />
      <span className="leading-none">
        <span className="block text-[9px] uppercase tracking-wide text-white/70">
          {eyebrow}
        </span>
        <span className="block text-sm font-semibold text-white">{name}</span>
      </span>
    </span>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { href: string; label: string }[];
}) {
  return (
    <div className="lg:col-span-2">
      <h3 className="text-sm font-bold text-white">{title}</h3>
      <ul className="mt-4 space-y-2.5 text-sm">
        {links.map((link) => (
          <li key={link.label}>
            <Link
              href={link.href}
              className="text-white/75 transition hover:text-brand-orange-soft"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function SiteFooter() {
  return (
    <footer className="relative mt-16">
      {/* Wave. Transparent above the crest so the page background shows through. */}
      <div aria-hidden className="pointer-events-none select-none">
        <svg
          viewBox="0 0 1440 120"
          preserveAspectRatio="none"
          className="block h-10 w-full text-navy sm:h-16"
        >
          <path
            fill="currentColor"
            d="M0 64C240 8 480 8 720 56C960 104 1200 104 1440 48V120H0V64Z"
          />
        </svg>
      </div>

      <div className="relative overflow-hidden bg-navy text-white">
        {/* Doodles: absolutely positioned and decorative, so they never affect
            the column layout or the accessibility tree. */}
        <Sparkle className="absolute left-6 top-10 h-5 w-5" />
        <Sparkle color="#2563EB" className="absolute bottom-24 right-10 h-4 w-4" />
        <Sparkle color="#10B981" className="absolute right-1/3 top-8 h-3.5 w-3.5" />
        <Sparkle color="#F97316" className="absolute bottom-10 left-1/4 h-5 w-5" />
        <PencilDoodle className="absolute -left-2 top-4 h-9 w-9 rotate-12" />
        <PlaneDoodle className="absolute -right-1 top-16 h-9 w-9 -rotate-12" />
        <MortarboardDoodle className="absolute -left-3 bottom-28 h-10 w-10 rotate-12" />
        <PlaneDoodle className="absolute -right-2 bottom-12 h-9 w-9 rotate-12" />
        <Squiggle color="#10B981" className="absolute right-24 top-1/2 h-3 w-10" />

        <div className="relative mx-auto max-w-6xl px-4 pb-8 pt-10 sm:pt-14">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-12 lg:gap-8">
            <div className="lg:col-span-3">
              <Link href="/" className="flex items-center gap-2 text-lg font-extrabold">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-blue">
                  <GraduationCap className="h-5 w-5 text-white" aria-hidden />
                </span>
                <span className="tracking-tight">
                  <span className="text-white">CBT-</span>
                  <span className="text-brand-orange-soft">Practice</span>
                </span>
              </Link>
              <p className="mt-4 max-w-xs text-sm leading-6 text-white/75">
                Empowering Nigerian students to pass JAMB, WAEC, NECO &amp; POST
                UTME with confidence. Practice offline, anytime!
              </p>

              <h3 className="mt-6 text-sm font-bold text-white">Get the App</h3>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <StoreBadge Icon={AppleIcon} eyebrow="Download on the" name="App Store" />
                <StoreBadge Icon={GooglePlayIcon} eyebrow="GET IT ON" name="Google Play" />
              </div>

              <ul className="mt-5 flex items-center gap-2.5">
                {SOCIALS.map(({ label, Icon, href }) => (
                  <li key={label}>
                    {href ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={label}
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-brand-orange"
                      >
                        <Icon className="h-4 w-4" />
                      </a>
                    ) : (
                      <span
                        aria-hidden
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/70"
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>


            <FooterColumn title="Quick Links" links={QUICK_LINKS} />

            <div className="lg:col-span-2">
              <h3 className="text-sm font-bold text-white">Exam Boards</h3>
              <ul className="mt-4 space-y-2.5 text-sm">
                {BOARDS.map((exam) => (
                  <li key={exam}>
                    <Link
                      href={`/practice/${examNameToSlug(exam)}`}
                      className="text-white/75 transition hover:text-brand-orange-soft"
                    >
                      {examLabel(exam)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <FooterColumn title="Support" links={SUPPORT_LINKS} />

            <div className="lg:col-span-3">
              <div className="relative overflow-hidden rounded-2xl bg-linear-to-br from-blue-600 via-indigo-600 to-fuchsia-600 p-5 shadow-xl">
                <Sparkle
                  color="#FFFFFF"
                  className="absolute right-4 top-4 h-5 w-5 opacity-80"
                />
                <Sparkle
                  color="#FFFFFF"
                  className="absolute bottom-6 right-10 h-3 w-3 opacity-60"
                />
                <p className="relative text-lg font-extrabold leading-tight">
                  Stay Ahead of the Game! 🚀
                </p>
                <p className="relative mt-2 text-sm leading-5 text-white/85">
                  Get exam tips, past question updates, and more.
                </p>
                <div className="relative mt-4">
                  <NewsletterForm />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-6 text-sm text-white/70 sm:flex-row">
            <p>
              © {new Date().getFullYear()} CBT-Practice. All rights reserved. Built
              with <span aria-hidden>❤️</span> for Nigerian students.
            </p>
            <div className="flex items-center gap-5">
              <Link href="/privacy" className="transition hover:text-white">
                Privacy Policy
              </Link>
              <Link href="/terms" className="transition hover:text-white">
                Terms of Use
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

