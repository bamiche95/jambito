import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "What CBT-Practice stores about you, why we store it, and how to get it removed.",
};

/**
 * Plain-language privacy summary.
 *
 * Written against what the code actually does rather than from a template:
 * Firebase Auth holds the account, practice data is cached on the device so the
 * app works offline (IndexedDB), and card payments are handled by Paystack, so
 * no card details ever reach this app. Each section points at something a
 * student can act on — the profile page, the contact form.
 *
 * The note at the top is deliberate: this is not a lawyer-reviewed policy, and
 * saying so is better than implying a review that has not happened.
 */

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: "What we collect",
    body: [
      "When you create an account we store your email address, your display name (or the name on your Google account if you sign in with Google) and a unique account ID. If you sign in with Google, we receive only the basic profile details Google shares for sign-in — never your Google password.",
      "We also store your subscription status, the date your access expires, and any messages you send us through the contact form.",
    ],
  },
  {
    title: "Practice data stays on your device",
    body: [
      "Question sets, your answers and your explanations are cached in your browser's local storage on your device. That cache is what lets the app keep working with no network. Clearing your browser data, or uninstalling the app, removes it.",
      "Practice sessions you save show up under History, and summary figures under Stats, so they are available on any device you sign in from.",
    ],
  },
  {
    title: "Messages you send us",
    body: [
      "When you use the contact form we receive the name, email address and message you type, and the message is delivered to our support inbox at contact@cbtpractice.ng. We keep it only as long as we need it to answer you.",
      "To keep the form free of spam, the server stores a one-way hash of your IP address and email address for up to 24 hours and issues a short-lived signed token to the page. The hashes cannot be turned back into your address; they exist only to block repeated automated submissions.",
    ],
  },
  {
    title: "Account emails",
    body: [
      "We send one welcome email when you create an account. We do not send marketing email, and we never sell or share your address with advertisers.",
    ],
  },
  {
    title: "Payments",
    body: [
      "Card and bank payments are processed by Paystack. Paystack receives the payment details needed to complete the transaction; CBT-Practice never sees or stores your card number or CVV. We store only the payment reference, the amount and whether the payment succeeded, so we can grant and support your access.",
      "If you pay by direct bank transfer or OPay, you send your proof of payment to our support channel and we record the confirmation against your account.",
    ],
  },
  {
    title: "Cookies and local storage",
    body: [
      "We use browser storage to keep you signed in and to store your practice data offline. We do not run advertising or third-party tracking on this site.",
    ],
  },
  {
    title: "Your choices",
    body: [
      "You can ask us to delete your account and the data attached to it at any time. Send the request from the email address on the account so we can verify it.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <div className="flex flex-1 flex-col bg-cream">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:py-16">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-orange">
          Legal
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
          Privacy Policy
        </h1>
        <p className="mt-4 text-base leading-7 text-slate-600">
          This page explains, in plain language, what CBT-Practice stores about
          you and why. It is a summary rather than a lawyer-reviewed document,
          and it describes the app as it works today.
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
          <h2 className="text-lg font-bold text-slate-900">Questions or requests</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Reach us from the{" "}
            <Link href="/contact" className="font-semibold text-brand-blue">
              contact page
            </Link>{" "}
            and we will respond as quickly as we can.
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
