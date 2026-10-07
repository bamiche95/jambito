"use client";

import { useState } from "react";
import {
  X,
  Lock,
  CreditCard,
  Landmark,
  MessageCircle,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { PLANS } from "@/lib/plans";
import { cn } from "@/lib/utils";
import AuthModal from "@/components/auth/AuthModal";

interface PaywallModalProps {
  open: boolean;
  onClose: () => void;
  onSubscribed?: () => void;
}

export default function PaywallModal({
  open,
  onClose,
  onSubscribed,
}: PaywallModalProps) {
  const { user, getIdToken, refreshStatus } = useAuth();
  const [plan, setPlan] = useState<string>("monthly");
  const [paying, setPaying] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAuth, setShowAuth] = useState(false);

  if (!open) return null;

  const selectedPlan = PLANS.find((p) => p.id === plan) ?? PLANS[1];
  const email = user?.email ?? "";

  async function handlePaystack() {
    setError(null);
    setPaying(true);
    try {
      const token = await getIdToken();
      const res = await fetch("/api/payments/initialize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ plan }),
      });
      const json = await res.json();
      if (json.success && json.data?.authorization_url) {
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

  async function handleRefresh() {
    setError(null);
    setRefreshing(true);
    try {
      const token = await getIdToken();
      const res = await fetch("/api/trial", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success && json.subscribed) {
        await refreshStatus();
        onSubscribed?.();
      } else {
        setError(
          "We couldn't confirm a subscription yet. If you just paid, wait a moment and try again."
        );
      }
    } catch {
      setError("Network error while checking subscription status.");
    } finally {
      setRefreshing(false);
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
              You&apos;ve used your 40 free questions. Subscribe to keep
              practicing.
            </p>
          </div>

          {!user ? (
            <div className="space-y-3 text-center">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Sign in to save your progress and subscribe.
              </p>
              <button
                onClick={() => setShowAuth(true)}
                className="w-full py-3 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-semibold hover:opacity-90 transition"
              >
                Sign in / Create account
              </button>
            </div>
          ) : (
            <>
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

              {email && (
                <p className="text-xs text-slate-500 text-center">
                  Receipts go to <span className="font-medium">{email}</span>
                </p>
              )}

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

              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3 text-sm">
                <p className="font-semibold text-slate-700 dark:text-slate-200">
                  Other payment options
                </p>
                <div className="flex items-start gap-2 text-slate-600 dark:text-slate-300">
                  <Landmark className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>
                    <span className="font-medium">Bank Transfer / OPay:</span>{" "}
                    Transfer to <span className="font-mono">0123456789</span>{" "}
                    (Jambito Ltd, GTBank) and send proof via WhatsApp.
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
                onClick={handleRefresh}
                disabled={refreshing}
                className="w-full flex items-center justify-center gap-2 text-sm text-slate-500 underline underline-offset-2 hover:text-slate-700 dark:hover:text-slate-300 disabled:opacity-60"
              >
                <RefreshCw
                  className={cn("w-4 h-4", refreshing && "animate-spin")}
                />
                I&apos;ve already paid — check my subscription
              </button>
            </>
          )}
        </div>
      </div>

      <AuthModal
        open={showAuth}
        onClose={() => setShowAuth(false)}
        onSuccess={() => setShowAuth(false)}
      />
    </div>
  );
}
