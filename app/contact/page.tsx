import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import ContactForm from "@/components/ContactForm";
import FaqAccordion from "@/components/FaqAccordion";
import { LifeBuoy, MessageSquareText } from "lucide-react";

export const metadata: Metadata = {
  title: "Contact Us",
  description:
    "Get help with CBT-Practice — contact support or browse frequently asked questions.",
};

export default function ContactPage() {
  return (
    <div className="flex flex-col flex-1">
      <SiteHeader />
      <main className="flex-1">
        <section className="bg-slate-950 text-white">
          <div className="mx-auto max-w-6xl px-4 py-9 sm:py-12">
            <div className="flex items-start gap-4 sm:items-center">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-300 ring-1 ring-inset ring-blue-300/20">
                <LifeBuoy className="h-6 w-6" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-300">
                  Support desk
                </p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
                  How can we help?
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                  Get help with practice, payments or your account. Find a quick
                  answer below or send our team a message.
                </p>
              </div>
            </div>
            <div className="mt-6 flex items-center gap-2 border-t border-white/10 pt-4 text-sm text-slate-300">
              <MessageSquareText className="h-4 w-4 shrink-0 text-blue-300" aria-hidden />
              Practice <span className="text-slate-600">·</span> Payments
              <span className="text-slate-600">·</span> Account access
            </div>
          </div>
        </section>

        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-5 px-4 py-6 sm:gap-6 sm:py-9 lg:grid-cols-[0.9fr_1.1fr] lg:gap-8">
          <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <div className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-700">
                Send a message
              </p>
              <h2 className="mt-1 text-xl font-semibold text-slate-900">
                Tell us what you need
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Share a few details and we&apos;ll point you in the right
                direction.
              </p>
            </div>
            <ContactForm />
          </section>

          <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <div className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-700">
                Quick answers
              </p>
              <h2 className="mt-1 text-xl font-semibold text-slate-900">
                Frequently asked questions
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                The essentials on free practice, payments and installing the app.
              </p>
            </div>
            <FaqAccordion />
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
