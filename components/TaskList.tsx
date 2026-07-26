"use client";

import {
  ArrowDown,
  ArrowUp,
  CalendarRange,
  Check,
  CheckCircle2,
  Circle,
  Clock3,
  Edit3,
  ListTodo,
  LoaderCircle,
  Play,
  Save,
  Square,
  Trash2,
  X,
} from "lucide-react";
import {
  useMemo,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import type { ScheduledTask, Task } from "@/lib/types";

import styles from "./CalmDashboard.module.css";

interface TaskInput {
  name: string;
  hours: number;
}

interface TaskListProps {
  tasks: Task[];
  schedule: ScheduledTask[];
  onToggle: (task: Task) => Promise<void>;
  onDelete: (task: Task) => Promise<void>;
  onMove: (taskId: string, direction: "up" | "down") => Promise<void>;
  onEdit: (task: Task, input: TaskInput) => Promise<void>;
  onStartTimer: (taskId: string) => Promise<void>;
  onStopTimer: (taskId: string) => Promise<void>;
  elapsedMap: Map<string, number>;
  activeTimerTaskId: string | null;
  busyTaskId?: string | null;
}

interface TaskActionMessages {
  pending: string;
  success: string;
}

const taskDate = new Intl.DateTimeFormat("en", {
  weekday: "short",
  month: "short",
  day: "numeric",
});

/** Format elapsed seconds → "1h 23m 45s" (omits hours/minutes if zero) */
function formatElapsed(totalSeconds: number): string {
  if (totalSeconds <= 0) return "0s";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "That change didn’t go through. Please try again.";
}

function formatSchedule(task: ScheduledTask) {
  if (task.startDate.toDateString() === task.endDate.toDateString()) {
    return taskDate.format(task.startDate);
  }

  return `${taskDate.format(task.startDate)} – ${taskDate.format(task.endDate)}`;
}

export function TaskList({
  tasks,
  schedule,
  onToggle,
  onDelete,
  onMove,
  onEdit,
  onStartTimer,
  onStopTimer,
  elapsedMap,
  activeTimerTaskId,
  busyTaskId = null,
}: TaskListProps) {
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftHours, setDraftHours] = useState("");
  const [localBusyTaskId, setLocalBusyTaskId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);

  const scheduledById = useMemo(
    () => new Map(schedule.map((task) => [task.id, task])),
    [schedule],
  );
  const pendingTasks = useMemo(
    () =>
      tasks
        .filter((task) => task.status === "pending")
        .sort((first, second) => first.order - second.order),
    [tasks],
  );
  const completedTasks = useMemo(
    () =>
      tasks
        .filter((task) => task.status === "done")
        .sort((first, second) => second.order - first.order),
    [tasks],
  );
  const visibleTasks = showCompleted
    ? [...pendingTasks, ...completedTasks]
    : pendingTasks;
  const currentBusyTaskId = busyTaskId ?? localBusyTaskId;
  const hasBusyTask = Boolean(currentBusyTaskId);

  function beginEditing(task: Task) {
    setActionError(null);
    setEditingTaskId(task.id);
    setDraftName(task.name);
    setDraftHours(String(task.hours));
  }

  function stopEditing() {
    setEditingTaskId(null);
    setDraftName("");
    setDraftHours("");
  }

  async function runTaskAction(
    taskId: string,
    action: () => Promise<void>,
    messages: TaskActionMessages,
  ) {
    setActionError(null);
    setStatusMessage(messages.pending);
    setLocalBusyTaskId(taskId);

    try {
      await action();
      setStatusMessage(messages.success);
      return true;
    } catch (error) {
      setActionError(getErrorMessage(error));
      setStatusMessage("");
      return false;
    } finally {
      setLocalBusyTaskId(null);
    }
  }

  async function saveEdit(
    event: FormEvent<HTMLFormElement>,
    task: Task,
  ) {
    event.preventDefault();
    const cleanName = draftName.trim();
    const numericHours = Number(draftHours);

    if (!cleanName) {
      setActionError("Task names cannot be empty.");
      return;
    }

    if (!Number.isFinite(numericHours) || numericHours <= 0) {
      setActionError("Estimated hours must be greater than zero.");
      return;
    }

    const saved = await runTaskAction(
      task.id,
      () => onEdit(task, { name: cleanName, hours: numericHours }),
      {
        pending: `Saving changes to ${task.name}.`,
        success: `Changes to ${cleanName} saved.`,
      },
    );

    if (saved) {
      stopEditing();
    }
  }

  async function deleteTask(task: Task) {
    const confirmed = window.confirm(
      `Remove “${task.name}” from your plan? This cannot be undone.`,
    );

    if (!confirmed) return;

    const deleted = await runTaskAction(
      task.id,
      () => onDelete(task),
      {
        pending: `Deleting ${task.name}.`,
        success: `${task.name} deleted.`,
      },
    );
    if (deleted && editingTaskId === task.id) {
      stopEditing();
    }
  }

  function handleEditKeys(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      stopEditing();
    }
  }

  function moveTask(
    task: Task,
    direction: "up" | "down",
    currentIndex: number,
  ) {
    const nextPosition =
      direction === "up" ? currentIndex : currentIndex + 2;

    return runTaskAction(
      task.id,
      () => onMove(task.id, direction),
      {
        pending: `Moving ${task.name} ${direction}.`,
        success: `${task.name} moved to position ${nextPosition} of ${pendingTasks.length}.`,
      },
    );
  }

  return (
    <section className={styles.taskListPanel} aria-labelledby="task-list-title">
      <div className={styles.sectionHeader}>
        <div>
          <h2 id="task-list-title" className={styles.sectionTitle}>
            Up next
          </h2>
          <p className={styles.sectionDescription}>
            Projected dates follow your weekday pace and skip weekends.
          </p>
        </div>
        {completedTasks.length > 0 ? (
          <button
            className={styles.completedToggle}
            type="button"
            onClick={() => setShowCompleted((current) => !current)}
            aria-expanded={showCompleted}
          >
            <Check size={13} aria-hidden="true" />
            {showCompleted
              ? "Hide completed"
              : `${completedTasks.length} completed`}
          </button>
        ) : null}
      </div>

      <p
        className={styles.srOnly}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {statusMessage}
      </p>

      {actionError ? (
        <div className={styles.actionError} role="alert">
          <span>{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            aria-label="Dismiss error"
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {visibleTasks.length === 0 ? (
        <div className={styles.emptyState}>
          <span className={styles.emptyStateIcon} aria-hidden="true">
            <ListTodo size={24} />
          </span>
          <h3>{tasks.length === 0 ? "A quiet start" : "All caught up"}</h3>
          <p>
            {tasks.length === 0
              ? "Add something when you’re ready; its projected date will appear here."
              : "There is nothing waiting. Completed work is safely tucked away."}
          </p>
        </div>
      ) : (
        <ol className={styles.taskList} aria-busy={hasBusyTask}>
          {visibleTasks.map((task) => {
            const isDone = task.status === "done";
            const isOptimistic = Boolean(task.isOptimistic);
            const pendingIndex = pendingTasks.findIndex(
              (pendingTask) => pendingTask.id === task.id,
            );
            const scheduledTask = scheduledById.get(task.id);
            const isEditing = editingTaskId === task.id;
            const isBusy = currentBusyTaskId === task.id;

            return (
              <li
                className={`${styles.taskItem} ${
                  isDone ? styles.taskItemDone : ""
                } ${isEditing ? styles.taskItemEditing : ""} ${
                  activeTimerTaskId === task.id ? styles.taskItemRunning : ""
                } ${isOptimistic ? styles.taskItemOptimistic : ""}`}
                key={task.id}
                aria-busy={isBusy || isOptimistic}
                aria-label={isOptimistic ? `Adding ${task.name}…` : undefined}
              >
                <button
                  className={styles.taskToggle}
                  type="button"
                  onClick={() =>
                    void runTaskAction(
                      task.id,
                      () => onToggle(task),
                      {
                        pending: isDone
                          ? `Returning ${task.name} to the queue.`
                          : `Marking ${task.name} complete.`,
                        success: isDone
                          ? `${task.name} returned to the queue.`
                          : `${task.name} marked complete.`,
                      },
                    )
                  }
                  disabled={hasBusyTask || isEditing || isOptimistic}
                  aria-label={
                    isDone
                      ? `Move ${task.name} back to the queue`
                      : `Mark ${task.name} complete`
                  }
                  aria-pressed={isDone}
                >
                  {isDone ? (
                    <CheckCircle2 size={21} aria-hidden="true" />
                  ) : (
                    <Circle size={21} aria-hidden="true" />
                  )}
                </button>

                {isEditing ? (
                  <form
                    className={styles.inlineEditForm}
                    onSubmit={(event) => void saveEdit(event, task)}
                    onKeyDown={handleEditKeys}
                  >
                    <div className={styles.inlineEditFields}>
                      <label>
                        <span className={styles.srOnly}>Task name</span>
                        <input
                          type="text"
                          value={draftName}
                          onChange={(event) => setDraftName(event.target.value)}
                          maxLength={120}
                          autoFocus
                          disabled={isBusy}
                          required
                        />
                      </label>
                      <label className={styles.inlineHoursField}>
                        <Clock3 size={14} aria-hidden="true" />
                        <span className={styles.srOnly}>Estimated hours</span>
                        <input
                          type="number"
                          value={draftHours}
                          onChange={(event) => setDraftHours(event.target.value)}
                          min="0.25"
                          max="10000"
                          step="0.25"
                          inputMode="decimal"
                          disabled={isBusy}
                          required
                        />
                        <span>h</span>
                      </label>
                    </div>
                    <div className={styles.inlineEditActions}>
                      <button
                        className={styles.iconButtonPrimary}
                        type="submit"
                        disabled={isBusy}
                        aria-label={`Save changes to ${task.name}`}
                      >
                        {isBusy ? (
                          <LoaderCircle
                            className={styles.spinner}
                            size={16}
                            aria-hidden="true"
                          />
                        ) : (
                          <Save size={16} aria-hidden="true" />
                        )}
                      </button>
                      <button
                        className={styles.iconButton}
                        type="button"
                        onClick={stopEditing}
                        disabled={isBusy}
                        aria-label="Cancel editing"
                      >
                        <X size={16} aria-hidden="true" />
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className={styles.taskBody}>
                      <div className={styles.taskTitleRow}>
                        <h3>{task.name}</h3>
                        {isDone ? (
                          <span className={styles.srOnly}>Completed</span>
                        ) : null}
                      </div>
                      <div className={styles.taskMeta}>
                        <span>
                          <Clock3 size={14} aria-hidden="true" />
                          {task.hours}h
                        </span>
                        {scheduledTask ? (
                          <span>
                            <CalendarRange size={14} aria-hidden="true" />
                            Projected {formatSchedule(scheduledTask)} · {scheduledTask.durationDays}
                            {scheduledTask.durationDays === 1
                              ? " workday"
                              : " workdays"}
                          </span>
                        ) : null}
                        {/* Timer elapsed display */}
                        {(() => {
                          const elapsed = elapsedMap.get(task.id) ?? task.trackedSeconds;
                          const isRunning = activeTimerTaskId === task.id;
                          if (elapsed <= 0 && !isRunning) return null;
                          return (
                            <span
                              className={`${styles.timerDisplay} ${
                                elapsed <= 0 ? styles.timerDisplayZero : ""
                              }`}
                            >
                              {isRunning ? (
                                <span className={styles.timerPulse} aria-hidden="true" />
                              ) : (
                                <Clock3 size={12} aria-hidden="true" />
                              )}
                              {formatElapsed(elapsed)}
                            </span>
                          );
                        })()}
                      </div>
                    </div>

                    <div className={styles.taskActions}>
                      {isBusy ? (
                        <span className={styles.taskBusyIndicator}>
                          <LoaderCircle
                            className={styles.spinner}
                            size={15}
                            aria-hidden="true"
                          />
                          Updating
                        </span>
                      ) : (
                        <>
                          {/* Timer button */}
                          {!isDone ? (
                            <button
                              className={`${styles.timerButton} ${
                                activeTimerTaskId === task.id
                                  ? styles.timerButtonActive
                                  : ""
                              }`}
                              type="button"
                              onClick={() =>
                                activeTimerTaskId === task.id
                                  ? void onStopTimer(task.id)
                                  : void onStartTimer(task.id)
                              }
                              disabled={hasBusyTask}
                              aria-label={
                                activeTimerTaskId === task.id
                                  ? `Stop timer for ${task.name}`
                                  : `Start timer for ${task.name}`
                              }
                              title={
                                activeTimerTaskId === task.id
                                  ? "Stop timer"
                                  : "Start timer"
                              }
                            >
                              {activeTimerTaskId === task.id ? (
                                <Square size={15} aria-hidden="true" />
                              ) : (
                                <Play size={15} aria-hidden="true" />
                              )}
                            </button>
                          ) : null}

                          {!isDone ? (
                            <div
                              className={styles.moveControls}
                              role="group"
                              aria-label={`Reorder ${task.name}`}
                            >
                              <button
                                className={styles.iconButton}
                                type="button"
                                onClick={() =>
                                  void moveTask(task, "up", pendingIndex)
                                }
                                disabled={hasBusyTask || pendingIndex === 0}
                                aria-label={`Move ${task.name} up`}
                                title="Move up"
                              >
                                <ArrowUp size={16} aria-hidden="true" />
                              </button>
                              <button
                                className={styles.iconButton}
                                type="button"
                                onClick={() =>
                                  void moveTask(task, "down", pendingIndex)
                                }
                                disabled={
                                  hasBusyTask ||
                                  pendingIndex === pendingTasks.length - 1
                                }
                                aria-label={`Move ${task.name} down`}
                                title="Move down"
                              >
                                <ArrowDown size={16} aria-hidden="true" />
                              </button>
                            </div>
                          ) : null}
                          <button
                            className={styles.iconButton}
                            type="button"
                            onClick={() => beginEditing(task)}
                            disabled={hasBusyTask}
                            aria-label={`Edit ${task.name}`}
                            title="Edit task"
                          >
                            <Edit3 size={16} aria-hidden="true" />
                          </button>
                          <button
                            className={`${styles.iconButton} ${styles.deleteButton}`}
                            type="button"
                            onClick={() => void deleteTask(task)}
                            disabled={hasBusyTask}
                            aria-label={`Delete ${task.name}`}
                            title="Delete task"
                          >
                            <Trash2 size={16} aria-hidden="true" />
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

export default TaskList;
