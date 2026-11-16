import { getNextShiftDate, getShiftDateKey, getShiftDateKeyFromStart } from "@/lib/night-shift";
import type { PlanBucket } from "@/lib/tracker-types";

/** The shift date a task belongs to for a given planning bucket (null when it has no specific night yet). */
export function plannedDateFor(bucket: PlanBucket, now: Date): string | null {
  if (bucket === "tonight") return getShiftDateKey(now);
  if (bucket === "tomorrow") return getShiftDateKeyFromStart(getNextShiftDate(now));
  return null;
}
