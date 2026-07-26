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
 * Converts a positive task estimate into the number of working days it needs
 * when scheduled alone (i.e., no intra-day packing considered here).
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
 * Builds a contiguous weekday-only schedule with intra-day bin packing:
 * multiple short tasks are packed into the same day if they fit within
 * hoursPerDay, rather than each task always consuming its own full day.
 *
 * Algorithm:
 *   - cursor = current day, hoursUsedToday = 0
 *   - For each pending task (sorted by order):
 *       - remainingToday = hoursPerDay - hoursUsedToday
 *       - startDate = cursor
 *       - Walk hours through days:
 *           remaining task hours → fill remainingToday → advance day if needed
 *       - endDate = cursor (after consuming all hours)
 *       - durationDays = working days from startDate to endDate inclusive
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

  // Track how many hours of the current cursor-day have already been used
  // by previously scheduled tasks (bin-packing state).
  let hoursUsedToday = 0;

  const pendingTasks = tasks
    .map((task, index) => ({ task, index }))
    .filter(({ task }) => task.status === "pending")
    .sort(
      (left, right) =>
        left.task.order - right.task.order || left.index - right.index,
    );

  return pendingTasks.map(({ task }) => {
    // Validate hours
    if (!Number.isFinite(task.hours) || task.hours <= 0) {
      throw new RangeError("hours must be a finite number greater than 0");
    }

    const scheduledStart = new Date(cursor.getTime());
    let hoursLeft = task.hours;

    // Fill current day first, then overflow into subsequent working days
    while (hoursLeft > 0) {
      const remainingToday = hoursPerDay - hoursUsedToday;

      if (hoursLeft <= remainingToday) {
        // Task fits (entirely or partially) within today
        hoursUsedToday += hoursLeft;
        hoursLeft = 0;
      } else {
        // Today is fully consumed; spill into next working day
        hoursLeft -= remainingToday;
        cursor = nextWorkingDay(cursor);
        hoursUsedToday = 0;
      }
    }

    // cursor now points to the last day this task uses.
    // Record that as endDate before potentially advancing for the next task.
    const scheduledEnd = new Date(cursor.getTime());

    // If today is now exactly full, next task must start on a new working day.
    if (hoursUsedToday >= hoursPerDay) {
      cursor = nextWorkingDay(cursor);
      hoursUsedToday = 0;
    }

    // Count inclusive working days from start to end
    let durationDays = 1;
    let counter = normalizeDate(scheduledStart);
    while (counter.getTime() < scheduledEnd.getTime()) {
      counter = nextWorkingDay(counter);
      durationDays += 1;
    }

    return {
      ...task,
      durationDays,
      startDate: scheduledStart,
      endDate: scheduledEnd,
    };
  });
}
