"use client";

import { useId, useState, type FormEvent } from "react";
import { Clock3, LoaderCircle, Plus } from "lucide-react";

import styles from "./CalmDashboard.module.css";

interface TaskInput {
  name: string;
  hours: number;
}

interface TaskFormProps {
  onSubmit: (input: TaskInput) => Promise<void>;
  submitting?: boolean;
}

const MAX_TASK_HOURS = 10_000;

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "We couldn’t add that task. Please try again.";
}

export function TaskForm({
  onSubmit,
  submitting = false,
}: TaskFormProps) {
  const nameId = useId();
  const hoursId = useId();
  const errorId = useId();
  const [name, setName] = useState("");
  const [hours, setHours] = useState("");
  const [localSubmitting, setLocalSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const isSubmitting = submitting || localSubmitting;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = name.trim();
    const numericHours = Number(hours);

    if (!cleanName) {
      setError("Give the task a short, descriptive name.");
      return;
    }

    if (!Number.isFinite(numericHours) || numericHours <= 0) {
      setError("Estimated hours must be greater than zero.");
      return;
    }

    if (numericHours > MAX_TASK_HOURS) {
      setError("Estimated hours cannot exceed 10,000.");
      return;
    }

    if (!Number.isInteger(numericHours * 4)) {
      setError("Use quarter-hour increments, such as 0.25, 0.5, or 1.");
      return;
    }

    setError(null);
    setSuccessMessage(null);
    setLocalSubmitting(true);

    try {
      await onSubmit({ name: cleanName, hours: numericHours });
      setName("");
      setHours("");
      setSuccessMessage(`${cleanName} was added to your plan.`);
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setLocalSubmitting(false);
    }
  }

  return (
    <section className={styles.taskFormPanel} aria-labelledby="add-task-title">
      <div className={styles.sectionHeader}>
        <div>
          <h2 id="add-task-title" className={styles.sectionTitle}>
            Add something
          </h2>
          <p className={styles.sectionDescription}>
            Capture what’s on your mind. A rough estimate is enough.
          </p>
        </div>
      </div>

      <form className={styles.taskForm} onSubmit={handleSubmit}>
        <div className={styles.formField}>
          <label htmlFor={nameId}>What needs your attention?</label>
          <input
            id={nameId}
            name="taskName"
            type="text"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (error) setError(null);
              if (successMessage) setSuccessMessage(null);
            }}
            placeholder="e.g. Review the checkout flow"
            autoComplete="off"
            maxLength={120}
            disabled={isSubmitting}
            aria-invalid={Boolean(error && !name.trim())}
            aria-describedby={error ? errorId : undefined}
            required
          />
        </div>

        <div className={styles.formField}>
          <label htmlFor={hoursId}>Time needed</label>
          <div className={styles.inputWithSuffix}>
            <Clock3 size={16} aria-hidden="true" />
            <input
              id={hoursId}
              name="taskHours"
              type="number"
              value={hours}
              onChange={(event) => {
                setHours(event.target.value);
                if (error) setError(null);
                if (successMessage) setSuccessMessage(null);
              }}
              placeholder="4"
              min="0.25"
              max="10000"
              step="0.25"
              inputMode="decimal"
              disabled={isSubmitting}
              aria-invalid={Boolean(
                error && (!hours || Number(hours) <= 0),
              )}
              aria-describedby={error ? errorId : undefined}
              required
            />
            <span>hours</span>
          </div>
        </div>

        <button
          className={styles.primaryButton}
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <LoaderCircle
              className={styles.spinner}
              size={17}
              aria-hidden="true"
            />
          ) : (
            <Plus size={17} aria-hidden="true" />
          )}
          {isSubmitting ? "Adding task…" : "Add task"}
        </button>

        {error ? (
          <p className={styles.formError} id={errorId} role="alert">
            {error}
          </p>
        ) : successMessage ? (
          <p className={styles.formSuccess} role="status" aria-live="polite">
            {successMessage}
          </p>
        ) : (
          <p className={styles.formHint}>
            You can adjust the name, time, or order later.
          </p>
        )}
      </form>
    </section>
  );
}

export default TaskForm;
