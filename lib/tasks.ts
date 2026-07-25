import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import type { Task, TaskStatus } from "@/lib/types";

export const TASK_ORDER_SPACING = 1_000;
export const MAX_TASK_NAME_LENGTH = 200;
export const TASK_HOURS_INCREMENT = 0.25;
export const MAX_TASK_HOURS = 10_000;

export interface NewTaskInput {
  name: string;
  hours: number;
  status?: TaskStatus;
}

export interface TaskUpdateInput {
  name?: string;
  hours?: number;
  status?: TaskStatus;
}

export type ReorderTask = string | Pick<Task, "id">;
export type TaskMoveDirection = "up" | "down";
export type OrderedPendingTask = Pick<Task, "id" | "order">;

function requirePathSegment(value: string, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} is invalid.`);
  }

  const normalized = value.trim();

  if (normalized.length === 0 || normalized.includes("/")) {
    throw new Error(`${label} is invalid.`);
  }

  return normalized;
}

function normalizeName(name: string): string {
  const normalized = name.trim();

  if (normalized.length === 0) {
    throw new Error("Task name is required.");
  }

  if (normalized.length > MAX_TASK_NAME_LENGTH) {
    throw new Error(
      `Task name must be ${MAX_TASK_NAME_LENGTH} characters or fewer.`,
    );
  }

  return normalized;
}

function normalizeHours(hours: number): number {
  if (!Number.isFinite(hours) || hours <= 0) {
    throw new Error("Task hours must be a number greater than zero.");
  }

  if (hours > MAX_TASK_HOURS) {
    throw new Error(`Task hours cannot exceed ${MAX_TASK_HOURS}.`);
  }

  if (!Number.isInteger(hours / TASK_HOURS_INCREMENT)) {
    throw new Error(
      `Task hours must use ${TASK_HOURS_INCREMENT}-hour increments.`,
    );
  }

  return hours;
}

function normalizeStatus(status: TaskStatus): TaskStatus {
  if (status !== "pending" && status !== "done") {
    throw new Error("Task status must be either pending or done.");
  }

  return status;
}

function taskCollection(uid: string) {
  return collection(db, "users", requirePathSegment(uid, "User ID"), "tasks");
}

function taskDocument(uid: string, taskId: string) {
  return doc(
    db,
    "users",
    requirePathSegment(uid, "User ID"),
    "tasks",
    requirePathSegment(taskId, "Task ID"),
  );
}

function readOrder(snapshot: QueryDocumentSnapshot<DocumentData>): number {
  const order = snapshot.data().order;
  return normalizeTaskOrder(order, "Stored task order");
}

function normalizeTaskOrder(order: unknown, label: string): number {
  if (typeof order !== "number" || !Number.isSafeInteger(order)) {
    throw new Error(`${label} must be a safe integer.`);
  }

  return order;
}

function readTaskOrderCounter(value: unknown): number {
  if (value === undefined) {
    return 0;
  }

  const counter = normalizeTaskOrder(value, "Task order counter");
  if (counter < 0) {
    throw new Error("Task order counter cannot be negative.");
  }

  return counter;
}

function midpointOrder(lowerOrder: number, upperOrder: number): number {
  const midpoint = Math.floor(lowerOrder / 2 + upperOrder / 2);

  if (
    !Number.isSafeInteger(midpoint) ||
    midpoint <= lowerOrder ||
    midpoint >= upperOrder
  ) {
    throw new Error(
      "There is no remaining order gap for this move. Normalize the queue and try again.",
    );
  }

  return midpoint;
}

function boundaryOrder(neighborOrder: number, offset: number): number {
  const order = neighborOrder + offset;

  if (!Number.isSafeInteger(order)) {
    throw new Error(
      "The task queue order is out of range. Normalize the queue and try again.",
    );
  }

  return order;
}

export async function addTask(
  uid: string,
  input: NewTaskInput,
): Promise<string> {
  const normalizedUid = requirePathSegment(uid, "User ID");
  const normalizedInput = {
    name: normalizeName(input.name),
    hours: normalizeHours(input.hours),
    status: normalizeStatus(input.status ?? "pending"),
  };
  const tasks = taskCollection(uid);
  const lastTask = await getDocs(
    query(tasks, orderBy("order", "desc"), limit(1)),
  );
  const observedMaxOrder = lastTask.empty ? 0 : readOrder(lastTask.docs[0]);
  const userRef = doc(db, "users", normalizedUid);
  const taskRef = doc(tasks);
  await runTransaction(db, async (transaction) => {
    const userSnapshot = await transaction.get(userRef);
    const storedCounter = readTaskOrderCounter(
      userSnapshot.data()?.nextTaskOrder,
    );
    const nextOrder =
      Math.max(0, storedCounter, observedMaxOrder) + TASK_ORDER_SPACING;

    if (!Number.isSafeInteger(nextOrder)) {
      throw new Error(
        "The task queue order is out of range. Normalize the queue before adding a task.",
      );
    }

    transaction.set(userRef, { nextTaskOrder: nextOrder }, { merge: true });
    transaction.set(taskRef, {
      ...normalizedInput,
      order: nextOrder,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  return taskRef.id;
}

export async function updateTask(
  uid: string,
  taskId: string,
  input: TaskUpdateInput,
): Promise<void> {
  const changes: Record<string, unknown> = {};

  if (input.name !== undefined) {
    changes.name = normalizeName(input.name);
  }
  if (input.hours !== undefined) {
    changes.hours = normalizeHours(input.hours);
  }
  if (input.status !== undefined) {
    changes.status = normalizeStatus(input.status);
  }

  if (Object.keys(changes).length === 0) {
    throw new Error("At least one task field must be updated.");
  }

  changes.updatedAt = serverTimestamp();
  await updateDoc(taskDocument(uid, taskId), changes);
}

export async function deleteTask(
  uid: string,
  taskId: string,
): Promise<void> {
  await deleteDoc(taskDocument(uid, taskId));
}

/**
 * Marks a task's timer as started by writing timerStartedAt = now.
 * Does NOT touch trackedSeconds — that accumulates on stop.
 */
export async function startTimer(
  uid: string,
  taskId: string,
): Promise<void> {
  await updateDoc(taskDocument(uid, taskId), {
    timerStartedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Stops a running timer: adds additionalSeconds to trackedSeconds and clears timerStartedAt.
 */
export async function stopTimer(
  uid: string,
  taskId: string,
  additionalSeconds: number,
): Promise<void> {
  const safeExtra = Math.max(0, Math.round(additionalSeconds));
  const taskRef = taskDocument(uid, taskId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(taskRef);
    const current = snap.exists()
      ? Math.max(0, Number(snap.data().trackedSeconds) || 0)
      : 0;
    tx.update(taskRef, {
      trackedSeconds: current + safeExtra,
      timerStartedAt: null,
      updatedAt: serverTimestamp(),
    });
  });
}

/**
 * Stores or clears the associated Google Calendar Event ID for a task.
 */
export async function saveGcalEventId(
  uid: string,
  taskId: string,
  gcalEventId: string | null,
): Promise<void> {
  await updateDoc(taskDocument(uid, taskId), {
    gcalEventId: gcalEventId ? gcalEventId.trim() : null,
    updatedAt: serverTimestamp(),
  });
}

export async function toggleTaskStatus(
  uid: string,
  taskId: string,
  currentStatus: TaskStatus,
): Promise<void> {
  const status = normalizeStatus(currentStatus);
  await updateDoc(taskDocument(uid, taskId), {
    status: status === "done" ? "pending" : "done",
    updatedAt: serverTimestamp(),
  });
}

/**
 * Moves one pending task by changing only that task document. Midpoints leave
 * surrounding tasks untouched; reorderTasks can restore wide gaps if they are
 * eventually exhausted.
 */
export async function moveTask(
  uid: string,
  orderedPendingTasks: readonly OrderedPendingTask[],
  taskId: string,
  direction: TaskMoveDirection,
): Promise<void> {
  if (direction !== "up" && direction !== "down") {
    throw new Error("Task move direction must be either up or down.");
  }

  const normalizedTaskId = requirePathSegment(taskId, "Task ID");
  const seenTaskIds = new Set<string>();
  const tasks = orderedPendingTasks.map((task, index) => {
    if (typeof task !== "object" || task === null) {
      throw new Error("Pending task data is invalid.");
    }

    const id = requirePathSegment(task.id, "Task ID");
    const order = normalizeTaskOrder(task.order, "Task order");
    const status = (task as Partial<Pick<Task, "status">>).status;

    if (status !== undefined && status !== "pending") {
      throw new Error("Only pending tasks can be moved.");
    }
    if (seenTaskIds.has(id)) {
      throw new Error("Each pending task can appear only once.");
    }
    if (index > 0 && order <= orderedPendingTasks[index - 1].order) {
      throw new Error(
        "Pending tasks must be ordered by unique ascending order values.",
      );
    }

    seenTaskIds.add(id);
    return { id, order };
  });
  const currentIndex = tasks.findIndex((task) => task.id === normalizedTaskId);

  if (currentIndex < 0) {
    throw new Error("The task to move is not in the pending queue.");
  }

  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= tasks.length) {
    return;
  }

  let nextOrder: number;
  if (direction === "up") {
    const upperOrder = tasks[currentIndex - 1].order;
    nextOrder =
      currentIndex === 1
        ? boundaryOrder(upperOrder, -TASK_ORDER_SPACING)
        : midpointOrder(tasks[currentIndex - 2].order, upperOrder);
  } else {
    const lowerOrder = tasks[currentIndex + 1].order;
    nextOrder =
      currentIndex === tasks.length - 2
        ? boundaryOrder(lowerOrder, TASK_ORDER_SPACING)
        : midpointOrder(lowerOrder, tasks[currentIndex + 2].order);
  }

  await updateDoc(taskDocument(uid, normalizedTaskId), {
    order: nextOrder,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Atomically normalizes queue ordering to 1000, 2000, 3000, ... .
 * Firestore batches are capped at 500 writes, so an oversized queue is rejected
 * before any write is attempted.
 */
export async function reorderTasks(
  uid: string,
  orderedTasks: readonly ReorderTask[],
): Promise<void> {
  if (orderedTasks.length > 500) {
    throw new Error("A maximum of 500 tasks can be reordered at once.");
  }

  const normalizedUid = requirePathSegment(uid, "User ID");
  const taskIds = orderedTasks.map((task) =>
    requirePathSegment(
      typeof task === "string" ? task : task.id,
      "Task ID",
    ),
  );

  if (new Set(taskIds).size !== taskIds.length) {
    throw new Error("Each task can appear only once in a reordered queue.");
  }

  if (taskIds.length === 0) {
    return;
  }

  const batch = writeBatch(db);
  taskIds.forEach((taskId, index) => {
    batch.update(doc(db, "users", normalizedUid, "tasks", taskId), {
      order: (index + 1) * TASK_ORDER_SPACING,
      updatedAt: serverTimestamp(),
    });
  });

  await batch.commit();
}

export const reorder = reorderTasks;
