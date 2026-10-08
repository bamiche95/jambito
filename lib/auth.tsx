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
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { getFirebaseAuth } from "./firebase";
import { clearEntitlement, getEntitlement, saveEntitlement } from "./offlineStore";
import { TRIAL_LIMIT } from "./plans";

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
  refreshStatus: () => Promise<void>;
  signInWithGoogle: () => Promise<User>;
  signInWithEmail: (email: string, password: string) => Promise<User>;
  signUpWithEmail: (email: string, password: string) => Promise<User>;
  signOut: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [trialUsed, setTrialUsed] = useState(0);
  const [trialRemaining, setTrialRemaining] = useState(TRIAL_LIMIT);
  const [entitlementKnown, setEntitlementKnown] = useState(false);

  // The account the status above belongs to. Reset during render (React's
  // "adjust state when props change" pattern) so account B never inherits
  // account A's remaining count on a shared device.
  const uid = user?.uid ?? null;
  const [statusUid, setStatusUid] = useState<string | null>(null);
  if (statusUid !== uid) {
    setStatusUid(uid);
    setEntitlementKnown(false);
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
        if (cancelled || !json?.success) return;
        setIsSubscribed(json.subscribed);
        setTrialUsed(json.trialUsed ?? 0);
        setTrialRemaining(json.trialRemaining ?? 0);
        setEntitlementKnown(true);
        saveEntitlement({
          uid: accountUid,
          isSubscribed: Boolean(json.subscribed),
          trialRemaining: json.trialRemaining ?? 0,
          checkedAt: new Date().toISOString(),
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [loading, user]);

  const signInWithGoogle = useCallback(async () => {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(getFirebaseAuth(), provider);
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
  }, []);

  const getIdToken = useCallback(async () => {
    const u = getFirebaseAuth().currentUser;
    if (!u) return null;
    return u.getIdToken(true);
  }, []);

  const refreshStatus = useCallback(async () => {
    const token = await getIdToken();
    if (!token) return;
    try {
      const res = await fetch("/api/trial", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success) {
        setIsSubscribed(json.subscribed);
        setTrialUsed(json.trialUsed ?? 0);
        setTrialRemaining(json.trialRemaining ?? 0);
        setEntitlementKnown(true);
        const currentUid = getFirebaseAuth().currentUser?.uid;
        if (currentUid) {
          saveEntitlement({
            uid: currentUid,
            isSubscribed: Boolean(json.subscribed),
            trialRemaining: json.trialRemaining ?? 0,
            checkedAt: new Date().toISOString(),
          });
        }
      }
    } catch {
      // offline — the last known status keeps gating the UI
    }
  }, [getIdToken]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isSubscribed,
        trialUsed,
        trialRemaining,
        entitlementKnown,
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
