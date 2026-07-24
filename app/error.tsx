"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";

import styles from "./error.module.css";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <span className={styles.icon} aria-hidden="true">
          <AlertTriangle size={24} />
        </span>
        <h1>Something went off schedule</h1>
        <p>
          The workspace hit an unexpected error. Your tasks are still safe in
          Firebase.
        </p>
        <button type="button" onClick={reset}>
          <RotateCcw size={16} aria-hidden="true" />
          Try again
        </button>
      </div>
    </main>
  );
}
