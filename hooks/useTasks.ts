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
import { useEffect, useState } from "react";

import { db } from "@/lib/firebase";
import type { Task, TaskStatus } from "@/lib/types";

export interface UseTasksResult {
  tasks: Task[];
  loading: boolean;
  error: Error | null;
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

  if (!uid) {
    return { tasks: [], loading: false, error: null };
  }

  if (subscription?.uid !== uid) {
    return { tasks: [], loading: true, error: null };
  }

  return {
    tasks: subscription.tasks,
    loading: false,
    error: subscription.error,
  };
}
