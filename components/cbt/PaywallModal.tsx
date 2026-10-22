"use client";

import { useState } from "react";
import {
  X,
  Lock,
  CreditCard,
  Landmark,
  MessageCircle,
  RefreshCw,
  BadgeCheck,
  CheckCircle2,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { usePricing } from "@/lib/pricing";
import { TRIAL_LIMIT } from "@/lib/plans";
import { paymentGate } from "@/lib/subscription";
import { cn } from "@/lib/utils";
import AuthModal from "@/components/auth/AuthModal";

interface PaywallModalProps {
  open: boolean;
  onClose: () => void;
  onSubscribed?: () => void;
}

/**
 * The only place in the app that starts a payment.
 *
 * One offer: a single payment for 12 months of unlimited access. Nothing renews
 * on its own, so while a paid window is still running there is no button to
 * press — `paymentGate` reports "active" and the price is replaced with a
 * confirmation. A second checkout is refused server-side too.
 *
 * The price shown here comes from usePricing() so it matches what the server
 * will charge; it is never used to compute an amount, only to quote one.
 */
export default function PaywallModal({
  open,
  onClose,
  onSubscribed,
}: PaywallModalProps) {
  const { user, isSubscribed, entitlementKnown, getIdToken, refreshStatus } =
    useAuth();
  // Hook order: read the price before the `!open` early return below.
  const { plan } = usePricing();
  const [paying, setPaying] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAuth, setShowAuth] = useState(false);

  if (!open) return null;

  const email = user?.email ?? "";
  const gate = paymentGate({
    signedIn: Boolean(user),
    entitlementKnown,
    isSubscribed,
  });

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
        body: JSON.stringify({ plan: plan.id }),
      });
      const json = await res.json();
      if (json.success && json.data?.authorization_url) {
        window.location.href = json.data.authorization_url;
      } else if (json.code === "already_subscribed") {
        // The window is still running after all (a second tab, or a payment
        // that has just landed). Nothing was charged: re-read the status so the
        // button turns into the confirmation.
        await refreshStatus();
        setError(json.message || "Your access is already active.");
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
          "We couldn't confirm your access yet. If you just paid, wait a moment and try again."
        );
      }
    } catch {
      setError("Network error while checking your access.");
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
              Unlock 12 months of access
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              You&apos;ve used your {TRIAL_LIMIT} free questions. One payment of
              ₦{plan.priceNaira.toLocaleString()} unlocks every board, subject and
              year for 12 months.
            </p>
          </div>

          {!user ? (
            <div className="space-y-3 text-center">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Sign in to save your progress and unlock access.
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
              {/* One offer, so there is no picker to pick from. */}
              <div className="rounded-xl border border-blue-500 bg-blue-50 dark:bg-blue-900/20 p-4">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800 dark:text-slate-100">
                    {plan.name}
                  </span>
                  <span className="text-[10px] uppercase font-bold text-blue-600">
                    Pay once
                  </span>
                </div>
                <p className="mt-2">
                  <span className="text-3xl font-extrabold text-slate-900 dark:text-white">
                    ₦{plan.priceNaira.toLocaleString()}
                  </span>
                  <span className="text-sm text-slate-500"> for 12 months</span>
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  One payment, no renewal. Unlimited access to every board,
                  subject and year for {plan.durationYears * 12} months.
                </p>
                <ul className="mt-3 space-y-1.5 text-sm text-slate-600 dark:text-slate-300">
                  {plan.features.slice(0, 4).map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-blue-500" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>

              {email && (
                <p className="text-xs text-slate-500 text-center">
                  Receipts go to <span className="font-medium">{email}</span>
                </p>
              )}

              {error && <p className="text-sm text-red-600">{error}</p>}

              {gate === "active" ? (
                // Already paid up: there is nothing to buy, so there is no
                // button to press. The window runs out on its own and the offer
                // comes back then.
                <div className="rounded-xl border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20 p-4 text-center space-y-1">
                  <BadgeCheck className="w-6 h-6 mx-auto text-green-600" />
                  <p className="font-semibold text-green-800 dark:text-green-300">
                    Your access is already active
                  </p>
                  <p className="text-xs text-green-700 dark:text-green-400">
                    Nothing to pay — you still have the rest of your 12 months.
                  </p>
                  <button
                    onClick={() => {
                      onSubscribed?.();
                      onClose();
                    }}
                    className="mt-1 text-sm font-semibold text-green-800 dark:text-green-300 underline underline-offset-2"
                  >
                    Continue practicing
                  </button>
                </div>
              ) : (
                <button
                  onClick={handlePaystack}
                  disabled={paying || gate === "loading"}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold rounded-lg transition"
                >
                  <CreditCard className="w-5 h-5" />
                  {gate === "loading"
                    ? "Checking your access…"
                    : paying
                      ? "Redirecting…"
                      : `Pay ₦${plan.priceNaira.toLocaleString()} once with Paystack`}
                </button>
              )}

              <div>
                <p>Having trouble paying? Chat with us instantly     <a
                    href="https://wa.me/447572376272?text=Hi%20CBTPractice%2C%20I%20just%20made%20a%20transfer%20for%20a%20year%20of%20access"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-green-600 font-medium"
                  > on WhatsApp </a> for quick assistance.</p>
              </div>
{/* 
              {gate !== "active" && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3 text-sm">
                  <p className="font-semibold text-slate-700 dark:text-slate-200">
                    Other payment options
                  </p>
                  <div className="flex items-start gap-2 text-slate-600 dark:text-slate-300">
                    <Landmark className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>
                      <span className="font-medium">Bank Transfer / OPay:</span>{" "}
                      Transfer to <span className="font-mono">8110594681</span>{" "}
                      (CBTPractice Ltd, GTBank) and send proof via WhatsApp.
                    </span>
                  </div>
                  <a
                    href="https://wa.me/447572376272?text=Hi%20CBTPractice%2C%20I%20just%20made%20a%20transfer%20for%20a%20year%20of%20access"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-green-600 font-medium"
                  >
                    <MessageCircle className="w-4 h-4" />
                    Send proof on WhatsApp
                  </a>
                </div>
              )}  
*/}
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="w-full flex items-center justify-center gap-2 text-sm text-slate-500 underline underline-offset-2 hover:text-slate-700 dark:hover:text-slate-300 disabled:opacity-60"
              >
                <RefreshCw
                  className={cn("w-4 h-4", refreshing && "animate-spin")}
                />
                I&apos;ve already paid — check my access
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
