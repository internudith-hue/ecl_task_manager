"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { startTimer, stopTimer } from "@/lib/tasks";
import type { Task } from "@/lib/types";

export interface UseTaskTimerResult {
  /** ID of the task whose timer is currently running (null = none) */
  activeTaskId: string | null;
  /**
   * Live total seconds for each task:
   * trackedSeconds (from Firestore) + seconds elapsed since timerStartedAt
   */
  elapsedMap: Map<string, number>;
  /** Start the timer for a task. Auto-stops any currently running timer first. */
  handleStart: (taskId: string) => Promise<void>;
  /** Stop the active timer and persist elapsed time. */
  handleStop: (taskId: string) => Promise<void>;
}

/** How many seconds have elapsed since `startedAt` (clamped to 0). */
function secondsSince(startedAt: Date): number {
  return Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 1000));
}

/**
 * Builds the full elapsed-seconds map for all tasks.
 * For the running task, adds live seconds on top of its stored trackedSeconds.
 */
function buildElapsedMap(
  tasks: Task[],
  activeTaskId: string | null,
  liveSeconds: number,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const task of tasks) {
    const base = task.trackedSeconds;
    if (task.id === activeTaskId) {
      map.set(task.id, base + liveSeconds);
    } else {
      map.set(task.id, base);
    }
  }
  return map;
}

export function useTaskTimer(
  uid: string | undefined | null,
  tasks: Task[],
): UseTaskTimerResult {
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [liveSeconds, setLiveSeconds] = useState(0);

  // Ref to track when the current active timer session started (client-side clock)
  const sessionStartRef = useRef<Date | null>(null);
  // Ref to hold the interval ID
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ── Auto-detect a timer that was running before page reload ─────── */
  useEffect(() => {
    if (!uid || tasks.length === 0) return;

    // Find any task that has timerStartedAt set (timer survived reload)
    const runningTask = tasks.find((t) => t.timerStartedAt !== null);
    if (!runningTask || activeTaskId === runningTask.id) return;

    // Resume the clock from where it was
    setActiveTaskId(runningTask.id);
    sessionStartRef.current = runningTask.timerStartedAt!;
    setLiveSeconds(secondsSince(runningTask.timerStartedAt!));
  // Only run once when tasks first load — intentionally not re-running
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, tasks.length > 0]);

  /* ── Tick interval ───────────────────────────────────────────────── */
  useEffect(() => {
    if (activeTaskId === null) {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
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
  }, [activeTaskId]);

  /* ── Start handler ───────────────────────────────────────────────── */
  const handleStart = useCallback(
    async (taskId: string) => {
      if (!uid) return;

      // Stop any currently running timer first
      if (activeTaskId && activeTaskId !== taskId) {
        const runningTask = tasks.find((t) => t.id === activeTaskId);
        if (runningTask) {
          const elapsed = liveSeconds;
          setActiveTaskId(null);
          setLiveSeconds(0);
          sessionStartRef.current = null;
          await stopTimer(uid, activeTaskId, elapsed);
        }
      }

      // Start the new timer
      const now = new Date();
      sessionStartRef.current = now;
      setLiveSeconds(0);
      setActiveTaskId(taskId);
      await startTimer(uid, taskId);
    },
    [uid, activeTaskId, liveSeconds, tasks],
  );

  /* ── Stop handler ────────────────────────────────────────────────── */
  const handleStop = useCallback(
    async (taskId: string) => {
      if (!uid || activeTaskId !== taskId) return;

      const elapsed = liveSeconds;
      setActiveTaskId(null);
      setLiveSeconds(0);
      sessionStartRef.current = null;
      await stopTimer(uid, taskId, elapsed);
    },
    [uid, activeTaskId, liveSeconds],
  );

  /* ── Build elapsed map ───────────────────────────────────────────── */
  const elapsedMap = buildElapsedMap(tasks, activeTaskId, liveSeconds);

  return { activeTaskId, elapsedMap, handleStart, handleStop };
}
