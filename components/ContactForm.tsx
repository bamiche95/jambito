"use client";

import { useState } from "react";
import { Send, CheckCircle2, MessageCircle } from "lucide-react";

export default function ContactForm() {
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", message: "" });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.email || !form.message) return;
    setSent(true);
  }

  if (sent) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-center">
        <CheckCircle2 className="w-8 h-8 text-green-600 mx-auto mb-3" />
        <h3 className="font-semibold text-green-800">Message sent!</h3>
        <p className="text-sm text-green-700 mt-1">
          Thanks {form.name}, we&apos;ll get back to you at {form.email}.
        </p>
        <button
          onClick={() => {
            setSent(false);
            setForm({ name: "", email: "", message: "" });
          }}
          className="mt-4 text-sm text-green-700 underline"
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Your name"
          className="px-4 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          placeholder="Email address"
          className="px-4 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <textarea
        value={form.message}
        onChange={(e) => setForm({ ...form, message: e.target.value })}
        placeholder="How can we help?"
        rows={5}
        className="w-full px-4 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          type="submit"
          className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition"
        >
          <Send className="w-4 h-4" /> Send message
        </button>
        <a
          href="https://wa.me/2348000000000?text=Hi%20Jambito%2C%20I%20need%20help"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-lg transition"
        >
          <MessageCircle className="w-4 h-4" /> Chat on WhatsApp
        </a>
      </div>
    </form>
  );
}
