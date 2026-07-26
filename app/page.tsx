"use client";

import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Check,
  LoaderCircle,
  LockKeyhole,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { CalendarView } from "@/components/CalendarView";
import { DashboardHeader } from "@/components/DashboardHeader";
import { HeadlineStats } from "@/components/HeadlineStats";
import { SettingsCard } from "@/components/SettingsCard";
import { TaskForm } from "@/components/TaskForm";
import { TaskList } from "@/components/TaskList";
import styles from "@/components/CalmDashboard.module.css";
import { useAuth } from "@/hooks/useAuth";
import { useGoogleCalendar } from "@/hooks/useGoogleCalendar";
import { useSettings } from "@/hooks/useSettings";
import { useTaskTimer } from "@/hooks/useTaskTimer";
import { useTasks } from "@/hooks/useTasks";
import { buildSchedule } from "@/lib/schedule";
import {
  addTask,
  deleteTask,
  moveTask,
  toggleTaskStatus,
  updateTask,
} from "@/lib/tasks";
import type { Task } from "@/lib/types";

const friendlyDate = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function DashboardLoading() {
  return (
    <div className={styles.panel} role="status" aria-live="polite">
      <LoaderCircle
        className={styles.spinner}
        size={18}
        aria-hidden="true"
      />
      <span>Loading your saved plan…</span>
    </div>
  );
}

function useToday() {
  const [today, setToday] = useState(() => new Date());

  useEffect(() => {
    const nextMidnight = new Date();
    nextMidnight.setHours(24, 0, 1, 0);
    const delay = Math.min(
      nextMidnight.getTime() - Date.now(),
      2_147_483_647,
    );
    const timer = window.setTimeout(() => setToday(new Date()), delay);

    return () => window.clearTimeout(timer);
  }, [today]);

  return today;
}


function DashboardContent() {
  const { user, signOut } = useAuth();
  const today = useToday();
  const {
    tasks,
    loading: tasksLoading,
    error: tasksError,
    addOptimisticTask,
  } = useTasks(user?.uid);
  const [addTaskError, setAddTaskError] = useState<string | null>(null);
  const {
    hoursPerDay,
    loading: settingsLoading,
    error: settingsError,
    updateHoursPerDay,
  } = useSettings(user?.uid);

  const { activeTaskId: activeTimerTaskId, elapsedMap, handleStart: handleStartTimer, handleStop: handleStopTimer } =
    useTaskTimer(user?.uid, tasks);

  const {
    isConnected: isGCalConnected,
    isSyncing: isGCalSyncing,
    lastSyncedAt: gcalLastSyncedAt,
    error: gcalError,
    connectCalendar: connectGCal,
    disconnectCalendar: disconnectGCal,
    syncAll: syncGCalAll,
  } = useGoogleCalendar(user?.uid);

  const schedule = useMemo(
    () =>
      buildSchedule(
        tasks.filter(
          (task) =>
            task.status === "done" ||
            (Number.isFinite(task.hours) && task.hours > 0),
        ),
        hoursPerDay,
        today,
      ),
    [hoursPerDay, tasks, today],
  );

  if (!user) return null;

  async function handleMove(taskId: string, direction: "up" | "down") {
    if (!user) return;

    const pending = tasks
      .filter((task) => task.status === "pending")
      .sort((first, second) => first.order - second.order);
    await moveTask(user.uid, pending, taskId, direction);
  }

  const loading = tasksLoading || settingsLoading;
  const nextTask = schedule[0] ?? null;
  const queueEnd = schedule.at(-1)?.endDate ?? null;
  const pendingCount = schedule.length;

  return (
    <div className={styles.dashboard}>
      <DashboardHeader
        displayName={user.displayName}
        photoURL={user.photoURL}
        onSignOut={signOut}
      />

      <main className={styles.main}>
        <section className={styles.pageIntro} aria-labelledby="page-title">
          <div>
            <span className={styles.eyebrow}>{friendlyDate.format(today)}</span>
            <h1 id="page-title">Your delivery plan</h1>
            <p>
              {nextTask && queueEnd
                ? pendingCount === 1
                  ? `${nextTask.name} is next, planned through ${friendlyDate.format(queueEnd)}.`
                  : `${nextTask.name} is next. Your ${pendingCount} tasks are planned through ${friendlyDate.format(queueEnd)}.`
                : "Nothing is waiting. Add a task whenever you're ready."}
            </p>
          </div>
        </section>


        {tasksError ? (
          <div
            className={`${styles.actionError} ${styles.dataError}`}
            role="alert"
          >
            <AlertTriangle size={17} aria-hidden="true" />
            <span>
              {tasksError.message ||
                "Your saved plan could not be loaded. Check your connection and try again."}
            </span>
            <button
              className={styles.retryButton}
              type="button"
              onClick={() => window.location.reload()}
            >
              Try again
            </button>
          </div>
        ) : null}

        {!tasksError && settingsError ? (
          <div
            className={`${styles.actionError} ${styles.dataError}`}
            role="status"
          >
            <AlertTriangle size={17} aria-hidden="true" />
            <span>
              Your saved pace is unavailable, so the current value is being
              used for this plan.
            </span>
          </div>
        ) : null}

        {loading ? (
          <DashboardLoading />
        ) : tasksError ? null : (
          <>
            <HeadlineStats
              tasks={tasks}
              schedule={schedule}
              hoursPerDay={hoursPerDay}
            />

            {/* TASK LIST */}
            <div id="panel-list">
              <div className={styles.controlsGrid} aria-label="Queue controls">
                <TaskForm
                  addError={addTaskError}
                  onSubmit={(input) => {
                    setAddTaskError(null);
                    addOptimisticTask(
                      input,
                      async () => { await addTask(user.uid, input); },
                      (err) => setAddTaskError(err.message),
                    );
                  }}
                />
                <SettingsCard
                  hoursPerDay={hoursPerDay}
                  loading={settingsLoading}
                  onSave={updateHoursPerDay}
                  isGCalConnected={isGCalConnected}
                  isGCalSyncing={isGCalSyncing}
                  gcalLastSyncedAt={gcalLastSyncedAt}
                  gcalError={gcalError}
                  onConnectGCal={connectGCal}
                  onDisconnectGCal={disconnectGCal}
                  onSyncGCal={() => syncGCalAll(schedule, hoursPerDay)}
                />
              </div>

              <TaskList
                tasks={tasks}
                schedule={schedule}
                onToggle={(task) =>
                  toggleTaskStatus(user.uid, task.id, task.status)
                }
                onDelete={(task) => deleteTask(user.uid, task.id)}
                onMove={handleMove}
                onEdit={(_task: Task, input) =>
                  updateTask(user.uid, _task.id, input)
                }
                onStartTimer={handleStartTimer}
                onStopTimer={handleStopTimer}
                elapsedMap={elapsedMap}
                activeTimerTaskId={activeTimerTaskId}
              />
            </div>

            {/* CALENDAR — always visible below the task list */}
            <CalendarView schedule={schedule} today={today} />
          </>
        )}
      </main>
    </div>
  );
}

