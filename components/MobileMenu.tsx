"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookMarked,
  ChevronRight,
  Menu,
  MessageCircle,
  School,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Phone navigation drawer.
 *
 * The header's link row only fits from `md` up, so on a phone the syllabus tree
 * and the exam boards were reachable from the footer alone — several screens of
 * scrolling away in the installed PWA. This island adds the missing entry
 * point: a menu button that slides a panel in from the right edge.
 *
 * It carries only what the fixed tab bar (components/BottomNav.tsx) does not:
 * the syllabus tree, the exam boards and, at the foot of the panel, Contact.
 * Home, Practice, History, Stats and Profile are already one tap away in that
 * bar, so repeating them here would be noise.
 *
 * The panel is portaled to <body> for the same reason as the auth modal: the
 * header is `sticky` *and* blurred, and a `backdrop-filter` ancestor becomes the
 * containing block for `position: fixed`, which would otherwise pin the drawer
 * to the header instead of the viewport. The portal only renders after
 * hydration, so the static HTML stays identical to the server output.
 *
 * Motion and dismissal follow the install sheet: slide/fade in, Escape closes,
 * the page behind stops scrolling, and focus returns to the menu button. A
 * full-height panel also traps Tab so keyboard and screen-reader users cannot
 * wander into the dimmed page behind it.
 */

interface MenuItem {
  href: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  /** True when this destination should read as the current page. */
  isActive: (pathname: string) => boolean;
}

const ITEMS: MenuItem[] = [
  {
    href: "/syllabus",
    label: "JAMB Syllabus",
    hint: "Every subject outline, topic by topic",
    icon: BookMarked,
    isActive: (pathname) => pathname.startsWith("/syllabus"),
  },
  {
    href: "/practice",
    label: "Exam Boards",
    hint: "JAMB, WAEC, POST-UTME and more",
    icon: School,
    isActive: (pathname) => pathname.startsWith("/practice"),
  },
];

const emptySubscribe = () => () => {};

/**
 * `false` during the server render and the hydration render, `true` afterwards.
 * Keeps `createPortal` (which needs `document`) out of the server render.
 */
function useHydrated() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

export default function MobileMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const hydrated = useHydrated();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const trigger = triggerRef.current;
    panelRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled])',
        ),
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    // The page behind the panel must not scroll underneath it.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      (previouslyFocused ?? trigger)?.focus();
    };
  }, [open]);

  // A phone turned to landscape — or a tablet-width window — shows the header's
  // own link row, so the drawer must not linger open on top of it.
  useEffect(() => {
    if (!open) return;
    const wide = window.matchMedia("(min-width: 48rem)");
    const closeOnWide = (event: MediaQueryListEvent) => {
      if (event.matches) setOpen(false);
    };
    wide.addEventListener("change", closeOnWide);
    return () => wide.removeEventListener("change", closeOnWide);
  }, [open]);

  function close() {
    setOpen(false);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="site-menu"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white/80 text-slate-700 transition hover:text-brand-blue active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2 focus-visible:ring-offset-cream md:hidden"
      >
        <Menu aria-hidden className="h-5 w-5" />
      </button>

      {hydrated &&
        open &&
        createPortal(
          <div className="fixed inset-0 z-90 md:hidden">
            <button
              type="button"
              aria-label="Close menu"
              onClick={close}
              className="animate-backdrop-in absolute inset-0 cursor-default bg-navy/40 backdrop-blur-sm motion-reduce:animate-none"
            />

            <div
              ref={panelRef}
              id="site-menu"
              role="dialog"
              aria-modal="true"
              aria-labelledby="site-menu-title"
              tabIndex={-1}
              className="animate-drawer-in absolute inset-y-0 right-0 flex w-[min(20rem,85vw)] flex-col bg-cream shadow-2xl outline-none motion-reduce:animate-none"
            >
              <div className="flex h-14 items-center justify-between border-b border-slate-200/80 pl-4 pr-2">
                <span
                  id="site-menu-title"
                  className="text-xs font-bold uppercase tracking-[0.14em] text-brand-orange"
                >
                  Menu
                </span>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close menu"
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white hover:text-slate-900 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
                >
                  <X aria-hidden className="h-5 w-5" />
                </button>
              </div>

              <nav
                aria-label="Site menu"
                className="flex-1 overflow-y-auto px-3 py-4"
              >
                <ul className="space-y-1">
                  {ITEMS.map(({ href, label, hint, icon: Icon, isActive }) => {
                    const active = isActive(pathname);
                    return (
                      <li key={href}>
                        <Link
                          href={href}
                          onClick={close}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex items-center gap-3 rounded-xl px-3 py-3 transition",
                            active
                              ? "bg-white text-brand-blue shadow-sm ring-1 ring-slate-200"
                              : "text-slate-800 hover:bg-white",
                          )}
                        >
                          <span
                            aria-hidden
                            className={cn(
                              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                              active
                                ? "bg-brand-blue text-white"
                                : "bg-brand-blue/10 text-brand-blue",
                            )}
                          >
                            <Icon className="h-[18px] w-[18px]" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold">
                              {label}
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-slate-500">
                              {hint}
                            </span>
                          </span>
                          <ChevronRight
                            aria-hidden
                            className="h-4 w-4 shrink-0 text-slate-400"
                          />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </nav>

              <div className="border-t border-slate-200/80 px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                <p className="px-3 pb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                  Support
                </p>
                <Link
                  href="/contact"
                  onClick={close}
                  aria-current={pathname === "/contact" ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-3 transition",
                    pathname === "/contact"
                      ? "bg-white text-brand-blue shadow-sm ring-1 ring-slate-200"
                      : "text-slate-800 hover:bg-white",
                  )}
                >
                  <span
                    aria-hidden
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-orange/10 text-brand-orange"
                  >
                    <MessageCircle className="h-[18px] w-[18px]" />
                  </span>
                  <span className="text-sm font-semibold">Contact</span>
                  <ChevronRight
                    aria-hidden
                    className="ml-auto h-4 w-4 shrink-0 text-slate-400"
                  />
                </Link>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
