"use client";

import { useMemo } from "react";

import type { ScheduledTask } from "@/lib/types";

import styles from "./CalendarView.module.css";

/* ─── Clay brand palette — assigned per task index ─────────────────── */
const TASK_COLORS = [
  { bg: "#ff4d8b", text: "#fff",     label: "pink"     }, // brand-pink
  { bg: "#1a3a3a", text: "#fff",     label: "teal"     }, // brand-teal
  { bg: "#b8a4ed", text: "#2d1f6e",  label: "lavender" }, // brand-lavender
  { bg: "#ffb084", text: "#6b3200",  label: "peach"    }, // brand-peach
  { bg: "#e8b94a", text: "#4a3200",  label: "ochre"    }, // brand-ochre
  { bg: "#a4d4c5", text: "#0d3b30",  label: "mint"     }, // brand-mint
  { bg: "#ff6b5a", text: "#fff",     label: "coral"    }, // brand-coral
];

function getTaskColor(index: number) {
  return TASK_COLORS[index % TASK_COLORS.length];
}

/* ─── Date helpers ──────────────────────────────────────────────────── */
function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function addMonths(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  return d;
}

/**
 * Build a 6-row × 7-column grid of dates for the month containing `base`.
 * The grid always starts on Sunday to match Google Calendar.
 */
function buildMonthGrid(base: Date): Date[] {
  const year = base.getFullYear();
  const month = base.getMonth();

  const firstOfMonth = new Date(year, month, 1);
  // Sunday = 0 in getDay()
  const startPad = firstOfMonth.getDay();

  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(gridStart.getDate() - startPad);

  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const cell = new Date(gridStart);
    cell.setDate(gridStart.getDate() + i);
    cells.push(cell);
  }
  return cells;
}

const DAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const MONTH_FORMATTER = new Intl.DateTimeFormat("en", {
  month: "long",
  year: "numeric",
});

/* ─── TaskChip ──────────────────────────────────────────────────────── */
interface TaskChipProps {
  name: string;
  color: (typeof TASK_COLORS)[number];
  isStart: boolean;
  isEnd: boolean;
}

function TaskChip({ name, color, isStart, isEnd }: TaskChipProps) {
  return (
    <div
      className={`${styles.taskChip} ${isStart ? styles.chipStart : styles.chipContinue} ${isEnd ? styles.chipEnd : ""}`}
      style={{ backgroundColor: color.bg, color: color.text }}
      title={name}
    >
      {isStart ? <span className={styles.chipLabel}>{name}</span> : null}
    </div>
  );
}

/* ─── DayCell ───────────────────────────────────────────────────────── */
interface TaskOnDay {
  task: ScheduledTask;
  colorIndex: number;
  isStart: boolean;
  isEnd: boolean;
}

interface DayCellProps {
  date: Date;
  today: Date;
  currentMonth: number;
  tasksOnDay: TaskOnDay[];
}

function DayCell({ date, today, currentMonth, tasksOnDay }: DayCellProps) {
  const isToday = isSameDay(date, today);
  const isCurrentMonth = date.getMonth() === currentMonth;
  const isWeekend = date.getDay() === 0 || date.getDay() === 6;

  return (
    <div
      className={`${styles.dayCell} ${!isCurrentMonth ? styles.dayCellOutside : ""} ${isWeekend ? styles.dayCellWeekend : ""}`}
    >
      <span
        className={`${styles.dayNumber} ${isToday ? styles.dayNumberToday : ""}`}
        aria-label={isToday ? "Today" : undefined}
      >
        {date.getDate()}
      </span>
      <div className={styles.chipList}>
        {tasksOnDay.map(({ task, colorIndex, isStart, isEnd }) => (
          <TaskChip
            key={task.id}
            name={task.name}
            color={getTaskColor(colorIndex)}
            isStart={isStart}
            isEnd={isEnd}
          />
        ))}
      </div>
    </div>
  );
}

/* ─── MonthGrid ─────────────────────────────────────────────────────── */
interface MonthGridProps {
  base: Date;
  today: Date;
  schedule: ScheduledTask[];
  colorMap: Map<string, number>;
}

