export type TaskStatus = "pending" | "done";

export interface Task {
  id: string;
  name: string;
  hours: number;
  status: TaskStatus;
  order: number;
  createdAt: Date | null;
  updatedAt: Date | null;
  trackedSeconds: number;       // total accumulated tracked seconds
  timerStartedAt: Date | null;  // null = stopped, Date = running since
}

export interface ScheduledTask extends Task {
  durationDays: number;
  startDate: Date;
  endDate: Date;
}

export interface UserSettings {
  hoursPerDay: number;
}
