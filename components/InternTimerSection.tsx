"use client";

import { LoaderCircle, Play, Square, Timer } from "lucide-react";

import { useInternTimer } from "@/hooks/useInternTimer";
import { toDateKey } from "@/lib/internSupervision";
import styles from "./CalmDashboard.module.css";

interface InternTimerSectionProps {
  uid: string;
  today: Date;
}

// ── Formatting helpers ────────────────────────────────────────────────────────

/** Format seconds → HH:MM:SS */
function formatClock(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [
    String(h).padStart(2, "0"),
    String(m).padStart(2, "0"),
    String(s).padStart(2, "0"),
  ].join(":");
}

/** Format seconds → "Xh Ym" or "Ym" or "Xs" */
function formatDuration(totalSeconds: number): string {
  if (totalSeconds === 0) return "0m";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

/** Format a Date → "h:mm AM/PM" */
const timeFormatter = new Intl.DateTimeFormat("en", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

export function InternTimerSection({ uid, today }: InternTimerSectionProps) {
  const dateKey = toDateKey(today);
  const {
    isRunning,
    todayTotalSeconds,
    stopLog,
    isPending,
    error,
    handleStart,
    handleStop,
  } = useInternTimer(uid, today);

  return (
    <div className={styles.internTimerSection} aria-label="Intern supervision timer">
      {/* Header */}
      <div className={styles.internTimerHeader}>
        <h3 className={styles.internTimerTitle}>Intern supervision</h3>
        <p className={styles.internTimerSubtitle}>
          Track time spent with your intern today.
        </p>
      </div>

      {/* Actions row */}
      <div className={styles.internTimerActions}>
        {/* Live clock badge — only visible while running */}
        {isRunning && (
          <span className={styles.internTimerBadge} aria-live="off">
            <span className={styles.internTimerDot} aria-hidden="true" />
            <span className={styles.internTimerClock} aria-label="Elapsed time">
              {formatClock(todayTotalSeconds)}
            </span>
          </span>
        )}

        {isRunning ? (
          <button
            id="intern-timer-stop"
            type="button"
            className={styles.internStopButton}
            onClick={() => void handleStop()}
            disabled={isPending}
            aria-label="Stop intern supervision timer"
          >
            {isPending ? (
              <LoaderCircle size={13} aria-hidden="true" className={styles.spinner} />
            ) : (
              <Square size={13} aria-hidden="true" />
            )}
            {isPending ? "Stopping…" : "Stop"}
          </button>
        ) : (
          <button
            id="intern-timer-start"
            type="button"
            className={styles.internStartButton}
            onClick={() => void handleStart()}
            disabled={isPending}
            aria-label="Start intern supervision timer"
          >
            {isPending ? (
              <LoaderCircle size={13} aria-hidden="true" className={styles.spinner} />
            ) : (
              <Play size={13} aria-hidden="true" />
            )}
            {isPending ? "Starting…" : "Start supervision"}
          </button>
        )}
      </div>

      {/* Error feedback */}
      {error && (
        <p className={styles.formError} role="alert" style={{ fontSize: "0.75rem" }}>
          {error}
        </p>
      )}

      {/* Today's cumulative total */}
      <p className={styles.internTimerSummary}>
        <Timer size={11} aria-hidden="true" style={{ verticalAlign: "middle", marginRight: 4 }} />
        Today:{" "}
        <strong>{formatDuration(todayTotalSeconds)}</strong> total
        {isRunning && " (running)"}
      </p>

      {/* Stop-log — notification entries written each time the timer is stopped */}
      {stopLog.length > 0 && (
        <div className={styles.internStopLog} aria-label="Supervision sessions today" aria-live="polite">
          <p className={styles.internStopLogTitle}>Sessions — {dateKey}</p>
          {stopLog.map((entry, index) => (
            <div key={index} className={styles.internStopLogEntry}>
              <time dateTime={entry.stoppedAt.toISOString()}>
                {timeFormatter.format(entry.stoppedAt)}
              </time>
              <span aria-hidden="true">·</span>
              <span className={styles.internStopLogDuration}>
                {formatDuration(entry.sessionSeconds)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default InternTimerSection;
