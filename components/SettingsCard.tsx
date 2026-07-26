"use client";

import { LoaderCircle, Save } from "lucide-react";
import { useId, useState, type FormEvent } from "react";

import styles from "./CalmDashboard.module.css";

interface SettingsCardProps {
  hoursPerDay: number;
  internSupervisionHours: number;
  loading?: boolean;
  onSave: (hoursPerDay: number, internSupervisionHours: number) => Promise<void>;
  isGCalConnected?: boolean;
  isGCalSyncing?: boolean;
  gcalLastSyncedAt?: Date | null;
  gcalError?: Error | null;
  onConnectGCal?: () => Promise<void>;
  onDisconnectGCal?: () => void;
  onSyncGCal?: () => Promise<void>;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : "We couldn’t save that setting. Please try again.";
}

export function SettingsCard({
  hoursPerDay,
  internSupervisionHours,
  loading = false,
  onSave,
  isGCalConnected = false,
  isGCalSyncing = false,
  gcalLastSyncedAt = null,
  gcalError = null,
  onConnectGCal,
  onDisconnectGCal,
  onSyncGCal,
}: SettingsCardProps) {
  const inputId = useId();
  const internInputId = useId();
  const messageId = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const [draftIntern, setDraftIntern] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const displayedDraft = draft ?? String(hoursPerDay);
  const displayedDraftIntern = draftIntern ?? String(internSupervisionHours);

  const totalHours = Number(displayedDraft) + Number(displayedDraftIntern);
  const isOverallocated = totalHours > 8;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = Number(displayedDraft);
    const internValue = Number(displayedDraftIntern);

    if (!Number.isFinite(value) || value < 0.25 || value > 24) {
      setMessage({
        tone: "error",
        text: "Daily capacity must be between 0.25 and 24 hours.",
      });
      return;
    }

    if (!Number.isFinite(internValue) || internValue < 0 || internValue > 24) {
      setMessage({
        tone: "error",
        text: "Intern supervision must be a valid number.",
      });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      await onSave(value, internValue);
      setDraft(null);
      setDraftIntern(null);
      setMessage({ tone: "success", text: "Your pace is saved." });
    } catch (error) {
      setMessage({ tone: "error", text: getErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.settingsCard} aria-labelledby="capacity-title">
      <div className={styles.settingsHeader}>
        <div>
          <h2 id="capacity-title" className={styles.sectionTitle}>
            Your pace
          </h2>
          <p className={styles.sectionDescription}>
            Choose the hours you want to plan each workday.
          </p>
        </div>
      </div>

      <form className={styles.settingsForm} onSubmit={handleSubmit}>
        <div className={styles.settingsField}>
          <label htmlFor={inputId}>Focus time</label>
          <div className={styles.settingsControl}>
            <input
              id={inputId}
              className={styles.settingsInput}
              type="number"
              value={displayedDraft}
              min="0.25"
              max="24"
              step="0.25"
              inputMode="decimal"
              onChange={(event) => {
                setDraft(event.target.value);
                setMessage(null);
              }}
              disabled={loading || saving}
              aria-describedby={message ? messageId : undefined}
              aria-invalid={message?.tone === "error"}
            />
            <span className={styles.settingsSuffix}>hrs / day</span>
          </div>
        </div>

        <div className={styles.settingsField}>
          <label htmlFor={internInputId}>Intern supervision</label>
          <div className={styles.settingsControl}>
            <input
              id={internInputId}
              className={styles.settingsInput}
              type="number"
              value={displayedDraftIntern}
              min="0"
              max="24"
              step="0.25"
              inputMode="decimal"
              onChange={(event) => {
                setDraftIntern(event.target.value);
                setMessage(null);
              }}
              disabled={loading || saving}
            />
            <span className={styles.settingsSuffix}>hrs / day</span>
          </div>
        </div>

        {isOverallocated && (
          <div className={`${styles.actionError} ${styles.dataError}`} style={{ marginTop: '12px', marginBottom: '12px' }}>
            <span style={{ fontSize: '13px', lineHeight: '1.4' }}>
              <strong>Warning: You allocated more than 8 hours per day.</strong><br/>
              Working more than 8 hours total (Focus Time + Intern Supervision) is not recommended for your health and career.
            </span>
          </div>
        )}

        <button
          className={styles.settingsButton}
          type="submit"
          disabled={
            loading || saving || (Number(displayedDraft) === hoursPerDay && Number(displayedDraftIntern) === internSupervisionHours)
          }
        >
          {saving ? (
            <LoaderCircle
              className={styles.spinner}
              size={16}
              aria-hidden="true"
            />
          ) : (
            <Save size={16} aria-hidden="true" />
          )}
          {saving ? "Saving…" : "Save pace"}
        </button>

        <p
          id={messageId}
          className={
            message?.tone === "success"
              ? styles.settingsMessage
              : styles.formError
          }
          role={message?.tone === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          {message?.text ?? ""}
        </p>
      </form>

      {/* Google Calendar Section (Hidden for now until time-slot scheduling is implemented) */}
      {false && (
        <div className={styles.gcalSection}>
          <div className={styles.gcalHeader}>
            <h3 className={styles.gcalTitle}>Google Calendar Sync</h3>
            <p className={styles.gcalSubtitle}>
              Sync your task delivery dates automatically with Google Calendar.
            </p>
          </div>

          {isGCalConnected ? (
            <div className={styles.gcalConnectedBox}>
              <div className={styles.gcalStatusRow}>
                <span className={styles.gcalBadge}>
                  <span className={styles.gcalDot} />
                  Connected
                </span>
                {gcalLastSyncedAt && (
                  <span className={styles.gcalLastSync}>
                    Last synced: {gcalLastSyncedAt?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>

              <div className={styles.gcalActionsRow}>
                <button
                  type="button"
                  className={styles.gcalSyncBtn}
                  onClick={onSyncGCal}
                  disabled={isGCalSyncing}
                >
                  {isGCalSyncing ? (
                    <>
                      <LoaderCircle className={styles.spinner} size={14} />
                      Syncing…
                    </>
                  ) : (
                    "Sync now"
                  )}
                </button>
                <button
                  type="button"
                  className={styles.gcalDisconnectBtn}
                  onClick={onDisconnectGCal}
                  disabled={isGCalSyncing}
                >
                  Disconnect
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className={styles.gcalConnectBtn}
              onClick={onConnectGCal}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M19 4H5C3.89543 4 3 4.89543 3 6V20C3 21.1046 3.89543 22 5 22H19C20.1046 22 21 21.1046 21 20V6C21 4.89543 20.1046 4 19 4Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M16 2V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M8 2V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M3 10H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Connect Google Calendar
            </button>
          )}

          {gcalError && (
            <p className={styles.formError} role="alert">
              {gcalError?.message}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
