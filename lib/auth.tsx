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
import { auth } from "./firebase";
import { TRIAL_LIMIT } from "./plans";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  isSubscribed: boolean;
  trialUsed: number;
  trialRemaining: number;
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

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  // Fetch global subscription + trial status whenever the user changes.
  useEffect(() => {
    if (loading || !user) return;
    let cancelled = false;
    user
      .getIdToken(true)
      .then((token) =>
        fetch("/api/trial", { headers: { Authorization: `Bearer ${token}` } })
      )
      .then((r) => r.json())
      .then((json) => {
        if (cancelled || !json?.success) return;
        setIsSubscribed(json.subscribed);
        setTrialUsed(json.trialUsed ?? 0);
        setTrialRemaining(json.trialRemaining ?? 0);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [loading, user]);

  const signInWithGoogle = useCallback(async () => {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    return result.user;
  }, []);

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      const result = await signInWithEmailAndPassword(auth, email, password);
      return result.user;
    },
    []
  );

  const signUpWithEmail = useCallback(
    async (email: string, password: string) => {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      return result.user;
    },
    []
  );

  const signOut = useCallback(async () => {
    await fbSignOut(auth);
    setIsSubscribed(false);
    setTrialUsed(0);
    setTrialRemaining(TRIAL_LIMIT);
  }, []);

  const getIdToken = useCallback(async () => {
    const u = auth.currentUser;
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
      }
    } catch {
      // ignore — refreshed on next interaction
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
