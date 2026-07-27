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
  /** Start the intern supervision timer. No-op if already running. */
  handleStart: () => Promise<void>;
  /** Stop the timer and persist a log entry. No-op if not running. */
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

  // Firestore-persisted state
  const [storedSeconds, setStoredSeconds] = useState(0);
  const [timerStartedAt, setTimerStartedAt] = useState<Date | null>(null);
  const [stopLog, setStopLog] = useState<InternStopLogEntry[]>([]);

  // Client-side live tick
  const [liveSeconds, setLiveSeconds] = useState(0);
  const sessionStartRef = useRef<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Track whether the dateKey changes (midnight rollover) ──────────────
  const prevDateKeyRef = useRef<string>(dateKey);

  // ── Subscribe to Firestore doc ────────────────────────────────────────
  useEffect(() => {
    if (!uid) return;

    const unsub = subscribeInternSession(uid, dateKey, (session) => {
      setStoredSeconds(session.totalSeconds);
      setTimerStartedAt(session.timerStartedAt);
      setStopLog(session.stopLog);

      // If Firestore says timer is running, sync the client-side clock
      if (session.timerStartedAt) {
        sessionStartRef.current = session.timerStartedAt;
        setLiveSeconds(secondsSince(session.timerStartedAt));
      }
    });

    return unsub;
  }, [uid, dateKey]);

  // ── Midnight auto-reset: clear live state when date rolls over ────────
  useEffect(() => {
    if (prevDateKeyRef.current !== dateKey) {
      prevDateKeyRef.current = dateKey;
      // Stop any ticking interval and reset live counters
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setLiveSeconds(0);
      sessionStartRef.current = null;
      // storedSeconds / timerStartedAt will be overwritten by the new day's subscription
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
      setLiveSeconds(0);
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
    if (!uid || isRunning) return;
    const now = new Date();
    sessionStartRef.current = now;
    setLiveSeconds(0);
    setTimerStartedAt(now); // optimistic
    await startInternTimer(uid, dateKey);
  }, [uid, isRunning, dateKey]);

  // ── Stop handler ──────────────────────────────────────────────────────
  const handleStop = useCallback(async () => {
    if (!uid || !isRunning) return;
    const elapsed = liveSeconds;
    // Optimistic reset
    setTimerStartedAt(null);
    setLiveSeconds(0);
    sessionStartRef.current = null;
    await stopInternTimer(uid, dateKey, elapsed);
  }, [uid, isRunning, liveSeconds, dateKey]);

  const todayTotalSeconds = storedSeconds + (isRunning ? liveSeconds : 0);

  return { isRunning, todayTotalSeconds, stopLog, handleStart, handleStop };
}
