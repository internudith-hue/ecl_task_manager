"use client";

import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { useCallback, useEffect, useState } from "react";

import { auth } from "@/lib/firebase";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  updateCalendarEvent,
} from "@/lib/googleCalendar";
import { saveGcalEventId } from "@/lib/tasks";
import type { ScheduledTask } from "@/lib/types";

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const STORAGE_KEY_TOKEN = "ecl_gcal_access_token";

export interface UseGoogleCalendarResult {
  isConnected: boolean;
  isSyncing: boolean;
  lastSyncedAt: Date | null;
  error: Error | null;
  connectCalendar: () => Promise<void>;
  disconnectCalendar: () => void;
  syncAll: (schedule: ScheduledTask[], hoursPerDay: number) => Promise<void>;
}

export function useGoogleCalendar(uid: string | undefined | null): UseGoogleCalendarResult {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [error, setError] = useState<Error | null>(null);

  // Restore access token from sessionStorage if present
  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedToken = sessionStorage.getItem(STORAGE_KEY_TOKEN);
    if (storedToken) {
      setAccessToken(storedToken);
    }
  }, []);

  const connectCalendar = useCallback(async () => {
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope(CALENDAR_SCOPE);
      provider.setCustomParameters({ prompt: "select_account" });

      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken;

      if (!token) {
        throw new Error("Failed to obtain Google Calendar access token.");
      }

      setAccessToken(token);
      if (typeof window !== "undefined") {
        sessionStorage.setItem(STORAGE_KEY_TOKEN, token);
      }
    } catch (err) {
      const normErr = err instanceof Error ? err : new Error("Calendar authentication failed.");
      setError(normErr);
      throw normErr;
    }
  }, []);

  const disconnectCalendar = useCallback(() => {
    setAccessToken(null);
    setLastSyncedAt(null);
    setError(null);
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(STORAGE_KEY_TOKEN);
    }
  }, []);

  const syncAll = useCallback(
    async (schedule: ScheduledTask[], hoursPerDay: number) => {
      if (!accessToken || !uid) {
        throw new Error("Google Calendar is not connected.");
      }

      setIsSyncing(true);
      setError(null);

      try {
        for (const task of schedule) {
          if (task.gcalEventId) {
            // Update existing event
            try {
              await updateCalendarEvent(accessToken, task.gcalEventId, task, hoursPerDay);
            } catch (err) {
              // If event was deleted from Google Calendar, recreate it
              const eventId = await createCalendarEvent(accessToken, task, hoursPerDay);
              await saveGcalEventId(uid, task.id, eventId);
            }
          } else {
            // Create new event
            const eventId = await createCalendarEvent(accessToken, task, hoursPerDay);
            await saveGcalEventId(uid, task.id, eventId);
          }
        }

        setLastSyncedAt(new Date());
      } catch (err) {
        const normErr = err instanceof Error ? err : new Error("Calendar sync failed.");
        setError(normErr);
        // If 401 unauthenticated, clear token
        if (normErr.message.includes("401")) {
          disconnectCalendar();
        }
        throw normErr;
      } finally {
        setIsSyncing(false);
      }
    },
    [accessToken, uid, disconnectCalendar],
  );

  return {
    isConnected: Boolean(accessToken),
    isSyncing,
    lastSyncedAt,
    error,
    connectCalendar,
    disconnectCalendar,
    syncAll,
  };
}