function SignInView() {
  const { error, signInWithGoogle } = useAuth();
  const [signingIn, setSigningIn] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleSignIn() {
    setSigningIn(true);
    setLocalError(null);

    try {
      await signInWithGoogle();
    } catch (signInError) {
      setLocalError(
        signInError instanceof Error
          ? signInError.message
          : "Sign-in failed. Please try again.",
      );
      setSigningIn(false);
    }
  }

  return (
    <main className={styles.signInPage}>
      <section className={styles.signInPanel} aria-labelledby="sign-in-title">
        <div className={styles.signInBrand}>
          <span aria-hidden="true">
            <CalendarClock size={21} />
          </span>
          <strong>Capacity</strong>
        </div>

        <span className={styles.eyebrow}>A calmer way to plan</span>
        <h1 id="sign-in-title">Know what’s next, without the rush.</h1>
        <p className={styles.signInIntro}>
          Give each task a realistic place in your week and see what fits at a
          glance—without turning your day into another dashboard to manage.
        </p>

        <ul className={styles.signInFacts}>
          <li>
            <Check size={15} aria-hidden="true" /> One clear place for your work
          </li>
          <li>
            <Check size={15} aria-hidden="true" /> Weekends protected automatically
          </li>
          <li>
            <Check size={15} aria-hidden="true" /> Stays signed in on this browser
          </li>
        </ul>

        <button
          className={styles.googleSignInButton}
          type="button"
          onClick={() => void handleSignIn()}
          disabled={signingIn}
        >
          {signingIn ? (
            <LoaderCircle
              className={styles.spinner}
              size={18}
              aria-hidden="true"
            />
          ) : (
            <span className={styles.googleMark} aria-hidden="true">
              G
            </span>
          )}
          <span>{signingIn ? "Connecting…" : "Continue with Google"}</span>
          {!signingIn ? <ArrowRight size={17} aria-hidden="true" /> : null}
        </button>

        {localError || error ? (
          <p className={styles.signInError} role="alert">
            {localError ?? error?.message}
          </p>
        ) : null}

        <p className={styles.signInNote}>
          <LockKeyhole size={13} aria-hidden="true" /> Your session stays saved
          in this browser until you sign out.
        </p>
      </section>
    </main>
  );
}

export default function HomePage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="route-status" role="status" aria-live="polite">
        <LoaderCircle
          className={styles.spinner}
          size={19}
          aria-hidden="true"
        />
        <span>Opening your workspace…</span>
      </div>
    );
  }

  return user ? <DashboardContent /> : <SignInView />;
}
