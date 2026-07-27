import { describe, expect, it } from "vitest";

import {
  addWorkingDays,
  buildSchedule,
  ceilDays,
  isWorkingDay,
  nextWorkingDay,
} from "./schedule";
import type { Task } from "./types";

function localDate(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
): Date {
  return new Date(year, month - 1, day, hour, minute);
}

function task(
  id: string,
  order: number,
  hours: number,
  status: Task["status"] = "pending",
): Task {
  return {
    id,
    name: `Task ${id}`,
    hours,
    status,
    order,
    createdAt: null,
    updatedAt: null,
    trackedSeconds: 0,
    timerStartedAt: null,
    gcalEventId: null,
  };
}

describe("ceilDays", () => {
  it.each([
    [0.25, 8, 1],
    [8, 8, 1],
    [8.01, 8, 2],
    [17, 8, 3],
  ])(
    "converts %s hours at %s hours/day to %s working day(s)",
    (hours, hoursPerDay, expected) => {
      expect(ceilDays(hours, hoursPerDay)).toBe(expected);
    },
  );

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid hoursPerDay %s",
    (hoursPerDay) => {
      expect(() => ceilDays(1, hoursPerDay)).toThrow(RangeError);
    },
  );

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid task hours %s",
    (hours) => {
      expect(() => ceilDays(hours, 8)).toThrow(RangeError);
    },
  );

  it("rejects a duration too large to schedule safely", () => {
    expect(() => ceilDays(Number.MAX_VALUE, Number.MIN_VALUE)).toThrow(
      RangeError,
    );
  });
});

