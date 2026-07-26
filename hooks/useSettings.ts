"use client";

import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { useCallback, useEffect, useState } from "react";

import { db } from "@/lib/firebase";
import type { UserSettings } from "@/lib/types";

export const DEFAULT_HOURS_PER_DAY = 8;
export const MIN_HOURS_PER_DAY = 0.25;
export const MAX_HOURS_PER_DAY = 24;

const DEFAULT_SETTINGS: UserSettings = {
  hoursPerDay: DEFAULT_HOURS_PER_DAY,
  internSupervisionHours: 0,
};

export interface UseSettingsResult {
  settings: UserSettings;
  hoursPerDay: number;
  internSupervisionHours: number;
  loading: boolean;
  error: Error | null;
  updatePaceSettings: (hoursPerDay: number, internSupervisionHours: number) => Promise<void>;
}

interface SettingsSubscriptionState {
  uid: string;
  settings: UserSettings;
  error: Error | null;
}

function validHoursPerDay(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= MIN_HOURS_PER_DAY &&
    value <= MAX_HOURS_PER_DAY
  );
}

function asError(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error("Unable to load settings.", { cause: error });
}

export function useSettings(uid?: string | null): UseSettingsResult {
  const [subscription, setSubscription] =
    useState<SettingsSubscriptionState | null>(null);

  useEffect(() => {
    if (!uid) {
      return;
    }

    return onSnapshot(
      doc(db, "users", uid),
      (snapshot) => {
        const hoursPerDay = snapshot.data()?.hoursPerDay;
        const internSupervisionHours = snapshot.data()?.internSupervisionHours;
        setSubscription({
          uid,
          settings: {
            hoursPerDay: validHoursPerDay(hoursPerDay)
              ? hoursPerDay
              : DEFAULT_HOURS_PER_DAY,
            internSupervisionHours: typeof internSupervisionHours === "number" && internSupervisionHours >= 0
              ? internSupervisionHours
              : 0,
          },
          error: null,
        });
      },
      (nextError) => {
        setSubscription({
          uid,
          settings: DEFAULT_SETTINGS,
          error: asError(nextError),
        });
      },
    );
  }, [uid]);

  const updatePaceSettings = useCallback(
    async (newHoursPerDay: number, newInternSupervisionHours: number) => {
      if (!uid) throw new Error("Must be logged in to save settings");

      if (!validHoursPerDay(newHoursPerDay)) {
        throw new Error(
          `Focus time must be between ${MIN_HOURS_PER_DAY} and ${MAX_HOURS_PER_DAY}`,
        );
      }

      if (typeof newInternSupervisionHours !== "number" || newInternSupervisionHours < 0) {
        throw new Error("Intern supervision hours must be a positive number.");
      }

      try {
        await setDoc(
          doc(db, "users", uid),
          { 
            hoursPerDay: newHoursPerDay,
            internSupervisionHours: newInternSupervisionHours,
          },
          { merge: true },
        );
      } catch (nextError) {
        throw asError(nextError);
      }
    },
    [uid],
  );

  const currentSubscription =
    uid && subscription?.uid === uid ? subscription : null;
  const settings = currentSubscription?.settings ?? DEFAULT_SETTINGS;

  return {
    settings,
    hoursPerDay: settings.hoursPerDay,
    internSupervisionHours: settings.internSupervisionHours,
    loading: Boolean(uid) && !currentSubscription,
    error: currentSubscription?.error ?? null,
    updatePaceSettings,
  };
}
