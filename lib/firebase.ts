import { getApp, getApps, initializeApp, type FirebaseOptions } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Firebase web configuration is public project-identification metadata. Build
// environments can override any value, while these defaults keep preview and
// production deploys functional when no local .env file is present.
const defaultFirebaseConfig: FirebaseOptions = {
  apiKey: "AIzaSyAENvxh8HUwKgxUKBZksEU5-3mWu8FSnlw",
  authDomain: "ecl-lab-520c6.firebaseapp.com",
  projectId: "ecl-lab-520c6",
  storageBucket: "ecl-lab-520c6.firebasestorage.app",
  messagingSenderId: "599692846751",
  appId: "1:599692846751:web:3ab0a721faba026668a4aa",
  measurementId: "G-ZSTDL8S2QS",
};

const firebaseConfig: FirebaseOptions = {
  apiKey:
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY || defaultFirebaseConfig.apiKey,
  authDomain:
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ||
    defaultFirebaseConfig.authDomain,
  projectId:
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    defaultFirebaseConfig.projectId,
  storageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    defaultFirebaseConfig.storageBucket,
  messagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ||
    defaultFirebaseConfig.messagingSenderId,
  appId:
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID || defaultFirebaseConfig.appId,
  measurementId:
    process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ||
    defaultFirebaseConfig.measurementId,
};

export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export type FirebaseAnalytics = Awaited<
  ReturnType<typeof import("firebase/analytics")["getAnalytics"]>
>;

let analyticsPromise: Promise<FirebaseAnalytics | null> | undefined;

/**
 * Analytics is browser-only and optional. Unsupported environments (including
 * browsers that block IndexedDB/cookies) resolve to null rather than breaking
 * the application.
 */
export function initializeAnalytics(): Promise<FirebaseAnalytics | null> {
  if (typeof window === "undefined") {
    return Promise.resolve(null);
  }

  analyticsPromise ??= import("firebase/analytics")
    .then(async ({ getAnalytics, isSupported }) =>
      (await isSupported()) ? getAnalytics(app) : null,
    )
    .catch(() => null);

  return analyticsPromise;
}
