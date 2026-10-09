import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "Terms of Use",
  description:
    "The ground rules for using CBT-Practice: access, payments, fair use and content.",
};

/**
 * Plain-language terms summary.
 *
 * Kept to the things the app genuinely enforces or promises today: the trial is
 * a fixed number of questions, access is one payment for twelve months with no
 * auto-renewal, and accounts are personal. Deliberately silent on anything the
 * code does not decide (refund policy, jurisdiction) rather than inventing
 * clauses — the support route is the honest answer until a lawyer sets those.
 */

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: "Your account",
    body: [
      "You need an account to practice. An account is personal to you: one person, one account. Sharing a login, or reselling access, may result in the account being suspended without a refund.",
      "You are responsible for keeping your password safe. Tell us straight away if you think someone else has access to your account.",
    ],
  },
  {
    title: "Free trial",
    body: [
      "Once you sign in you can attempt a set number of free questions across any subject and year — no payment needed. Completing the trial does not oblige you to pay anything.",
    ],
  },
  {
    title: "Paid access",
    body: [
      "Paid access is a one-off payment for twelve months of unlimited practice across every exam board, subject and year we carry. The price shown at checkout is the price that applies.",
      "Access is not a subscription. Nothing renews on its own and nothing is ever charged to your card automatically. When the twelve months end you simply pay again if you want to continue.",
      "Card and bank payments are completed through Paystack. Access is granted once the payment is confirmed, which normally happens automatically within a moment.",
    ],
  },
  {
    title: "Using the content fairly",
    body: [
      "Past questions, answers and explanations are provided for your own study. You may not scrape, bulk-download, republish or resell them, or use automated tools to pull them from the app.",
      "We aim to keep questions and explanations accurate, but exam boards are the final authority. Always check anything that matters against official past-question and syllabus material.",
    ],
  },
  {
    title: "Availability",
    body: [
      "The app is offline-first: once a question set has loaded, it keeps working on your device without a network. Features that need the internet — signing in, payments, loading new sets — depend on our providers and your connection, so we cannot promise they are never interrupted.",
      "We may update, add or retire features over time. Nothing in this summary limits your right to contact us if access you paid for is not working.",
    ],
  },
];

export default function TermsPage() {
  return (
    <div className="flex flex-1 flex-col bg-cream">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:py-16">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-orange">
          Legal
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
          Terms of Use
        </h1>
        <p className="mt-4 text-base leading-7 text-slate-600">
          The ground rules for using CBT-Practice. This is a plain-language
          summary rather than a lawyer-reviewed agreement, and it describes how
          the app works today.
        </p>

        <div className="mt-10 space-y-8">
          {SECTIONS.map((section) => (
            <section key={section.title}>
              <h2 className="text-lg font-bold text-slate-900">
                {section.title}
              </h2>
              {section.body.map((paragraph) => (
                <p
                  key={paragraph.slice(0, 40)}
                  className="mt-3 text-sm leading-6 text-slate-600"
                >
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </div>

        <div className="mt-12 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">Need help?</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            If a payment did not unlock your access, or you have any question
            about these terms, message us from the{" "}
            <Link href="/contact" className="font-semibold text-brand-blue">
              contact page
            </Link>
            . See also our{" "}
            <Link href="/privacy" className="font-semibold text-brand-blue">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
