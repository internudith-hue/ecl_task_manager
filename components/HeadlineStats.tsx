import {
  CalendarCheck2,
  Clock3,
  ListTodo,
} from "lucide-react";

import type { ScheduledTask, Task } from "@/lib/types";

import styles from "./CalmDashboard.module.css";

interface HeadlineStatsProps {
  tasks: Task[];
  schedule: ScheduledTask[];
  hoursPerDay: number;
}

const compactNumber = new Intl.NumberFormat("en", {
  maximumFractionDigits: 1,
});

const completionDate = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
});

export function HeadlineStats({
  tasks,
  schedule,
  hoursPerDay,
}: HeadlineStatsProps) {
  const queuedTasks = tasks.filter((task) => task.status === "pending");
  const completedTasks = tasks.length - queuedTasks.length;
  const queuedHours = queuedTasks.reduce((total, task) => total + task.hours, 0);
  const bookedDays = schedule.reduce(
    (total, task) => total + task.durationDays,
    0,
  );
  const queueEnd = schedule.at(-1)?.endDate ?? null;

  const stats = [
    {
      label: "Tasks ahead",
      value: compactNumber.format(queuedTasks.length),
      note:
        completedTasks > 0
          ? `${compactNumber.format(completedTasks)} completed`
          : "A clear starting point",
      icon: ListTodo,
      isDate: false,
    },
    {
      label: "Planned time",
      value: `${compactNumber.format(queuedHours)}h`,
      note: `${compactNumber.format(bookedDays)} ${bookedDays === 1 ? "workday" : "workdays"} at your pace`,
      icon: Clock3,
      isDate: false,
    },
    {
      label: "Planned through",
      value: queueEnd ? completionDate.format(queueEnd) : "Now",
      note: `${compactNumber.format(hoursPerDay)} focused hours per weekday`,
      icon: CalendarCheck2,
      isDate: Boolean(queueEnd),
    },
  ] as const;

  return (
    <section className={styles.statsSection} aria-labelledby="workload-summary">
      <h2 id="workload-summary" className={styles.srOnly}>
        Workload summary
      </h2>
      <div className={styles.statsGrid}>
        {stats.map((stat) => {
          const Icon = stat.icon;

          return (
            <article
              className={styles.statCard}
              key={stat.label}
            >
              <div className={styles.statCardTop}>
                <span className={styles.statLabel}>{stat.label}</span>
                <span className={styles.statIcon} aria-hidden="true">
                  <Icon size={18} strokeWidth={2} />
                </span>
              </div>
              <strong
                className={`${styles.statValue} ${
                  stat.isDate ? styles.statValueDate : ""
                }`}
              >
                {stat.value}
              </strong>
              <span className={styles.statNote}>{stat.note}</span>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default HeadlineStats;
