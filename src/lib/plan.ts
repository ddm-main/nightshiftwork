import { getNextShiftDate, getShiftDateKey, getShiftDateKeyFromStart } from "@/lib/night-shift";
import type { PlanBucket, Task } from "@/lib/tracker-types";

/** The shift date a task belongs to for a given planning bucket (null when it has no specific night yet). */
export function plannedDateFor(bucket: PlanBucket, now: Date): string | null {
  if (bucket === "tonight") return getShiftDateKey(now);
  if (bucket === "tomorrow") return getShiftDateKeyFromStart(getNextShiftDate(now));
  return null;
}

/**
 * Open tasks whose night has arrived: "Tomorrow" tasks planned for today's shift (or earlier), and unfinished
 * "Tonight" tasks from a past shift (those are carried over and flagged as rolled over).
 */
export function tasksDueTonight(tasks: Task[], shiftKey: string): Task[] {
  return tasks.filter((task) => task.status !== "done" && task.planned_date
    && ((task.planning_bucket === "tomorrow" && task.planned_date <= shiftKey) || (task.planning_bucket === "tonight" && task.planned_date < shiftKey)));
}