function MonthGrid({ base, today, schedule, colorMap }: MonthGridProps) {
  const currentMonth = base.getMonth();
  const cells = useMemo(() => buildMonthGrid(base), [base]);

  return (
    <div className={styles.monthGrid}>
      {/* Month + year heading */}
      <h2 className={styles.monthTitle}>{MONTH_FORMATTER.format(base)}</h2>

      {/* Day-of-week headers */}
      <div className={styles.dayHeaders} aria-hidden="true">
        {DAY_HEADERS.map((d) => (
          <span key={d} className={styles.dayHeader}>
            {d}
          </span>
        ))}
      </div>

      {/* Day cells */}
      <div className={styles.cellGrid} role="grid" aria-label={MONTH_FORMATTER.format(base)}>
        {cells.map((date) => {
          const dayStart = startOfDay(date);

          const tasksOnDay: TaskOnDay[] = schedule
            .filter((t) => {
              const s = startOfDay(t.startDate);
              const e = startOfDay(t.endDate);
              return dayStart >= s && dayStart <= e;
            })
            .map((t) => ({
              task: t,
              colorIndex: colorMap.get(t.id) ?? 0,
              isStart: isSameDay(dayStart, t.startDate),
              isEnd: isSameDay(dayStart, t.endDate),
            }));

          return (
            <DayCell
              key={date.toISOString()}
              date={date}
              today={today}
              currentMonth={currentMonth}
              tasksOnDay={tasksOnDay}
            />
          );
        })}
      </div>
    </div>
  );
}

/* ─── CalendarView (exported) ───────────────────────────────────────── */
interface CalendarViewProps {
  schedule: ScheduledTask[];
  today: Date;
}

export function CalendarView({ schedule, today }: CalendarViewProps) {
  /* Assign a stable color index to each task by its position in the schedule */
  const colorMap = useMemo<Map<string, number>>(() => {
    const map = new Map<string, number>();
    schedule.forEach((task, i) => map.set(task.id, i));
    return map;
  }, [schedule]);

  const prevMonth = useMemo(() => addMonths(today, -1), [today]);
  const currMonth = useMemo(() => addMonths(today, 0), [today]);
  const nextMonth = useMemo(() => addMonths(today, 1), [today]);

  /* Build legend for tasks that appear in this 3-month window */
  const windowStart = useMemo(() => {
    const d = new Date(prevMonth.getFullYear(), prevMonth.getMonth(), 1);
    return d;
  }, [prevMonth]);
  const windowEnd = useMemo(() => {
    const d = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0);
    return d;
  }, [nextMonth]);

  const visibleTasks = useMemo(
    () =>
      schedule.filter(
        (t) =>
          startOfDay(t.endDate) >= windowStart &&
          startOfDay(t.startDate) <= windowEnd,
      ),
    [schedule, windowStart, windowEnd],
  );

  return (
    <section className={styles.calendarView} aria-label="3-month calendar">
      {/* 3 months side-by-side */}
      <div className={styles.monthsRow}>
        <MonthGrid
          base={prevMonth}
          today={today}
          schedule={schedule}
          colorMap={colorMap}
        />
        <MonthGrid
          base={currMonth}
          today={today}
          schedule={schedule}
          colorMap={colorMap}
        />
        <MonthGrid
          base={nextMonth}
          today={today}
          schedule={schedule}
          colorMap={colorMap}
        />
      </div>

      {/* Legend */}
      {visibleTasks.length > 0 && (
        <div className={styles.legend} aria-label="Task legend">
          {visibleTasks.map((task) => {
            const color = getTaskColor(colorMap.get(task.id) ?? 0);
            return (
              <div key={task.id} className={styles.legendItem}>
                <span
                  className={styles.legendDot}
                  style={{ backgroundColor: color.bg }}
                  aria-hidden="true"
                />
                <span className={styles.legendName}>{task.name}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {schedule.length === 0 && (
        <div className={styles.emptyCalendar}>
          <p>No tasks scheduled yet. Add tasks to see them appear on the calendar.</p>
        </div>
      )}
    </section>
  );
}
