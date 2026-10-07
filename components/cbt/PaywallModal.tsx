"use client";

import { useState } from "react";
import { X, Lock, CreditCard, Landmark, MessageCircle } from "lucide-react";
import { PLANS } from "@/lib/plans";
import { cn } from "@/lib/utils";

interface PaywallModalProps {
  open: boolean;
  onClose: () => void;
  exam: string;
  subject: string;
  year: string;
  onUnlocked?: () => void;
}

export default function PaywallModal({
  open,
  onClose,
  exam,
  subject,
  year,
  onUnlocked,
}: PaywallModalProps) {
  const [email, setEmail] = useState("");
  const [plan, setPlan] = useState<string>("monthly");
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const selectedPlan = PLANS.find((p) => p.id === plan) ?? PLANS[1];

  async function handlePaystack() {
    setError(null);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid email to receive your receipt.");
      return;
    }
    setPaying(true);
    try {
      const res = await fetch("/api/payments/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, plan }),
      });
      const json = await res.json();
      if (json.success && json.data?.authorization_url) {
        localStorage.setItem("jambito_pro_email", email);
        window.location.href = json.data.authorization_url;
      } else {
        setError(json.message || "Unable to start payment. Please try again.");
      }
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setPaying(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-6 space-y-5">
          <div className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center mb-3">
              <Lock className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
              Unlock Full Access
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              You&apos;ve reached the free trial limit for{" "}
              <span className="font-medium text-slate-700 dark:text-slate-300">
                {exam} {subject} {year}
              </span>
              . Subscribe to keep practicing.
            </p>
          </div>

          {/* Plan selector */}
          <div className="grid grid-cols-2 gap-2">
            {PLANS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPlan(p.id)}
                className={cn(
                  "text-left p-3 rounded-xl border transition",
                  plan === p.id
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-500"
                    : "border-slate-200 dark:border-slate-700 hover:border-slate-300"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800 dark:text-slate-100">
                    {p.name}
                  </span>
                  {p.popular && (
                    <span className="text-[10px] uppercase font-bold text-blue-600">
                      Popular
                    </span>
                  )}
                </div>
                <div className="text-lg font-bold text-slate-900 dark:text-white">
                  ₦{p.priceNaira.toLocaleString()}
                </div>
                <div className="text-xs text-slate-500">{p.description}</div>
              </button>
            ))}
          </div>

          {/* Email + Paystack */}
          <div className="space-y-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address for receipt"
              className="w-full px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              onClick={handlePaystack}
              disabled={paying}
              className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold rounded-lg transition"
            >
              <CreditCard className="w-5 h-5" />
              {paying
                ? "Redirecting…"
                : `Pay ₦${selectedPlan.priceNaira.toLocaleString()} with Paystack`}
            </button>
          </div>

          {/* Alternative payment methods */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3 text-sm">
            <p className="font-semibold text-slate-700 dark:text-slate-200">
              Other payment options
            </p>
            <div className="flex items-start gap-2 text-slate-600 dark:text-slate-300">
              <Landmark className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                <span className="font-medium">Bank Transfer / OPay:</span>{" "}
                Transfer to <span className="font-mono">0123456789</span> (Jambito
                Ltd, GTBank) and send proof via WhatsApp.
              </span>
            </div>
            <a
              href="https://wa.me/2348000000000?text=Hi%20Jambito%2C%20I%20just%20made%20a%20transfer%20for%20a%20subscription"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-green-600 font-medium"
            >
              <MessageCircle className="w-4 h-4" />
              Send proof on WhatsApp
            </a>
          </div>

          <button
            onClick={() => {
              if (email) localStorage.setItem("jambito_pro_email", email);
              onUnlocked?.();
            }}
            className="w-full text-sm text-slate-500 underline underline-offset-2 hover:text-slate-700 dark:hover:text-slate-300"
          >
            I&apos;ve already paid — unlock now
          </button>
        </div>
      </div>
    </div>
  );
}
