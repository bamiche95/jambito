"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  getAdditionalUserInfo,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { getFirebaseAuth } from "./firebase";
import {
  clearEntitlement,
  clearAllCachedQuestions,
  getEntitlement,
  saveEntitlement,
} from "./offlineStore";
import { TRIAL_LIMIT } from "./plans";
import { setPracticeAuthProvider } from "./practiceRepo";
import {
  accountStatusFromCode,
  normalizeAccountStatus,
  type AccountStatus,
} from "./accountStatus";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  isSubscribed: boolean;
  trialUsed: number;
  trialRemaining: number;
  /**
   * True once `isSubscribed` / `trialRemaining` reflect something the server
   * actually confirmed (fresh response or the last known status). While it is
   * `false` they are just the blind default, so callers must not lock content
   * because of them — the API remains the source of truth.
   */
  entitlementKnown: boolean;
  /**
   * Account lifecycle state as last confirmed by the server. Anything other
   * than "active" means every content endpoint answers 403, so the UI shows a
   * notice instead of a paywall. Defaults to "active" while unknown: the
   * server is still the one that decides.
   */
  accountState: AccountStatus;
  /** True while the server says this account may not use the product. */
  accountLocked: boolean;
  role: "admin" | "user";
  isAdmin: boolean;
  refreshStatus: () => Promise<void>;
  signInWithGoogle: () => Promise<User>;
  signInWithEmail: (email: string, password: string) => Promise<User>;
  signUpWithEmail: (email: string, password: string) => Promise<User>;
  signOut: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Sends the one-off welcome mail for a brand-new account.
 *
 * Fire-and-forget on purpose: a slow or unavailable mailbox must never delay
 * sign-up or show an error in the auth modal. `/api/welcome` claims the send
 * atomically (see app/api/welcome/route.js), so a duplicate call is harmless.
 */
function sendWelcomeEmail(account: User) {
  void account
    .getIdToken()
    .then((token) =>
      fetch("/api/welcome", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      })
    )
    .catch(() => undefined);
}


