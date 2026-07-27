"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  startInternTimer,
  stopInternTimer,
  subscribeInternSession,
  toDateKey,
  type InternStopLogEntry,
} from "@/lib/internSupervision";

export interface UseInternTimerResult {
  /** True while the timer is actively ticking. */
  isRunning: boolean;
  /** Live total seconds for today: stored totalSeconds + current session seconds. */
  todayTotalSeconds: number;
  /** The stop-log entries for today (appended each time the timer is stopped). */
  stopLog: InternStopLogEntry[];
  /** True while a Firestore write is in-flight — use to disable buttons. */
  isPending: boolean;
  /** Non-null when the last start/stop write failed. */
  error: string | null;
  /** Start the intern supervision timer. No-op if already running or pending. */
  handleStart: () => Promise<void>;
  /** Stop the timer and persist a log entry. No-op if not running or pending. */
  handleStop: () => Promise<void>;
}

/** Seconds elapsed since a given Date (clamped to 0). */
function secondsSince(startedAt: Date): number {
  return Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 1000));
}

export function useInternTimer(
  uid: string | undefined | null,
  today: Date,
): UseInternTimerResult {
  const dateKey = toDateKey(today);

  // ── Firestore-persisted state ──────────────────────────────────────────
  const [storedSeconds, setStoredSeconds] = useState(0);
  const [timerStartedAt, setTimerStartedAt] = useState<Date | null>(null);
  const [stopLog, setStopLog] = useState<InternStopLogEntry[]>([]);

  // ── Local UI state ────────────────────────────────────────────────────
  const [liveSeconds, setLiveSeconds] = useState(0);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sessionStartRef = useRef<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevDateKeyRef = useRef<string>(dateKey);

  /**
   * Ref-based pending flag used inside the Firestore snapshot callback.
   * Prevents the snapshot from overriding our optimistic state while a
   * write is in-flight (avoids flicker).
   */
  const isPendingRef = useRef(false);

  // Keep ref in sync with state
  useEffect(() => {
    isPendingRef.current = isPending;
  }, [isPending]);

  // ── Subscribe to Firestore doc ────────────────────────────────────────
  useEffect(() => {
    if (!uid) return;

    const unsub = subscribeInternSession(uid, dateKey, (session) => {
      // Always sync the persisted total and log — these drive the summary
      setStoredSeconds(session.totalSeconds);
      setStopLog(session.stopLog);

      // Only sync the running / clock state from Firestore when we are NOT
      // in the middle of a local optimistic write, to prevent Firestore's
      // intermediate cache snapshot from overriding the UI we just updated.
      if (!isPendingRef.current) {
        setTimerStartedAt(session.timerStartedAt);
        if (session.timerStartedAt) {
          sessionStartRef.current = session.timerStartedAt;
          setLiveSeconds(secondsSince(session.timerStartedAt));
        }
      }
    });

    return unsub;
  }, [uid, dateKey]);

  // ── Midnight auto-reset ───────────────────────────────────────────────
  useEffect(() => {
    if (prevDateKeyRef.current !== dateKey) {
      prevDateKeyRef.current = dateKey;
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setLiveSeconds(0);
      sessionStartRef.current = null;
    }
  }, [dateKey]);

  // ── Tick interval ─────────────────────────────────────────────────────
  const isRunning = timerStartedAt !== null;

  useEffect(() => {
    if (!isRunning) {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      // Do NOT reset liveSeconds here — that would wipe the running display
      // before we've captured elapsed in handleStop.
      return;
    }

    intervalRef.current = setInterval(() => {
      if (sessionStartRef.current) {
        setLiveSeconds(secondsSince(sessionStartRef.current));
      }
    }, 1000);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRunning]);

  // ── Start handler ─────────────────────────────────────────────────────
  const handleStart = useCallback(async () => {
    if (!uid || isRunning || isPending) return;
    setError(null);
    setIsPending(true);
    isPendingRef.current = true;

    // Optimistic: update UI immediately
    const now = new Date();
    sessionStartRef.current = now;
    setLiveSeconds(0);
    setTimerStartedAt(now);

    try {
      await startInternTimer(uid, dateKey);
    } catch (err) {
      // Rollback: reset to stopped state
      setTimerStartedAt(null);
      sessionStartRef.current = null;
      setLiveSeconds(0);
      setError(err instanceof Error ? err.message : "Failed to start timer.");
    } finally {
      setIsPending(false);
      isPendingRef.current = false;
    }
  }, [uid, isRunning, isPending, dateKey]);

  // ── Stop handler ──────────────────────────────────────────────────────
  const handleStop = useCallback(async () => {
    if (!uid || !isRunning || isPending) return;
    setError(null);
    setIsPending(true);
    isPendingRef.current = true;

    // Capture elapsed before resetting any state
    const elapsed = liveSeconds;
    const newTotal = storedSeconds + elapsed;

    // Optimistic: stop the clock and immediately show the accumulated total
    setTimerStartedAt(null);
    setLiveSeconds(0);
    setStoredSeconds(newTotal); // <— KEY FIX: show total right away
    sessionStartRef.current = null;

    try {
      await stopInternTimer(uid, dateKey, elapsed);
      // Firestore snapshot will confirm + potentially correct newTotal
    } catch (err) {
      // On failure, Firestore snapshot will restore state via the subscription
      setError(err instanceof Error ? err.message : "Failed to stop timer.");
    } finally {
      setIsPending(false);
      isPendingRef.current = false;
    }
  }, [uid, isRunning, isPending, liveSeconds, storedSeconds, dateKey]);

  const todayTotalSeconds = storedSeconds + (isRunning ? liveSeconds : 0);

  return { isRunning, todayTotalSeconds, stopLog, isPending, error, handleStart, handleStop };
}
