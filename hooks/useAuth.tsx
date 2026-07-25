"use client";

import {
  browserLocalPersistence,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { auth } from "@/lib/firebase";

export interface AuthContextValue {
  user: User | null;
  loading: boolean;
  error: Error | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

let localPersistencePromise: Promise<void> | null = null;
const CANONICAL_NETLIFY_HOSTNAME =
  process.env.NEXT_PUBLIC_CANONICAL_HOSTNAME || "ecl-task-manager.netlify.app";
const CANONICAL_VERCEL_HOSTNAME = "ecl-task-manager.vercel.app";

function redirectPreviewToProduction(): boolean {
  if (typeof window === "undefined") return false;

  const { hostname } = window.location;
  const isNetlifyPreview =
    hostname.endsWith(".netlify.app") && hostname !== CANONICAL_NETLIFY_HOSTNAME;
  const isVercelPreview =
    hostname.endsWith(".vercel.app") && hostname !== CANONICAL_VERCEL_HOSTNAME;

  if (!isNetlifyPreview && !isVercelPreview) {
    return false;
  }

  const productionUrl = new URL(window.location.href);
  productionUrl.protocol = "https:";
  productionUrl.hostname = CANONICAL_NETLIFY_HOSTNAME;
  productionUrl.port = "";
  window.location.replace(productionUrl.toString());
  return true;
}

function ensureLocalPersistence(): Promise<void> {
  localPersistencePromise ??= setPersistence(auth, browserLocalPersistence);
  return localPersistencePromise;
}

function authError(error: unknown): Error {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return error instanceof Error
      ? error
      : new Error("Something went wrong while authenticating.");
  }

  const code = String(error.code);
  const currentHostname =
    typeof window === "undefined" ? "this hostname" : window.location.hostname;
  const messages: Record<string, string> = {
    "auth/account-exists-with-different-credential":
      "An account already exists for this email with a different sign-in method.",
    "auth/cancelled-popup-request":
      "The sign-in request was cancelled. Please try again.",
    "auth/network-request-failed":
      "Unable to reach Google sign-in. Check your connection and try again.",
    "auth/operation-not-allowed":
      "Google sign-in is not enabled for this application.",
    "auth/popup-blocked":
      "Your browser blocked the sign-in popup. Allow popups and try again.",
    "auth/popup-closed-by-user":
      "The sign-in window was closed before sign-in completed.",
    "auth/unauthorized-domain":
      `Google sign-in is blocked for ${currentHostname}. Add this exact hostname under Firebase Authentication → Settings → Authorized domains.`,
    "auth/user-disabled": "This account has been disabled.",
  };

  return new Error(
    messages[code] ?? "Authentication failed. Please try again.",
    { cause: error },
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    void ensureLocalPersistence().catch((persistenceError) => {
      setError(authError(persistenceError));
    });

    const loadingFallback = window.setTimeout(() => {
      setLoading(false);
    }, 4_000);

    const unsubscribe = onAuthStateChanged(
      auth,
      (nextUser) => {
        window.clearTimeout(loadingFallback);
        setUser(nextUser);
        setError(null);
        setLoading(false);
      },
      (nextError) => {
        window.clearTimeout(loadingFallback);
        setUser(null);
        setError(authError(nextError));
        setLoading(false);
      },
    );

    return () => {
      window.clearTimeout(loadingFallback);
      unsubscribe();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setError(null);

    try {
      if (redirectPreviewToProduction()) return;

      await ensureLocalPersistence();
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(auth, provider);
    } catch (nextError) {
      const normalizedError = authError(nextError);
      setError(normalizedError);
      throw normalizedError;
    }
  }, []);

  const signOut = useCallback(async () => {
    setError(null);

    try {
      await firebaseSignOut(auth);
    } catch (nextError) {
      const normalizedError = authError(nextError);
      setError(normalizedError);
      throw normalizedError;
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, error, signInWithGoogle, signOut }),
    [error, loading, signInWithGoogle, signOut, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider.");
  }

  return context;
}
