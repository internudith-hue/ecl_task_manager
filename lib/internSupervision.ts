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
  /** Log entries written each time the timer is stopped */
  stopLog: InternStopLogEntry[];
}

export interface InternStopLogEntry {
  stoppedAt: Date;
  sessionSeconds: number; // seconds added in this particular stop
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

function toStopLog(raw: unknown): InternStopLogEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry: unknown) => {
      if (typeof entry !== "object" || entry === null) return null;
      const e = entry as Record<string, unknown>;
      const stoppedAt = toDate(e.stoppedAt);
      const sessionSeconds =
        typeof e.sessionSeconds === "number" ? e.sessionSeconds : 0;
      if (!stoppedAt) return null;
      return { stoppedAt, sessionSeconds } satisfies InternStopLogEntry;
    })
    .filter((x): x is InternStopLogEntry => x !== null);
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
        stopLog: [],
      });
      return;
    }
    const data = snap.data();
    onData({
      dateKey,
      totalSeconds: typeof data.totalSeconds === "number" ? data.totalSeconds : 0,
      timerStartedAt: toDate(data.timerStartedAt),
      stopLog: toStopLog(data.stopLog),
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
 * Atomically adds `additionalSeconds` to `totalSeconds`, clears `timerStartedAt`,
 * and appends a stop-log entry with the timestamp and seconds added.
 */
export async function stopInternTimer(
  uid: string,
  dateKey: string,
  additionalSeconds: number,
): Promise<void> {
  const safeExtra = Math.max(0, Math.round(additionalSeconds));
  const ref = sessionDoc(uid, dateKey);
  // Use a client-side timestamp for the log entry.
  // Firestore's serverTimestamp() sentinel cannot be nested inside an array element.
  const stoppedAt = new Date();

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists() ? snap.data() : {};
    const current = typeof data.totalSeconds === "number" ? data.totalSeconds : 0;
    const existingLog: unknown[] = Array.isArray(data.stopLog) ? data.stopLog : [];

    tx.set(
      ref,
      {
        dateKey,
        totalSeconds: current + safeExtra,
        timerStartedAt: null,
        stopLog: [
          ...existingLog,
          {
            stoppedAt,
            sessionSeconds: safeExtra,
          },
        ],
      },
      { merge: true },
    );
  });
}
