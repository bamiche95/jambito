"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  ChartNoAxesColumnIncreasing,
  History,
  House,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Fixed native-style tab bar — phones only (`md:hidden`).
 *
 * On wide screens the header (components/SiteHeader.tsx) still carries the full
 * link row, so this bar is purely additive: the practice, CBT and SEO question
 * routes have no site header of their own, and students arriving from Google
 * on a phone previously had no way back to the app's main sections.
 *
 * The tab remains available during CBT. In-progress answers and time are
 * checkpointed locally, so switching destinations does not discard a session.
 */

export interface NavItem {
  /** Destination for this tab. */
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
    icon: House,
    isActive: (pathname) => pathname === "/",
  },
  {
    href: "/practice",
    label: "Practice",
    icon: BookOpen,
    isActive: (pathname) =>
      pathname === "/cbt" ||
      pathname.startsWith("/practice") ||
      /^\/[^/]+\/[^/]+\/[^/]+$/.test(pathname),
  },
  {
    href: "/history",
    label: "History",
    icon: History,
    isActive: (pathname) => pathname.startsWith("/history"),
  },
  {
    href: "/stats",
    label: "Stats",
    icon: ChartNoAxesColumnIncreasing,
    isActive: (pathname) => pathname.startsWith("/stats"),
  },
  {
    href: "/profile",
    label: "Profile",
    icon: UserRound,
    isActive: (pathname) => pathname.startsWith("/profile"),
  },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/90 backdrop-blur-md md:hidden dark:border-slate-800 dark:bg-slate-900/90"
    >
      <ul className="grid grid-cols-5">
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
              <span className="text-[10px] font-medium leading-none sm:text-[11px]">
                {item.label}
              </span>
            </>
          );
          const className = cn(
            "relative flex min-h-14 flex-col items-center justify-center gap-1 px-0.5 pt-2 pb-2 transition-colors active:opacity-60",
            active
              ? "text-blue-600 dark:text-blue-400"
              : "text-slate-500 dark:text-slate-400"
          );
          const current = active ? ("page" as const) : undefined;

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={className}
                aria-current={current}
              >
                {content}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
