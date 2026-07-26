"use client";

import {
  collection,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { useCallback, useEffect, useRef, useState } from "react";

import { db } from "@/lib/firebase";
import { TASK_ORDER_SPACING } from "@/lib/tasks";
import type { Task, TaskStatus } from "@/lib/types";

export interface UseTasksResult {
  tasks: Task[];
  loading: boolean;
  error: Error | null;
  addOptimisticTask: (
    input: { name: string; hours: number },
    doWrite: () => Promise<void>,
    onError: (error: Error) => void,
  ) => void;
}

interface TasksSubscriptionState {
  uid: string;
  tasks: Task[];
  error: Error | null;
}

function asDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (value instanceof Timestamp) {
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

function asFiniteNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asTaskStatus(value: unknown): TaskStatus {
  return value === "done" ? "done" : "pending";
}

function mapTask(
  snapshot: QueryDocumentSnapshot<DocumentData>,
): Task {
  const data = snapshot.data();

  return {
    id: snapshot.id,
    name: typeof data.name === "string" ? data.name : "",
    hours: asFiniteNumber(data.hours),
    status: asTaskStatus(data.status),
    order: asFiniteNumber(data.order),
    createdAt: asDate(data.createdAt),
    updatedAt: asDate(data.updatedAt),
    trackedSeconds: Math.max(0, asFiniteNumber(data.trackedSeconds, 0)),
    timerStartedAt: asDate(data.timerStartedAt),
    gcalEventId: typeof data.gcalEventId === "string" ? data.gcalEventId : null,
  };
}

function asError(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error("Unable to load tasks.", { cause: error });
}

export function useTasks(uid?: string | null): UseTasksResult {
  const [subscription, setSubscription] =
    useState<TasksSubscriptionState | null>(null);

  // Optimistic tasks: shown immediately while Firestore write is in-flight
  const [optimisticTasks, setOptimisticTasks] = useState<Task[]>([]);

  // Mutable ref so addOptimisticTask always sees the current real task list
  const subscriptionRef = useRef<TasksSubscriptionState | null>(null);
  subscriptionRef.current = subscription;

  useEffect(() => {
    if (!uid) {
      return;
    }

    const tasksQuery = query(
      collection(db, "users", uid, "tasks"),
      orderBy("order", "asc"),
    );

    return onSnapshot(
      tasksQuery,
      (snapshot) => {
        try {
          setSubscription({
            uid,
            tasks: snapshot.docs.map(mapTask),
            error: null,
          });
        } catch (nextError) {
          setSubscription({ uid, tasks: [], error: asError(nextError) });
        }
      },
      (nextError) => {
        setSubscription({ uid, tasks: [], error: asError(nextError) });
      },
    );
  }, [uid]);

  /**
   * Adds a task optimistically (instant UI update) while the Firestore write
   * runs in the background. Calls `onError` and removes the optimistic entry
   * if the write fails.
   */
  const addOptimisticTask = useCallback(
    (
      input: { name: string; hours: number },
      doWrite: () => Promise<void>,
      onError: (error: Error) => void,
    ) => {
      const tempId =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `temp-${Date.now()}-${Math.random()}`;

      const currentTasks = subscriptionRef.current?.tasks ?? [];
      const maxOrder = currentTasks.reduce(
        (max, t) => Math.max(max, t.order),
        0,
      );
      const optimisticOrder = maxOrder + TASK_ORDER_SPACING;

      const optimisticTask: Task = {
        id: tempId,
        name: input.name.trim(),
        hours: input.hours,
        status: "pending",
        order: optimisticOrder,
        createdAt: null,
        updatedAt: null,
        trackedSeconds: 0,
        timerStartedAt: null,
        gcalEventId: null,
        isOptimistic: true,
        tempId,
      };

      setOptimisticTasks((prev) => [...prev, optimisticTask]);

      void doWrite()
        .then(() => {
          // Write succeeded — Firestore snapshot will add the real task;
          // remove the placeholder so it doesn't appear twice.
          setOptimisticTasks((prev) => prev.filter((t) => t.tempId !== tempId));
        })
        .catch((writeError) => {
          // Write failed — remove placeholder and surface the error.
          setOptimisticTasks((prev) => prev.filter((t) => t.tempId !== tempId));
          onError(
            writeError instanceof Error
              ? writeError
              : new Error("Failed to add task. Please try again."),
          );
        });
    },
    [],
  );

  if (!uid) {
    return {
      tasks: [],
      loading: false,
      error: null,
      addOptimisticTask,
    };
  }

  if (subscription?.uid !== uid) {
    return {
      tasks: [],
      loading: true,
      error: null,
      addOptimisticTask,
    };
  }

  // Merge real tasks with in-flight optimistic tasks.
  // Optimistic tasks always go at the end (highest order).
  const mergedTasks = [...subscription.tasks, ...optimisticTasks];

  return {
    tasks: mergedTasks,
    loading: false,
    error: subscription.error,
    addOptimisticTask,
  };
}
