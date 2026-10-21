"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Send,
  CheckCircle2,
  MessageCircle,
  Loader2,
  AlertCircle,
} from "lucide-react";

/** Shown when the server cannot deliver the message for us. */
const SUPPORT_EMAIL = "contact@cbtpractice.ng";

const LIMITS = { name: 80, email: 254, message: 4000 };
const MIN_MESSAGE = 10;

const INPUT_CLASS =
  "mt-2 min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-base text-slate-900 outline-none transition-colors placeholder:text-slate-400 hover:border-slate-300 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 sm:text-sm";

/** What `GET /api/contact` hands back: a signed "this form is being filled" proof. */
type Ticket = { token: string; issuedAt: number; minAgeMs: number };

type Status = "idle" | "sending" | "sent" | "error";

type DeliveryResult = { ok: true } | { ok: false; message: string };

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The public contact form.
 *
 * The POST carries a token issued by `GET /api/contact` on mount, and the
 * browser has to be at least a few seconds old to use it — see
 * lib/contactGuard.js for why. Everything the server checks is checked again
 * here only to give faster, friendlier messages; the server remains the
 * authority.
 *
 * The hidden `website` field is the honeypot. It sits off-screen rather than
 * using `display:none` because the simplest bots skip what is not rendered,
 * and it is removed from the tab order plus `aria-hidden` so real visitors and
 * screen-reader users never meet it.
 */
export default function ContactForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", message: "", contactExtra: "" });
  const ticketRef = useRef<Ticket | null>(null);

  const primeTicket = useCallback(async () => {
    try {
      const res = await fetch("/api/contact", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || typeof json?.token !== "string") return null;
      const ticket: Ticket = {
        token: json.token,
        issuedAt: Number(json.issuedAt) || Date.now(),
        minAgeMs: Math.max(0, Number(json.minAgeMs) || 3000),
      };
      ticketRef.current = ticket;
      return ticket;
    } catch {
      return null;
    }
  }, []);

  // Warm the token up while the visitor is still typing.
  useEffect(() => {
    void primeTicket();
  }, [primeTicket]);

  /**
   * Posts once, retrying a single time when the ticket was missing, expired or
   * younger than the minimum age — all recoverable without the visitor doing
   * anything beyond waiting a moment.
   */
  async function deliver(payload: { name: string; email: string; message: string }): Promise<DeliveryResult> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const ticket = ticketRef.current ?? (await primeTicket());
      if (!ticket) {
        return {
          ok: false,
          message: `We could not reach the server. Check your connection and try again, or email ${SUPPORT_EMAIL}.`,
        };
      }

      const remaining = ticket.minAgeMs - (Date.now() - ticket.issuedAt);
      if (remaining > 0) await wait(remaining);

      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, token: ticket.token }),
      });
      const json = await res.json().catch(() => null);

      if (res.ok && json?.success) return { ok: true };

      const code = typeof json?.code === "string" ? json.code : "";
      const recoverable =
        code === "too_fast" || code === "token_expired" || code === "token_invalid";
      if (recoverable) {
        ticketRef.current = null;
        if (attempt === 0) continue;
      }

      return {
        ok: false,
        message:
          typeof json?.message === "string" && json.message
            ? json.message
            : `Something went wrong on our side. Please email ${SUPPORT_EMAIL} and we will reply.`,
      };
    }

    return {
      ok: false,
      message: `We could not verify the form just now. Please try again, or email ${SUPPORT_EMAIL}.`,
    };
  }

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "sending") return;

    const name = form.name.trim();
    const email = form.email.trim();
    const message = form.message.trim();

    if (name.length < 2) {
      setError("Please tell us your name.");
      setStatus("error");
      return;
    }
    if (!email) {
      setError("Please add an email address so we can reply.");
      setStatus("error");
      return;
    }
    if (message.length < MIN_MESSAGE) {
      setError(`Please write at least ${MIN_MESSAGE} characters so we can help.`);
      setStatus("error");
      return;
    }

    setError(null);
    setStatus("sending");

    try {
      const result = await deliver({ name, email, message });
      if (!result.ok) {
        setError(result.message);
        setStatus("error");
        return;
      }
      setStatus("sent");
    } catch {
      setError(
        `We could not reach the server. Check your connection and try again, or email ${SUPPORT_EMAIL}.`
      );
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <div
        role="status"
        className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center"
      >
        <CheckCircle2 className="mx-auto mb-3 h-9 w-9 text-emerald-600" aria-hidden />
        <h3 className="font-semibold text-emerald-900">Message sent!</h3>
        <p className="mt-1 text-sm leading-6 text-emerald-800">
          Thanks {form.name}, we&apos;ll get back to you at {form.email}.
        </p>
        <button
          type="button"
          onClick={() => {
            setStatus("idle");
            setError(null);
            setForm({ name: "", email: "", message: "", contactExtra: "" });
            void primeTicket();
          }}
          className="mt-4 min-h-11 rounded-lg px-3 text-sm font-semibold text-emerald-800 underline decoration-emerald-400 underline-offset-4 transition-colors hover:text-emerald-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="relative space-y-4"
      aria-busy={status === "sending"}
    >
      {/* Honeypot — see the component comment. Off-screen, not display:none.
          Named `contact_extra` so browser/password autofill never targets it. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-[-9999px] top-0 h-px w-px overflow-hidden"
      >
        <label htmlFor="contact-extra">Leave this field empty</label>
        <input
          id="contact-extra"
          name="contact_extra"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={form.contactExtra}
          onChange={(e) => setForm({ ...form, contactExtra: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="block min-w-0 text-sm font-medium text-slate-700">
          Your name
          <input
            name="name"
            autoComplete="name"
            required
            maxLength={LIMITS.name}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Ada Okafor"
            className={INPUT_CLASS}
          />
        </label>
        <label className="block min-w-0 text-sm font-medium text-slate-700">
          Email address
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            maxLength={LIMITS.email}
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="you@example.com"
            className={INPUT_CLASS}
          />
        </label>
      </div>
      <label className="block text-sm font-medium text-slate-700">
        Message
        <textarea
          name="message"
          required
          maxLength={LIMITS.message}
          value={form.message}
          onChange={(e) => setForm({ ...form, message: e.target.value })}
          placeholder="Tell us a little about what you need help with…"
          rows={5}
          className="mt-2 min-h-36 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base leading-6 text-slate-900 outline-none transition-colors placeholder:text-slate-400 hover:border-slate-300 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 sm:text-sm"
        />
      </label>
      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p className="min-w-0">{error}</p>
        </div>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="submit"
          disabled={status === "sending"}
          className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white shadow-sm shadow-blue-900/10 transition-colors hover:bg-blue-700 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/25 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {status === "sending" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Sending…
            </>
          ) : (
            <>
              <Send className="h-4 w-4" aria-hidden /> Send message
            </>
          )}
        </button>
        <a
          href="https://wa.me/447572376272?text=Hi%20CBT-Practice%2C%20I%20need%20help"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-500/20"
        >
          <MessageCircle className="w-4 h-4" /> Chat on WhatsApp
        </a>
      </div>
      <p className="text-xs leading-5 text-slate-500">
        We use your details only to reply. See our{" "}
        <Link
          href="/privacy"
          className="font-medium text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          privacy policy
        </Link>
        .
      </p>
    </form>
  );
}
