"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const faqs = [
  {
    q: "How many free questions can I practice?",
    a: "You can attempt 5 free questions per subject and year without signing up or paying. After that, choose any affordable plan to keep practicing.",
  },
  {
    q: "Does Jambito work offline?",
    a: "Yes. Once you load a subject set, the questions and explanations are saved on your device, so you can keep practicing without an internet connection.",
  },
  {
    q: "Which exams are covered?",
    a: "JAMB (UTME), WAEC (SSCE), and POST UTME past questions across popular subjects like Physics, Chemistry, Biology, Mathematics, English and more.",
  },
  {
    q: "How do I pay?",
    a: "We accept Paystack (cards, bank, USSD), OPay and direct bank transfer. Your subscription activates automatically after a successful payment.",
  },
  {
    q: "Can I install Jambito on my phone?",
    a: "Yes — Jambito is a Progressive Web App. Use the install prompt or your browser menu to add it to your home screen.",
  },
];

export default function FaqAccordion() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 overflow-hidden">
      {faqs.map((faq, i) => (
        <div key={i} className="bg-white">
          <button
            onClick={() => setOpen(open === i ? null : i)}
            className="w-full flex items-center justify-between px-5 py-4 text-left"
          >
            <span className="font-medium text-slate-800">{faq.q}</span>
            <ChevronDown
              className={cn(
                "w-5 h-5 text-slate-400 transition-transform",
                open === i && "rotate-180"
              )}
            />
          </button>
          {open === i && (
            <p className="px-5 pb-4 text-sm text-slate-600">{faq.a}</p>
          )}
        </div>
      ))}
    </div>
  );
}
