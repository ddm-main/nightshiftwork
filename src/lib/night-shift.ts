export const SHIFT_START_MINUTE = 17 * 60 + 30;
export const SHIFT_END_MINUTE = 3 * 60 + 30;
export const SHIFT_DURATION_MINUTES = 10 * 60;

export type ShiftState = "before" | "active" | "after";

export function getShiftState(date: Date): ShiftState {
  const minute = date.getHours() * 60 + date.getMinutes();
  if (minute >= SHIFT_START_MINUTE || minute < SHIFT_END_MINUTE) return "active";
  return minute < SHIFT_START_MINUTE ? "before" : "after";
}

export function getShiftStart(date: Date): Date {
  const start = new Date(date);
  const minute = date.getHours() * 60 + date.getMinutes();
  if (minute < SHIFT_END_MINUTE) start.setDate(start.getDate() - 1);
  start.setHours(17, 30, 0, 0);
  return start;
}

export function getShiftEnd(date: Date): Date {
  const end = getShiftStart(date);
  end.setDate(end.getDate() + 1);
  end.setHours(3, 30, 0, 0);
  return end;
}

export function getShiftProgress(date: Date): number {
  if (getShiftState(date) !== "active") return 0;
  const elapsed = (date.getTime() - getShiftStart(date).getTime()) / 60_000;
  return Math.max(0, Math.min(100, (elapsed / SHIFT_DURATION_MINUTES) * 100));
}

export function formatClock(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function formatDateLabel(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function getShiftDateKey(date: Date): string {
  const start = getShiftStart(date);
  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
}

export function getNextShiftDate(date: Date): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  while (next.getDay() === 0 || next.getDay() === 6) next.setDate(next.getDate() + 1);
  return next;
}