describe("working-day helpers", () => {
  it("identifies weekdays and weekends", () => {
    expect(isWorkingDay(localDate(2026, 7, 24))).toBe(true);
    expect(isWorkingDay(localDate(2026, 7, 25))).toBe(false);
    expect(isWorkingDay(localDate(2026, 7, 26))).toBe(false);
  });

  it.each([
    [localDate(2026, 7, 23), localDate(2026, 7, 24)],
    [localDate(2026, 7, 24), localDate(2026, 7, 27)],
    [localDate(2026, 7, 25), localDate(2026, 7, 27)],
    [localDate(2026, 7, 26), localDate(2026, 7, 27)],
  ])("finds the next working day", (date, expected) => {
    expect(nextWorkingDay(date)).toEqual(expected);
  });

  it("adds working days across a weekend and a year boundary", () => {
    expect(addWorkingDays(localDate(2023, 12, 29), 1)).toEqual(
      localDate(2024, 1, 1),
    );
    expect(addWorkingDays(localDate(2023, 12, 29), 3)).toEqual(
      localDate(2024, 1, 3),
    );
  });

  it("normalizes returned dates to local midnight without mutating the input", () => {
    const input = localDate(2026, 7, 24, 16, 45);
    const result = addWorkingDays(input, 0);

    expect(result).toEqual(localDate(2026, 7, 24));
    expect(input).toEqual(localDate(2026, 7, 24, 16, 45));
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects an invalid working-day count %s",
    (numberOfDays) => {
      expect(() =>
        addWorkingDays(localDate(2026, 7, 24), numberOfDays),
      ).toThrow(RangeError);
    },
  );

  it("rejects invalid dates", () => {
    const invalid = new Date(Number.NaN);

    expect(() => isWorkingDay(invalid)).toThrow(RangeError);
    expect(() => nextWorkingDay(invalid)).toThrow(RangeError);
    expect(() => addWorkingDays(invalid, 1)).toThrow(RangeError);
  });
});

describe("buildSchedule", () => {
  it("packs small tasks into the same day when they fit within hoursPerDay", () => {
    // 2h + 3h = 5h total → both fit in 8h/day → both on Jul 27
    const tasks = [
      task("mofa", 10, 2),
      task("chan", 20, 3),
    ];

    const result = buildSchedule(tasks, 8, localDate(2026, 7, 27));

    expect(result.map(({ id }) => id)).toEqual(["mofa", "chan"]);
    expect(result).toMatchObject([
      { id: "mofa", durationDays: 1, startDate: localDate(2026, 7, 27), endDate: localDate(2026, 7, 27) },
      { id: "chan", durationDays: 1, startDate: localDate(2026, 7, 27), endDate: localDate(2026, 7, 27) },
    ]);
  });

  it("fills a day exactly and starts next task on a new day", () => {
    // 5h + 3h = 8h exactly fills the day → task B starts next day
    const tasks = [
      task("a", 10, 5),
      task("b", 20, 3),
      task("c", 30, 1),
    ];

    const result = buildSchedule(tasks, 8, localDate(2026, 7, 27));

    expect(result).toMatchObject([
      { id: "a", startDate: localDate(2026, 7, 27), endDate: localDate(2026, 7, 27) },
      { id: "b", startDate: localDate(2026, 7, 27), endDate: localDate(2026, 7, 27) },
      // a+b = 8h → day full; c starts Jul 28
      { id: "c", startDate: localDate(2026, 7, 28), endDate: localDate(2026, 7, 28) },
    ]);
  });

  it("overflows large tasks across multiple working days", () => {
    // 9h task at 8h/day → spans Jul 24 (8h) into Jul 27 (1h)
    const tasks = [
      task("big", 10, 9),
      task("small", 20, 1),
    ];

    const result = buildSchedule(tasks, 8, localDate(2026, 7, 24));

    expect(result).toMatchObject([
      { id: "big", durationDays: 2, startDate: localDate(2026, 7, 24), endDate: localDate(2026, 7, 27) },
      // Jul 27 still has 7h left → small fits on Jul 27
      { id: "small", durationDays: 1, startDate: localDate(2026, 7, 27), endDate: localDate(2026, 7, 27) },
    ]);
  });

  it("sorts pending tasks, filters done tasks, and schedules using bin-packing", () => {
    const tasks = [
      task("third", 30, 1),
      task("done", 5, 8, "done"),
      task("first", 10, 9),
      task("second", 20, 8),
    ];

    // first=9h → Jul 24 (8h used) + Jul 27 (1h used, 7h left)
    // second=8h → Jul 27 has 7h left, second needs 8h → 7h today + 1h Jul 28
    // third=1h → Jul 28 has 7h left → fits Jul 28
    const result = buildSchedule(tasks, 8, localDate(2026, 7, 24, 15, 30));

    expect(result.map(({ id }) => id)).toEqual(["first", "second", "third"]);
    expect(result).toMatchObject([
      {
        id: "first",
        durationDays: 2,
        startDate: localDate(2026, 7, 24),
        endDate: localDate(2026, 7, 27),
      },
      {
        id: "second",
        durationDays: 2,
        startDate: localDate(2026, 7, 27),
        endDate: localDate(2026, 7, 28),
      },
      {
        id: "third",
        durationDays: 1,
        startDate: localDate(2026, 7, 28),
        endDate: localDate(2026, 7, 28),
      },
    ]);
  });

  it("moves a weekend start date to Monday", () => {
    const result = buildSchedule(
      [task("weekend", 1, 8)],
      8,
      localDate(2026, 7, 25, 14),
    );

    expect(result[0].startDate).toEqual(localDate(2026, 7, 27));
    expect(result[0].endDate).toEqual(localDate(2026, 7, 27));
  });

  it("keeps input order when task order values are equal", () => {
    const result = buildSchedule(
      [task("a", 1, 1), task("b", 1, 1)],
      8,
      localDate(2026, 7, 27),
    );

    expect(result.map(({ id }) => id)).toEqual(["a", "b"]);
  });

  it("does not mutate the task list or the supplied start date", () => {
    const tasks = [task("later", 2, 1), task("earlier", 1, 1)];
    const originalTaskOrder = tasks.map(({ id }) => id);
    const startDate = localDate(2026, 7, 24, 18, 15);

    buildSchedule(tasks, 8, startDate);

    expect(tasks.map(({ id }) => id)).toEqual(originalTaskOrder);
    expect(startDate).toEqual(localDate(2026, 7, 24, 18, 15));
  });

  it.each([0, -8, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid hoursPerDay %s",
    (hoursPerDay) => {
      expect(() =>
        buildSchedule([], hoursPerDay, localDate(2026, 7, 24)),
      ).toThrow(RangeError);
    },
  );

  it("rejects invalid pending-task estimates", () => {
    expect(() =>
      buildSchedule([task("invalid", 1, 0)], 8, localDate(2026, 7, 24)),
    ).toThrow(RangeError);
  });

  describe("dailyHours map", () => {
    it("single-day task: records correct hours on its one day", () => {
      // Task A = 3 hrs, starts Jul 27 (Monday)
      const result = buildSchedule([task("a", 1, 3)], 8, localDate(2026, 7, 27));
      expect(result[0].dailyHours).toEqual({ "2026-07-27": 3 });
    });

    it("bin-packed day: two tasks sharing the same day get correct slices", () => {
      // Task A = 3 hrs, Task B = 6 hrs, pace = 8 hrs/day, start Jul 27
      // Day 1 (Jul 27): A takes 3 hrs, B takes 5 hrs (8 - 3 = 5 remaining)
      // Day 2 (Jul 28): B takes remaining 1 hr
      const result = buildSchedule(
        [task("a", 1, 3), task("b", 2, 6)],
        8,
        localDate(2026, 7, 27),
      );

      expect(result[0].dailyHours).toEqual({ "2026-07-27": 3 });
      expect(result[1].dailyHours).toEqual({
        "2026-07-27": 5,
        "2026-07-28": 1,
      });
    });

    it("multi-day overflow task: full days get hoursPerDay, last day gets remainder", () => {
      // Task = 9 hrs, pace = 8 hrs/day, start Jul 24 (Friday)
      // Day 1 (Jul 24): 8 hrs, Day 2 (Jul 27 Mon): 1 hr
      const result = buildSchedule([task("big", 1, 9)], 8, localDate(2026, 7, 24));

      expect(result[0].dailyHours).toEqual({
        "2026-07-24": 8,
        "2026-07-27": 1,
      });
    });

    it("full day exactly: task consuming exactly hoursPerDay shows one entry", () => {
      const result = buildSchedule([task("exact", 1, 8)], 8, localDate(2026, 7, 27));
      expect(result[0].dailyHours).toEqual({ "2026-07-27": 8 });
    });
  });
});
