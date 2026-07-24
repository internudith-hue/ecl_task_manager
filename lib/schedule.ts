import type { ScheduledTask, Task } from "./types";

function assertValidDate(date: Date): void {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new RangeError("date must be a valid Date");
  }
}

function normalizeDate(date: Date): Date {
  assertValidDate(date);

  const normalized = new Date(date.getTime());
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

function assertValidHoursPerDay(hoursPerDay: number): void {
  if (!Number.isFinite(hoursPerDay) || hoursPerDay <= 0) {
    throw new RangeError("hoursPerDay must be a finite number greater than 0");
  }
}

/**
 * Converts a positive task estimate into the number of working days it needs.
 */
export function ceilDays(hours: number, hoursPerDay: number): number {
  assertValidHoursPerDay(hoursPerDay);

  if (!Number.isFinite(hours) || hours <= 0) {
    throw new RangeError("hours must be a finite number greater than 0");
  }

  const durationDays = Math.ceil(hours / hoursPerDay);

  if (!Number.isSafeInteger(durationDays)) {
    throw new RangeError("task duration must be a finite safe integer");
  }

  return Math.max(1, durationDays);
}

export function isWorkingDay(date: Date): boolean {
  const day = normalizeDate(date).getDay();
  return day !== 0 && day !== 6;
}

/**
 * Returns the first Monday-to-Friday date strictly after the supplied date.
 */
export function nextWorkingDay(date: Date): Date {
  const result = normalizeDate(date);

  do {
    result.setDate(result.getDate() + 1);
  } while (!isWorkingDay(result));

  return result;
}

/**
 * Adds a non-negative number of Monday-to-Friday days to a date.
 */
export function addWorkingDays(date: Date, numberOfDays: number): Date {
  if (
    !Number.isFinite(numberOfDays) ||
    !Number.isInteger(numberOfDays) ||
    numberOfDays < 0
  ) {
    throw new RangeError("numberOfDays must be a non-negative integer");
  }

  let result = normalizeDate(date);

  for (let daysAdded = 0; daysAdded < numberOfDays; daysAdded += 1) {
    result = nextWorkingDay(result);
  }

  return result;
}

/**
 * Builds a contiguous weekday-only schedule without mutating the source tasks.
 */
export function buildSchedule(
  tasks: Task[],
  hoursPerDay: number,
  startDate: Date = new Date(),
): ScheduledTask[] {
  assertValidHoursPerDay(hoursPerDay);

  let cursor = normalizeDate(startDate);
  if (!isWorkingDay(cursor)) {
    cursor = nextWorkingDay(cursor);
  }

  const pendingTasks = tasks
    .map((task, index) => ({ task, index }))
    .filter(({ task }) => task.status === "pending")
    .sort(
      (left, right) =>
        left.task.order - right.task.order || left.index - right.index,
    );

  return pendingTasks.map(({ task }) => {
    const durationDays = ceilDays(task.hours, hoursPerDay);
    const scheduledStart = new Date(cursor.getTime());
    const scheduledEnd = addWorkingDays(scheduledStart, durationDays - 1);

    cursor = nextWorkingDay(scheduledEnd);

    return {
      ...task,
      durationDays,
      startDate: scheduledStart,
      endDate: scheduledEnd,
    };
  });
}
