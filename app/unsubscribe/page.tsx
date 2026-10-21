import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, MailX } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { verifyUnsubscribeToken } from "@/lib/emailTokens";

export const metadata: Metadata = {
  title: "Email preferences",
  description: "Turn off CBT-Practice progress emails.",
  // An unsubscribe URL is per-account; search engines must never index one.
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

/**
 * The unsubscribe landing page.
 *
 * A server component: the token is verified before anything renders, and the
 * confirm button is a plain HTML form posted to /api/unsubscribe. No client JS
 * is needed, which matters for a link that is often opened in an in-app browser
 * with scripting disabled.
 */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const uid = first(params.u).trim();
  const token = first(params.t).trim();
  const done = first(params.done) === "1";
  const failed = first(params.error) === "1";
  const valid = Boolean(uid && token && verifyUnsubscribeToken(uid, token));

  return (
    <div className="flex flex-1 flex-col bg-cream">
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12 sm:py-16">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-orange">
          Email preferences
        </p>

        {done ? (
          <section className="mt-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
              <CheckCircle2 className="h-6 w-6" aria-hidden />
            </span>
            <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-slate-900">
              You are unsubscribed
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              We will not send you any more progress emails. Your account,
              subscription and practice history are untouched — you can keep
              using CBT-Practice exactly as before.
            </p>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Changed your mind? Write to us from the{" "}
              <Link href="/contact" className="font-semibold text-brand-blue">
                contact page
              </Link>{" "}
              and we will turn them back on.
            </p>
            <Link
              href="/cbt"
              className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
            >
              Back to practice
            </Link>
          </section>
        ) : !valid || failed ? (
          <section className="mt-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-700">
              <AlertTriangle className="h-6 w-6" aria-hidden />
            </span>
            <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-slate-900">
              This link is not valid
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              The link may have been copied incompletely, or it belongs to an
              account that no longer exists. You can still ask us to stop the
              emails from the{" "}
              <Link href="/contact" className="font-semibold text-brand-blue">
                contact page
              </Link>
              .
            </p>
          </section>
        ) : (
          <section className="mt-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-700">
              <MailX className="h-6 w-6" aria-hidden />
            </span>
            <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-slate-900">
              Turn off progress emails?
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              These are the occasional emails about your own practice: a
              reminder about an unfinished set, a nudge if you have not started,
              and a note when your free questions run out.
            </p>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Unsubscribing does not affect your account, your subscription or
              your access to any question. You can also keep receiving them and
              close this page.
            </p>

            <form method="post" action="/api/unsubscribe" className="mt-6">
              <input type="hidden" name="u" value={uid} />
              <input type="hidden" name="t" value={token} />
              <input type="hidden" name="redirect" value="1" />
              <button
                type="submit"
                className="inline-flex min-h-11 items-center rounded-lg bg-slate-900 px-5 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
              >
                Unsubscribe me
              </button>
            </form>

            <Link
              href="/"
              className="mt-4 inline-block text-sm font-medium text-slate-500 underline hover:text-slate-700"
            >
              No thanks, keep sending them
            </Link>
          </section>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
