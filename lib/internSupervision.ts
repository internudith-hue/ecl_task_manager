import {
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  type Timestamp,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

// ── Path helpers ────────────────────────────────────────────────────────────

function sessionDoc(uid: string, dateKey: string) {
  return doc(db, "users", uid, "internSupervision", dateKey);
}

/** Returns "YYYY-MM-DD" for a given Date in local time. */
export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ── Firestore shape ──────────────────────────────────────────────────────────

export interface InternSessionDoc {
  dateKey: string;
  totalSeconds: number;
  timerStartedAt: Date | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  // Firestore Timestamp
  if (
    typeof value === "object" &&
    "toDate" in (value as object) &&
    typeof (value as Timestamp).toDate === "function"
  ) {
    return (value as Timestamp).toDate();
  }
  return null;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Subscribe to today's intern supervision session document.
 * The callback is called immediately with the current state and on every change.
 * Returns an unsubscribe function.
 */
export function subscribeInternSession(
  uid: string,
  dateKey: string,
  onData: (session: InternSessionDoc) => void,
): () => void {
  return onSnapshot(sessionDoc(uid, dateKey), (snap) => {
    if (!snap.exists()) {
      onData({
        dateKey,
        totalSeconds: 0,
        timerStartedAt: null,
      });
      return;
    }
    const data = snap.data();
    onData({
      dateKey,
      totalSeconds: typeof data.totalSeconds === "number" ? data.totalSeconds : 0,
      timerStartedAt: toDate(data.timerStartedAt),
    });
  });
}

/**
 * Mark the intern supervision timer as started for the given day.
 * Creates the document if it doesn't exist.
 */
export async function startInternTimer(
  uid: string,
  dateKey: string,
): Promise<void> {
  await setDoc(
    sessionDoc(uid, dateKey),
    {
      dateKey,
      timerStartedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

/**
 * Stop the running intern supervision timer.
 * Atomically adds `additionalSeconds` to `totalSeconds` and clears `timerStartedAt`.
 */
export async function stopInternTimer(
  uid: string,
  dateKey: string,
  additionalSeconds: number,
): Promise<void> {
  const safeExtra = Math.max(0, Math.round(additionalSeconds));
  const ref = sessionDoc(uid, dateKey);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists() ? snap.data() : {};
    const current = typeof data.totalSeconds === "number" ? data.totalSeconds : 0;

    tx.set(
      ref,
      {
        dateKey,
        totalSeconds: current + safeExtra,
        timerStartedAt: null,
      },
      { merge: true },
    );
  });
}
