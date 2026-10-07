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
  signInAnonymously,
  linkWithPopup,
  linkWithCredential,
  EmailAuthProvider,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { auth } from "./firebase";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  isGuest: boolean;
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

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  // Ensure every visitor has a guest (anonymous) identity — the "device
  // signature" — without any permission prompt.
  useEffect(() => {
    if (loading || user) return;
    signInAnonymously(auth).catch(() => undefined);
  }, [loading, user]);

  const signInWithGoogle = useCallback(async () => {
    const provider = new GoogleAuthProvider();
    const current = auth.currentUser;
    if (current && current.isAnonymous) {
      try {
        const result = await linkWithPopup(current, provider);
        return result.user;
      } catch (error) {
        const code = (error as { code?: string })?.code;
        if (code === "auth/credential-already-in-use") {
          const result = await signInWithPopup(auth, provider);
          return result.user;
        }
        throw error;
      }
    }
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
      const current = auth.currentUser;
      const credential = EmailAuthProvider.credential(email, password);

      if (current && current.isAnonymous) {
        try {
          const result = await linkWithCredential(current, credential);
          return result.user;
        } catch (error) {
          const code = (error as { code?: string })?.code;
          if (code === "auth/credential-already-in-use") {
            const result = await signInWithEmailAndPassword(
              auth,
              email,
              password
            );
            return result.user;
          }
          throw error;
        }
      }

      const result = await createUserWithEmailAndPassword(auth, email, password);
      return result.user;
    },
    []
  );

  const signOut = useCallback(async () => {
    await fbSignOut(auth);
    await signInAnonymously(auth).catch(() => undefined);
  }, []);

  const getIdToken = useCallback(async () => {
    const u = auth.currentUser;
    if (!u) return null;
    return u.getIdToken(true);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isGuest: Boolean(user?.isAnonymous),
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
