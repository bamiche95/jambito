"use client";

import { useState } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import AuthModal from "@/components/auth/AuthModal";

export default function AuthButton() {
  const { user, loading, isAdmin } = useAuth();
  const [open, setOpen] = useState(false);

  if (loading) {
    return <div className="w-20 h-9 rounded-lg bg-slate-100 animate-pulse" />;
  }

  if (user) {
    return (
      <div className="flex items-center gap-2">
        {isAdmin && (
          <Link
            href="/admin"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
            title="Admin dashboard"
          >
            <ShieldCheck className="w-4 h-4" />
            Admin
          </Link>
        )}
        <Link
          href="/profile"
          className="px-4 py-2 rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:opacity-90 transition text-sm font-medium truncate max-w-[160px]"
        >
          {user.displayName ?? user.email ?? "Account"}
        </Link>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:opacity-90 transition text-sm font-medium"
      >
        Sign in
      </button>
      <AuthModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
