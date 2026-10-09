"use client";

import { useState } from "react";
import { CheckCircle2, Send } from "lucide-react";

/**
 * Newsletter capture for the footer card.
 *
 * There is no newsletter endpoint in this project, so this deliberately mirrors
 * `components/ContactForm.tsx` — the established pattern for a form with no
 * backend behind it: validate locally, confirm in place, send nothing. It is a
 * client component so `SiteFooter` can stay a server component and avoid
 * shipping the whole footer as JS.
 *
 * Wiring a real list later means replacing the single `setSent(true)` call with
 * a `fetch`; the states and markup below do not have to change.
 */
export default function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <p
        role="status"
        className="flex items-start gap-2 rounded-xl bg-white/15 px-3 py-3 text-sm leading-5 text-white"
      >
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        You&apos;re on the list. Exam tips are on the way to {email}.
      </p>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (email.trim()) setSent(true);
      }}
      className="space-y-3"
    >
      <label className="sr-only" htmlFor="footer-newsletter-email">
        Email address
      </label>
      <input
        id="footer-newsletter-email"
        type="email"
        required
        name="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Enter your email"
        className="min-h-12 w-full rounded-full border border-white/40 bg-white/10 px-4 text-base text-white outline-none transition placeholder:text-white/60 hover:border-white/60 focus:border-white focus:bg-white/20 focus:ring-4 focus:ring-white/20 sm:text-sm"
      />
      <button
        type="submit"
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-brand-orange px-5 font-bold text-white shadow-md shadow-black/20 transition hover:bg-[#E64A19] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/30"
      >
        <Send className="h-4 w-4" aria-hidden />
        Subscribe
      </button>
    </form>
  );
}
