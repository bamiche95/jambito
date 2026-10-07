"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import AuthModal from "@/components/auth/AuthModal";

export default function AuthButton() {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);

  if (loading) {
    return <div className="w-20 h-9 rounded-lg bg-slate-100 animate-pulse" />;
  }

  if (user) {
    return (
      <Link
        href="/profile"
        className="px-4 py-2 rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:opacity-90 transition text-sm font-medium truncate max-w-[160px]"
      >
        {user.displayName ?? user.email ?? "Account"}
      </Link>
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
