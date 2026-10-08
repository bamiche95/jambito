"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Home, User, Zap, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Fixed native-style tab bar — phones only (`md:hidden`).
 *
 * On wide screens the header (components/SiteHeader.tsx) still carries the full
 * link row, so this bar is purely additive: the practice, CBT and SEO question
 * routes have no site header of their own, and students arriving from Google
 * on a phone previously had no way back to the app's main sections.
 *
 * Two deliberate deviations from the reference design:
 * 1. `z-40`, not `z-50`. The paywall and auth modals are `z-50` / `z-100` (see
 *    the z-index ladder documented in components/cbt/CbtPractice.tsx). Because
 *    the layout renders this bar after the page content, a `z-50` bar would
 *    paint *over* the paywall — the one thing that must never be obscured.
 * 2. It hides itself on `/cbt`, which is a live timed exam (own sticky toolbar,
 *    auto-submit). A tab that navigates away mid-paper loses the attempt.
 */

/** Path prefixes where the tab bar is suppressed. */
const HIDDEN_PREFIXES = ["/cbt"];

export interface NavItem {
  /** Where the tab goes. `/#pricing` is an in-page anchor on the home page. */
  href: string;
  label: string;
  icon: LucideIcon;
  /** True when this tab should read as the current location. */
  isActive: (pathname: string) => boolean;
}

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "Home",
    icon: Home,
    isActive: (pathname) => pathname === "/",
  },
  {
    href: "/cbt",
    label: "Practice",
    icon: BookOpen,
    isActive: (pathname) =>
      pathname === "/cbt" || pathname.startsWith("/practice"),
  },
  {
    // The offer lives in a section of the home page, not on its own route, so
    // there is nothing to highlight when the user is on another page.
    href: "/#pricing",
    label: "Pass",
    icon: Zap,
    isActive: () => false,
  },
  {
    href: "/profile",
    label: "Profile",
    icon: User,
    isActive: (pathname) => pathname.startsWith("/profile"),
  },
];

/** Whether the tab bar belongs on this route. */
export function shouldShowBottomNav(pathname: string): boolean {
  return !HIDDEN_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export default function BottomNav() {
  const pathname = usePathname();

  if (!shouldShowBottomNav(pathname)) return null;

  return (
    <nav
      aria-label="Primary"
      className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/90 backdrop-blur-md md:hidden dark:border-slate-800 dark:bg-slate-900/90"
    >
      <ul className="grid grid-cols-4">
        {NAV_ITEMS.map((item) => {
          const active = item.isActive(pathname);
          const content = (
            <>
              <span
                aria-hidden
                className={cn(
                  "absolute top-0 h-0.5 w-8 rounded-full bg-blue-600 dark:bg-blue-400 transition-opacity",
                  active ? "opacity-100" : "opacity-0"
                )}
              />
              <item.icon aria-hidden className="h-5 w-5" />
              <span className="text-[11px] font-medium">{item.label}</span>
            </>
          );
          const className = cn(
            "relative flex min-h-12 flex-col items-center justify-center gap-1 px-1 pt-2.5 pb-2 transition-colors active:opacity-60",
            active
              ? "text-blue-600 dark:text-blue-400"
              : "text-slate-500 dark:text-slate-400"
          );
          const current = active ? ("page" as const) : undefined;

          return (
            <li key={item.href}>
              {item.href === "/#pricing" && pathname === "/" ? (
                // Same route: a real anchor so the browser scrolls to the
                // section smoothly (html { scroll-behavior: smooth }) instead
                // of a router navigation to where we already are.
                <a href="#pricing" className={className} aria-current={current}>
                  {content}
                </a>
              ) : (
                <Link
                  href={item.href}
                  className={className}
                  aria-current={current}
                >
                  {content}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
