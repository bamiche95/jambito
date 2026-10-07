import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import ContactForm from "@/components/ContactForm";
import FaqAccordion from "@/components/FaqAccordion";

export const metadata: Metadata = {
  title: "Contact Us",
  description:
    "Get help with Jambito — contact support or browse frequently asked questions.",
};

export default function ContactPage() {
  return (
    <div className="flex flex-col flex-1">
      <SiteHeader />
      <main className="max-w-4xl mx-auto px-4 py-12 w-full">
        <h1 className="text-3xl font-bold text-slate-900">Get in touch</h1>
        <p className="text-slate-500 mt-2">
          Questions about practice, payments or your subscription? We&apos;re here
          to help.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 mt-10">
          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-4">
              Send us a message
            </h2>
            <ContactForm />
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-4">
              Frequently asked questions
            </h2>
            <FaqAccordion />
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
