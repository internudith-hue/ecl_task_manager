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
};

export interface UseSettingsResult {
  settings: UserSettings;
  hoursPerDay: number;
  loading: boolean;
  error: Error | null;
  updateHoursPerDay: (hoursPerDay: number) => Promise<void>;
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
        setSubscription({
          uid,
          settings: {
            hoursPerDay: validHoursPerDay(hoursPerDay)
              ? hoursPerDay
              : DEFAULT_HOURS_PER_DAY,
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

  const updateHoursPerDay = useCallback(
    async (hoursPerDay: number) => {
      if (!uid) {
        throw new Error("You must be signed in to update settings.");
      }
      if (!validHoursPerDay(hoursPerDay)) {
        throw new Error(
          `Hours per day must be between ${MIN_HOURS_PER_DAY} and ${MAX_HOURS_PER_DAY}.`,
        );
      }

      try {
        await setDoc(doc(db, "users", uid), { hoursPerDay }, { merge: true });
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
    loading: Boolean(uid) && !currentSubscription,
    error: currentSubscription?.error ?? null,
    updateHoursPerDay,
  };
}
