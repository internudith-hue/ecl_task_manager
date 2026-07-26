"use client";

import { useId, useState, type FormEvent } from "react";
import { Clock3, Plus } from "lucide-react";

import styles from "./CalmDashboard.module.css";

interface TaskInput {
  name: string;
  hours: number;
}

interface TaskFormProps {
  /** Called synchronously — do NOT await Firestore inside; use optimistic pattern. */
  onSubmit: (input: TaskInput) => void;
  /** External error from the background write operation (e.g. Firestore failure). */
  addError?: string | null;
}

const MAX_TASK_HOURS = 10_000;

export function TaskForm({
  onSubmit,
  addError,
}: TaskFormProps) {
  const nameId = useId();
  const hoursId = useId();
  const errorId = useId();
  const [name, setName] = useState("");
  const [hours, setHours] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [lastAdded, setLastAdded] = useState<string | null>(null);

  const displayedError = validationError ?? addError ?? null;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = name.trim();
    const numericHours = Number(hours);

    // Sync validation — show inline errors, don't submit
    if (!cleanName) {
      setValidationError("Give the task a short, descriptive name.");
      return;
    }
    if (!Number.isFinite(numericHours) || numericHours <= 0) {
      setValidationError("Estimated hours must be greater than zero.");
      return;
    }
    if (numericHours > MAX_TASK_HOURS) {
      setValidationError("Estimated hours cannot exceed 10,000.");
      return;
    }
    if (!Number.isInteger(numericHours * 4)) {
      setValidationError("Use quarter-hour increments, such as 0.25, 0.5, or 1.");
      return;
    }

    // All good — clear form immediately (optimistic UX)
    setValidationError(null);
    setLastAdded(cleanName);
    setName("");
    setHours("");

    // Fire-and-forget: parent handles the async write
    onSubmit({ name: cleanName, hours: numericHours });
  }

  return (
    <section className={styles.taskFormPanel} aria-labelledby="add-task-title">
      <div className={styles.sectionHeader}>
        <div>
          <h2 id="add-task-title" className={styles.sectionTitle}>
            Add something
          </h2>
          <p className={styles.sectionDescription}>
            Capture what&apos;s on your mind. A rough estimate is enough.
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
              if (validationError) setValidationError(null);
              if (lastAdded) setLastAdded(null);
            }}
            placeholder="e.g. Review the checkout flow"
            autoComplete="off"
            maxLength={120}
            aria-invalid={Boolean(displayedError && !name.trim())}
            aria-describedby={displayedError ? errorId : undefined}
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
                if (validationError) setValidationError(null);
                if (lastAdded) setLastAdded(null);
              }}
              placeholder="4"
              min="0.25"
              max="10000"
              step="0.25"
              inputMode="decimal"
              aria-invalid={Boolean(
                displayedError && (!hours || Number(hours) <= 0),
              )}
              aria-describedby={displayedError ? errorId : undefined}
              required
            />
            <span>hours</span>
          </div>
        </div>

        <button
          className={styles.primaryButton}
          type="submit"
        >
          <Plus size={17} aria-hidden="true" />
          Add task
        </button>

        {displayedError ? (
          <p className={styles.formError} id={errorId} role="alert">
            {displayedError}
          </p>
        ) : lastAdded && !addError ? (
          <p className={styles.formSuccess} role="status" aria-live="polite">
            {lastAdded} was added to your plan.
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
