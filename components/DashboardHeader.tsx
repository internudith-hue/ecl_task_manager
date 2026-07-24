"use client";

/* eslint-disable @next/next/no-img-element */

import { CalendarClock, LoaderCircle, LogOut } from "lucide-react";
import { useState } from "react";

import styles from "./CalmDashboard.module.css";

interface DashboardHeaderProps {
  displayName?: string | null;
  photoURL?: string | null;
  onSignOut: () => Promise<void>;
}

function initialsFor(displayName?: string | null) {
  const parts = displayName?.trim().split(/\s+/).filter(Boolean) ?? [];

  if (parts.length === 0) return "TM";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return `${parts[0][0]}${parts.at(-1)?.[0] ?? ""}`.toUpperCase();
}

export function DashboardHeader({
  displayName,
  photoURL,
  onSignOut,
}: DashboardHeaderProps) {
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignOut() {
    setError(null);
    setSigningOut(true);

    try {
      await onSignOut();
    } catch {
      setError("Couldn’t sign out. Please try again.");
      setSigningOut(false);
    }
  }

  return (
    <header className={styles.dashboardHeader}>
      <div className={styles.headerInner}>
        <div className={styles.brand} aria-label="Task Capacity Tracker">
          <span className={styles.brandMark} aria-hidden="true">
            <CalendarClock size={21} strokeWidth={2.15} />
          </span>
          <span className={styles.brandCopy}>
            <strong>Capacity</strong>
            <span>Calm task planning</span>
          </span>
        </div>

        <div className={styles.accountArea}>
          <div className={styles.accountIdentity}>
            <span className={styles.avatar} aria-hidden="true">
              <span>{initialsFor(displayName)}</span>
              {photoURL ? (
                <img
                  src={photoURL}
                  alt=""
                  referrerPolicy="no-referrer"
                  onError={(event) => {
                    event.currentTarget.hidden = true;
                  }}
                />
              ) : null}
            </span>
            <span className={styles.accountName}>
              <strong>{displayName || "Signed-in user"}</strong>
              <span>Private workspace</span>
            </span>
          </div>
          <button
            className={styles.signOutButton}
            type="button"
            onClick={() => void handleSignOut()}
            disabled={signingOut}
          >
            {signingOut ? (
              <LoaderCircle
                className={styles.spinner}
                size={16}
                aria-hidden="true"
              />
            ) : (
              <LogOut size={16} aria-hidden="true" />
            )}
            <span>{signingOut ? "Signing out…" : "Sign out"}</span>
          </button>
        </div>
      </div>
      {error ? (
        <p className={styles.headerError} role="alert">
          {error}
        </p>
      ) : null}
    </header>
  );
}

export default DashboardHeader;
