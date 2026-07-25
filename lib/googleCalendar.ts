import type { ScheduledTask } from "./types";

export interface GCalEventResource {
  id?: string;
  summary: string;
  description: string;
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
}

/**
 * Builds ISO datetime string for a given date at specified hour and minute in local time.
 */
function toLocalISOString(date: Date, hours: number, minutes = 0): string {
  const d = new Date(date);
  d.setHours(hours, minutes, 0, 0);

  const pad = (num: number) => String(num).padStart(2, "0");
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const ss = pad(d.getSeconds());

  const offsetMinutes = -d.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absOffset = Math.abs(offsetMinutes);
  const offsetHours = pad(Math.floor(absOffset / 60));
  const offsetMins = pad(absOffset % 60);

  return `${year}-${month}-${day}T${hh}:${mm}:${ss}${sign}${offsetHours}:${offsetMins}`;
}

function getUserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/**
 * Constructs the Google Calendar Event resource JSON payload for a ScheduledTask.
 * Start time: 09:00 on startDate.
 * End time: 09:00 + task duration on startDate (or endDate if multi-day).
 */
export function buildGCalEventResource(
  task: ScheduledTask,
  hoursPerDay: number,
): GCalEventResource {
  const timeZone = getUserTimeZone();
  const startISO = toLocalISOString(task.startDate, 9, 0);

  // Calculate end time
  const startHour = 9;
  const finishHour = startHour + Math.min(task.hours, hoursPerDay);
  const endHours = Math.floor(finishHour);
  const endMins = Math.round((finishHour - endHours) * 60);

  const targetDate = task.durationDays > 1 ? task.endDate : task.startDate;
  const endISO = toLocalISOString(targetDate, endHours, endMins);

  const formattedHours = Number.isInteger(task.hours)
    ? `${task.hours}h`
    : `${task.hours}h`;

  return {
    summary: task.name,
    description: `Task: ${task.name}\nEstimated Time: ${formattedHours}\nPlanned via ECL Task Manager`,
    start: {
      dateTime: startISO,
      timeZone,
    },
    end: {
      dateTime: endISO,
      timeZone,
    },
  };
}

const GCAL_API_BASE = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

/**
 * Creates a new Google Calendar event for a task.
 */
export async function createCalendarEvent(
  accessToken: string,
  task: ScheduledTask,
  hoursPerDay: number,
): Promise<string> {
  const payload = buildGCalEventResource(task, hoursPerDay);

  const response = await fetch(GCAL_API_BASE, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Google Calendar API error (${response.status}): ${errorText}`,
    );
  }

  const data = (await response.json()) as { id: string };
  return data.id;
}

/**
 * Updates an existing Google Calendar event for a task.
 */
export async function updateCalendarEvent(
  accessToken: string,
  eventId: string,
  task: ScheduledTask,
  hoursPerDay: number,
): Promise<void> {
  const payload = buildGCalEventResource(task, hoursPerDay);

  const response = await fetch(`${GCAL_API_BASE}/${encodeURIComponent(eventId)}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Google Calendar API error (${response.status}): ${errorText}`,
    );
  }
}

/**
 * Deletes a Google Calendar event.
 */
export async function deleteCalendarEvent(
  accessToken: string,
  eventId: string,
): Promise<void> {
  const response = await fetch(`${GCAL_API_BASE}/${encodeURIComponent(eventId)}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  // 404/410 means already deleted, which is fine
  if (!response.ok && response.status !== 404 && response.status !== 410) {
    const errorText = await response.text();
    throw new Error(
      `Google Calendar API error (${response.status}): ${errorText}`,
    );
  }
}
