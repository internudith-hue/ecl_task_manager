# Add Weekly and Daily Calendar Views

This plan details the addition of **Weekly** and **Daily** calendar views, inspired by Google Calendar's time grid. 

To achieve a true time-grid view, we must also fix an underlying architectural limitation in how tasks are scheduled, which currently causes tasks to overlap in the Google Calendar sync.

## Architectural Change to Scheduling
Currently, the scheduler groups tasks into days, but doesn't assign specific *times* of day (e.g., 9:00 AM to 11:00 AM). Because of this, if you have two short tasks (e.g., 2h and 3h) on the same day, they both default to starting at 9:00 AM, causing them to overlap if synced to Google Calendar.

**To render a Google Calendar-style Weekly/Daily view, we need exact times.** I propose updating the scheduling algorithm to break tasks into specific **Time Slots** (e.g., assuming a 9:00 AM start for the workday). 
- A 2h task will get `[9:00 AM - 11:00 AM]`.
- The next 3h task will get `[11:00 AM - 2:00 PM]`.
- A 10h task (at 8h/day) will be split into two slots: `Day 1 [9:00 AM - 5:00 PM]` and `Day 2 [9:00 AM - 11:00 AM]`.

## Open Questions
1. **Workday Start Time:** I plan to hardcode the workday start time to **9:00 AM**. Is this acceptable, or should we add a setting for the user to define their preferred start time? (For now, I recommend hardcoding to 9:00 AM to keep it simple, as it can be easily made configurable later).
2. **Google Calendar Sync Update:** Since a 10-hour task will now be split across two days (8 hours on Day 1, 2 hours on Day 2), should I update the Google Calendar sync to create **two separate events** in GCal for this single task? (This prevents the event from spanning continuously through the night).

## Proposed Changes

### 1. `lib/types.ts`
- Update `ScheduledTask` to include a `timeSlots` array: `{ date: Date; startHour: number; endHour: number }[]`.

### 2. `lib/schedule.ts`
- Update `buildSchedule` to calculate and assign `startHour` and `endHour` for every chunk of a task.
- It will track the current `hourCursor` (starting at 9.0) and increment it as tasks consume hours.

### 3. `components/CalendarView.tsx` & `components/CalendarView.module.css`
- **Add View Selector:** Add a toggle group at the top right of the calendar to switch between "Month", "Week", and "Day".
- **Monthly View:** Keep the existing 3-month grid.
- **Weekly View:** Implement a time grid (X-axis: 7 days, Y-axis: hours). Plot tasks using CSS absolute positioning based on their `timeSlots`.
- **Daily View:** Implement a 1-day time grid.
- Apply Clay design aesthetics (cream canvas, rounded cards, hover micro-animations).

### 4. `lib/googleCalendar.ts` (Bonus/Fix)
- Update the sync logic to use the new `timeSlots`. 
- Instead of creating one giant event that spans the night, it will create exact time-bound events for each slot.
