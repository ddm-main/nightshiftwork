export const SHIFT_START_MINUTE = 17 * 60 + 30;
export const SHIFT_END_MINUTE = 3 * 60 + 30;
export const SHIFT_DURATION_MINUTES = 10 * 60;

export type ShiftState = "before" | "active" | "after";

type IndiaTimeParts = { year: number; month: number; day: number; hour: number; minute: number };

function getIndiaTimeParts(date: Date): IndiaTimeParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]));
  return {
    year: values.year ?? 1970,
    month: values.month ?? 1,
    day: values.day ?? 1,
    hour: values.hour ?? 0,
    minute: values.minute ?? 0,
  };
}

function fromIndiaTime(parts: IndiaTimeParts): Date {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - 330 * 60_000);
}

export function getShiftState(date: Date): ShiftState {
  const { hour, minute } = getIndiaTimeParts(date);
  const shiftMinute = hour * 60 + minute;
  if (shiftMinute >= SHIFT_START_MINUTE || shiftMinute < SHIFT_END_MINUTE) return "active";
  return shiftMinute < SHIFT_START_MINUTE ? "before" : "after";
}

export function getShiftStart(date: Date): Date {
  const parts = getIndiaTimeParts(date);
  const dayOffset = parts.hour * 60 + parts.minute < SHIFT_END_MINUTE ? -1 : 0;
  const anchor = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + dayOffset));
  return fromIndiaTime({
    year: anchor.getUTCFullYear(),
    month: anchor.getUTCMonth() + 1,
    day: anchor.getUTCDate(),
    hour: 17,
    minute: 30,
  });
}

export function getShiftEnd(date: Date): Date {
  return new Date(getShiftStart(date).getTime() + SHIFT_DURATION_MINUTES * 60_000);
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
  const { year, month, day } = getIndiaTimeParts(getShiftStart(date));
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function getNextShiftDate(date: Date): Date {
  const parts = getIndiaTimeParts(date);
  const next = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1));
  while (next.getUTCDay() === 0 || next.getUTCDay() === 6) next.setUTCDate(next.getUTCDate() + 1);
  return fromIndiaTime({
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
    hour: 17,
    minute: 30,
  });
}

export function getShiftDateKeyFromStart(start: Date): string {
  const parts = getIndiaTimeParts(start);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function getShiftDateKeyFromCivilDate(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function istDateTimeInputToIso(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("Enter a valid date and time.");
  const [, year, month, day, hour, minute] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)) - 330 * 60_000).toISOString();
}

export function isoToIstDateTimeInput(value: string): string {
  const parts = getIndiaTimeParts(new Date(value));
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}T${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}
