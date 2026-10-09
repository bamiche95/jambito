"use client";

import { useState } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import AuthModal from "@/components/auth/AuthModal";

/**
 * Account affordance in the header.
 *
 * Signed out it offers the two doors the landing page advertises — an outlined
 * "Log In" and a solid orange "Register Free" pill. Both open the same modal on
 * different tabs; `key={mode}` remounts the card when the choice changes so its
 * internal state is re-seeded rather than inheriting the previous tab.
 *
 * Phones get compact versions of both: the header has no room for full pills
 * next to the logo on a 360px screen, and the fixed bottom bar
 * (components/BottomNav.tsx) already owns phone navigation.
 *
 * Signed in, the behaviour is unchanged: a name button on wide screens and an
 * initials avatar on phones, with a small dot reporting that access is active.
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
  const [mode, setMode] = useState<"signin" | "signup">("signup");

  if (loading) {
    return (
      <div className="h-9 w-10 md:w-20 rounded-full md:rounded-lg bg-slate-200/70 animate-pulse" />
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
            className="flex items-center gap-1.5 p-2.5 md:px-3 md:py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 transition hover:bg-white"
          >
            <ShieldCheck className="w-4 h-4" aria-hidden />
            <span className="hidden md:inline">Admin</span>
          </Link>
        )}
        <Link
          href="/profile"
          className="hidden md:inline-flex px-4 py-2 rounded-lg bg-navy text-white hover:opacity-90 transition text-sm font-medium truncate max-w-[160px]"
        >
          {label}
        </Link>
        <Link
          href="/profile"
          aria-label={`Your profile — ${label}`}
          className="md:hidden relative flex h-10 w-10 items-center justify-center rounded-full bg-navy text-sm font-semibold text-white transition-transform active:scale-95"
        >
          {initialsFor(label)}
          {active && (
            <span
              aria-hidden
              className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-cream bg-brand-emerald"
            />
          )}
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="flex shrink-0 items-center gap-2">
        <button
          onClick={() => {
            setMode("signin");
            setOpen(true);
          }}
          className="rounded-lg border-2 border-brand-orange px-3 py-1.5 text-xs font-bold text-brand-orange transition hover:bg-orange-50 active:scale-[0.98] md:px-4 md:py-2 md:text-sm"
        >
          Log In
        </button>
        <button
          onClick={() => {
            setMode("signup");
            setOpen(true);
          }}
          className="rounded-full bg-brand-orange px-3.5 py-2 text-xs font-bold text-white shadow-sm shadow-brand-orange/30 transition hover:bg-[#E64A19] active:scale-[0.98] md:px-5 md:py-2.5 md:text-sm"
        >
          Register Free
        </button>
      </div>
      <AuthModal
        key={mode}
        open={open}
        initialMode={mode}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

