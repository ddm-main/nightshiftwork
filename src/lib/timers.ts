import { getShiftEnd } from "@/lib/night-shift";
import type { Task } from "@/lib/tracker-types";

/** Seconds a running task has earned since it was started, never counting past the end of the shift it started in. */
export function runningSeconds(task: Pick<Task, "status" | "started_at">, now: Date): number {
  if (task.status !== "in_progress" || !task.started_at) return 0;
  const start = new Date(task.started_at);
  const cap = Math.min(now.getTime(), getShiftEnd(start).getTime());
  return Math.max(0, Math.floor((cap - start.getTime()) / 1000));
}

export function totalSeconds(task: Pick<Task, "status" | "started_at" | "elapsed_seconds">, now: Date): number {
  return task.elapsed_seconds + runningSeconds(task, now);
}