export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [trialUsed, setTrialUsed] = useState(0);
  const [trialRemaining, setTrialRemaining] = useState(TRIAL_LIMIT);
  const [entitlementKnown, setEntitlementKnown] = useState(false);
  const [accountState, setAccountState] = useState<AccountStatus>("active");
  const [role, setRole] = useState<"admin" | "user">("user");

  // The account the status above belongs to. Reset during render (React's
  // "adjust state when props change" pattern) so account B never inherits
  // account A's remaining count on a shared device.
  const uid = user?.uid ?? null;
  const [statusUid, setStatusUid] = useState<string | null>(null);
  if (statusUid !== uid) {
    setStatusUid(uid);
    setEntitlementKnown(false);
    setAccountState("active");
    setRole("user");
    if (!uid) {
      setIsSubscribed(false);
      setTrialUsed(0);
      setTrialRemaining(TRIAL_LIMIT);
    }
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(getFirebaseAuth(), (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  /**
   * Applies an `/api/trial` answer to the context.
   *
   * A failure carrying an `account_*` code is a verdict, not an outage: the
   * account is locked, so the cached questions (which still hold the full
   * answer key) are wiped and the entitlement cache is dropped. Everything
   * else — a 503, a network error — is ignored so the last known status keeps
   * gating the UI and a broken dependency is never mistaken for a lockout.
   */
  const applyStatus = useCallback(
    async (
      json: {
        success?: boolean;
        status?: unknown;
        role?: unknown;
        subscribed?: unknown;
        trialUsed?: number;
        trialRemaining?: number;
        code?: unknown;
      } | null,
      accountUid: string | null
    ) => {
      if (!json?.success) {
        const status = accountStatusFromCode(json?.code);
        if (!status) return;
        setAccountState(status);
        setIsSubscribed(false);
        setTrialRemaining(0);
        setTrialUsed(TRIAL_LIMIT);
        setEntitlementKnown(true);
        clearEntitlement();
        await clearAllCachedQuestions();
        return;
      }
      setAccountState(normalizeAccountStatus(json.status));
      setRole(json.role === "admin" ? "admin" : "user");
      setIsSubscribed(Boolean(json.subscribed));
      setTrialUsed(json.trialUsed ?? 0);
      setTrialRemaining(json.trialRemaining ?? 0);
      setEntitlementKnown(true);
      if (accountUid) {
        saveEntitlement({
          uid: accountUid,
          isSubscribed: Boolean(json.subscribed),
          trialRemaining: json.trialRemaining ?? 0,
          checkedAt: new Date().toISOString(),
        });
      }
    },
    []
  );

  // Fetch global subscription + trial status whenever the user changes.
  useEffect(() => {
    if (loading || !user) return;
    let cancelled = false;
    const accountUid = user.uid;
    // Last status the server confirmed for THIS account: seeded while the fresh
    // status is in flight so a depleted account never flashes "40 left", and
    // kept when the network is gone so the UI can fail closed offline.
    const lastKnown = getEntitlement(accountUid);
    user
      .getIdToken(true)
      .then((token) => {
        if (!cancelled && lastKnown) {
          setIsSubscribed(lastKnown.isSubscribed);
          setTrialUsed(Math.max(0, TRIAL_LIMIT - lastKnown.trialRemaining));
          setTrialRemaining(lastKnown.trialRemaining);
          setEntitlementKnown(true);
        }
        return fetch("/api/trial", {
          headers: { Authorization: `Bearer ${token}` },
        });
      })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        return applyStatus(json, accountUid);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [loading, user, applyStatus]);

  const signInWithGoogle = useCallback(async () => {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(getFirebaseAuth(), provider);
    if (getAdditionalUserInfo(result)?.isNewUser) sendWelcomeEmail(result.user);
    return result.user;
  }, []);

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      const result = await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
      return result.user;
    },
    []
  );

  const signUpWithEmail = useCallback(
    async (email: string, password: string) => {
      const result = await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
      sendWelcomeEmail(result.user);
      return result.user;
    },
    []
  );

  const signOut = useCallback(async () => {
    await fbSignOut(getFirebaseAuth());
    clearEntitlement();
    setIsSubscribed(false);
    setTrialUsed(0);
    setTrialRemaining(TRIAL_LIMIT);
    setEntitlementKnown(false);
    setAccountState("active");
    setRole("user");
  }, []);

  const getIdToken = useCallback(async () => {
    const u = getFirebaseAuth().currentUser;
    if (!u) return null;
    return u.getIdToken(true);
  }, []);

  /**
   * Practice history follows the account, not the device.
   *
   * `lib/practiceRepo.ts` uses this to import a device-only backlog once and to
   * drain its outbox. The cached (non-forced) token is used for those writes:
   * forcing a refresh on every autosave flush would cost a network round-trip
   * for no benefit.
   */
  useEffect(() => {
    if (!user) {
      setPracticeAuthProvider(null);
      return;
    }
    setPracticeAuthProvider({
      uid: user.uid,
      getIdToken: () => user.getIdToken(),
    });
  }, [user]);

  const refreshStatus = useCallback(async () => {
    const token = await getIdToken();
    if (!token) return;
    const currentUid = getFirebaseAuth().currentUser?.uid ?? null;
    try {
      const res = await fetch("/api/trial", {
        headers: { Authorization: `Bearer ${token}` },
      });
      await applyStatus(await res.json(), currentUid);
    } catch {
      // offline — the last known status keeps gating the UI
    }
  }, [getIdToken, applyStatus]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isSubscribed,
        trialUsed,
        trialRemaining,
        entitlementKnown,
        accountState,
        accountLocked: accountState !== "active",
        role,
        isAdmin: role === "admin",
        refreshStatus,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        signOut,
        getIdToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
