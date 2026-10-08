"use client";

import { useState } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import AuthModal from "@/components/auth/AuthModal";

/**
 * Account affordance in the header.
 *
 * Phones get a compact avatar badge (the header has no room for "Home /
 * Practice / Contact" *and* a name button): tapping it opens the profile, and a
 * small dot reports that access is active.
 *
 * The admin entry stays visible on phones but drops to an icon-only button:
 * hiding it outright would leave `/admin` with no tap target anywhere in the
 * app, since no other screen links to it. The dashboard itself
 * (components/admin/**) is styled for wide screens and is untouched by any of
 * this.
 */

/** Two-letter badge for the avatar: "ada obi" -> "AO", "ada@x.com" -> "AE". */
function initialsFor(label: string): string {
  const words = label.replace(/[^a-zA-Z0-9]+/g, " ").trim().split(/\s+/);
  const letters = words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
  return letters || "U";
}

export default function AuthButton() {
  const { user, loading, isAdmin, isSubscribed, entitlementKnown } = useAuth();
  const [open, setOpen] = useState(false);

  if (loading) {
    return (
      <div className="w-10 h-10 md:w-20 md:h-9 rounded-full md:rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
    );
  }

  if (user) {
    const label = user.displayName ?? user.email ?? "Account";
    const active = isSubscribed && entitlementKnown;

    return (
      <div className="flex items-center gap-2 shrink-0">
        {isAdmin && (
          <Link
            href="/admin"
            aria-label="Admin dashboard"
            title="Admin dashboard"
            className="flex items-center gap-1.5 p-2.5 md:px-3 md:py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 md:hover:bg-slate-50 dark:md:hover:bg-slate-800 transition"
          >
            <ShieldCheck className="w-4 h-4" aria-hidden />
            <span className="hidden md:inline">Admin</span>
          </Link>
        )}
        <Link
          href="/profile"
          className="hidden md:inline-flex px-4 py-2 rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:opacity-90 transition text-sm font-medium truncate max-w-[160px]"
        >
          {label}
        </Link>
        <Link
          href="/profile"
          aria-label={`Your profile — ${label}`}
          className="md:hidden relative flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white transition-transform active:scale-95 dark:bg-white dark:text-slate-900"
        >
          {initialsFor(label)}
          {active && (
            <span
              aria-hidden
              className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500 dark:border-slate-950"
            />
          )}
        </Link>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:opacity-90 transition text-sm font-medium shrink-0"
      >
        Sign in
      </button>
      <AuthModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

