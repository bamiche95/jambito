import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/**
 * Firebase client SDK is initialised lazily (on first use) rather than at
 * module load. This module is pulled in by the `AuthProvider` client component
 * which is rendered on the server during static generation (e.g. `/`). Calling
 * `initializeApp`/`getAuth` at the top level would run during that prerender and
 * throw `auth/invalid-api-key` whenever the NEXT_PUBLIC_FIREBASE_* build-time
 * env vars are missing (CI/Vercel). Deferring it keeps prerendering safe.
 */
let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;

/**
 * `NEXT_PUBLIC_*` values are inlined at BUILD time. If they are missing from the
 * build environment (e.g. not set on Vercel for Production/Preview), the config
 * below is compiled to `undefined` and the client SDK later throws the cryptic
 * `auth/invalid-api-key`. Surface an actionable error instead.
 */
const REQUIRED_CONFIG_KEYS: (keyof typeof firebaseConfig)[] = [
  "apiKey",
  "authDomain",
  "projectId",
  "appId",
];

function assertFirebaseConfig(): void {
  const missing = REQUIRED_CONFIG_KEYS.filter((key) => !firebaseConfig[key]);
  if (missing.length > 0) {
    throw new Error(
      `Firebase is not configured — missing build-time env var(s): ${missing
        .map((key) => `NEXT_PUBLIC_FIREBASE_${key.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()}`)
        .join(", ")}. NEXT_PUBLIC_* values are inlined at build time, so set them in every ` +
        "environment you deploy to (e.g. Vercel → Project → Settings → Environment Variables, " +
        "for Production and Preview) and redeploy."
    );
  }
}

export function getFirebaseApp(): FirebaseApp {
  if (app) return app;
  assertFirebaseConfig();
  app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return app;
}

export function getFirebaseAuth(): Auth {
  if (authInstance) return authInstance;
  authInstance = getAuth(getFirebaseApp());
  return authInstance;
}

