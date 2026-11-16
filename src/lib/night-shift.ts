export const SHIFT_START_MINUTE = 17 * 60 + 30;
export const SHIFT_END_MINUTE = 3 * 60 + 30;
export const SHIFT_DURATION_MINUTES = 10 * 60;
export const SHIFT_HANDOVER_END_MINUTE = 5 * 60 + 30; // handover prompt stays up for 2 hours after the shift ends

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
  // 03:30 up to the handover cutoff is post-shift; after that, count down to tonight's start.
  return shiftMinute < SHIFT_HANDOVER_END_MINUTE ? "after" : "before";
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

let clockFormat = { hour12: true, seconds: false };
export function setClockFormat(format: { hour12: boolean; seconds: boolean }): void {
  clockFormat = format;
}

export function formatClock(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    ...(clockFormat.seconds ? { second: "2-digit" as const } : {}),
    hour12: clockFormat.hour12,
    hourCycle: clockFormat.hour12 ? "h12" : "h23",
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

function offsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" }).formatToParts(date);
  const v = Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]));
  return Math.round((Date.UTC(v["year"]!, v["month"]! - 1, v["day"]!, v["hour"]!, v["minute"]!) - date.getTime()) / 60_000);
}

/** Hours IST is ahead of the client zone (10.5 in US winter, 9.5 in US summer for New York). */
export function istGapHours(date: Date, clientZone: string): number {
  return (offsetMinutes(date, "Asia/Kolkata") - offsetMinutes(date, clientZone)) / 60;
}

/** Looks ahead for the next change in the IST-to-client gap so it can be flagged in advance. */
export function nextGapChange(date: Date, clientZone: string, lookAheadDays = 21): { inDays: number; from: number; to: number } | null {
  const from = istGapHours(date, clientZone);
  for (let day = 1; day <= lookAheadDays; day += 1) {
    const to = istGapHours(new Date(date.getTime() + day * 86_400_000), clientZone);
    if (to !== from) return { inDays: day, from, to };
  }
  return null;
}
