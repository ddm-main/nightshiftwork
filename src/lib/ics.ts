export type IcsEvent = { uid: string; title: string; startsAt: string; endsAt: string | null; description: string; organizerEmail: string };
export type IcsWindow = { from: Date; to: Date };

// Windows time zone names (what Outlook writes in TZID) -> IANA names.
const WINDOWS_ZONES: Record<string, string> = {
  "Eastern Standard Time": "America/New_York", "Central Standard Time": "America/Chicago", "Mountain Standard Time": "America/Denver",
  "Pacific Standard Time": "America/Los_Angeles", "Atlantic Standard Time": "America/Halifax", "Alaskan Standard Time": "America/Anchorage",
  "India Standard Time": "Asia/Kolkata", "GMT Standard Time": "Europe/London", "W. Europe Standard Time": "Europe/Berlin",
  "Romance Standard Time": "Europe/Paris", "Central Europe Standard Time": "Europe/Budapest", "Central European Standard Time": "Europe/Warsaw",
  "E. Europe Standard Time": "Europe/Bucharest", "Singapore Standard Time": "Asia/Singapore", "Tokyo Standard Time": "Asia/Tokyo",
  "AUS Eastern Standard Time": "Australia/Sydney", "Arabian Standard Time": "Asia/Dubai", "China Standard Time": "Asia/Shanghai",
  "Greenwich Standard Time": "Atlantic/Reykjavik", "UTC": "UTC", "Canada Central Standard Time": "America/Regina", "SA Pacific Standard Time": "America/Bogota",
};

function zoneName(tzid: string | undefined): string {
  if (!tzid) return "Asia/Kolkata"; // floating times are read as the user's own IST
  const name = tzid.replace(/^"|"$/g, "");
  const mapped = WINDOWS_ZONES[name] ?? name;
  try { new Intl.DateTimeFormat("en-US", { timeZone: mapped }); return mapped; } catch { return "Asia/Kolkata"; }
}

function offsetMinutes(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" }).formatToParts(new Date(utcMs));
  const v = Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]));
  return (Date.UTC(v["year"]!, v["month"]! - 1, v["day"]!, v["hour"]!, v["minute"]!, v["second"]!) - utcMs) / 60_000;
}

/** Wall-clock time in a zone -> the real instant (handles daylight saving). */
export function zonedToUtc(y: number, m: number, d: number, h: number, mi: number, s: number, timeZone: string): Date {
  const guess = Date.UTC(y, m - 1, d, h, mi, s);
  const first = guess - offsetMinutes(guess, timeZone) * 60_000;
  return new Date(guess - offsetMinutes(first, timeZone) * 60_000);
}

type Local = { y: number; m: number; d: number; h: number; mi: number; s: number; zone: string; allDay: boolean };

function parseStamp(value: string, params: string): Local | null {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!match) return null;
  const [, y, mo, d, h, mi, s, z] = match;
  const allDay = h === undefined || /VALUE=DATE(?!-)/i.test(params);
  const tzid = params.match(/TZID=([^;:]+)/)?.[1];
  return { y: Number(y), m: Number(mo), d: Number(d), h: Number(h ?? 0), mi: Number(mi ?? 0), s: Number(s ?? 0), zone: z ? "UTC" : zoneName(tzid), allDay };
}

const toUtc = (l: Local) => zonedToUtc(l.y, l.m, l.d, l.h, l.mi, l.s, l.zone);
const unescape = (value: string) => value.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\;/g, ";").replace(/\\\\/g, "\\");
const unfold = (text: string) => text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");

type Raw = { uid: string; summary: string; description: string; start?: Local; end?: Local; rrule?: string; exdates: string[]; recurrenceId?: Local; organizer: string; cancelled: boolean };

function readEvents(text: string): Raw[] {
  const events: Raw[] = [];
  let cur: Raw | null = null;
  for (const line of unfold(text)) {
    if (line === "BEGIN:VEVENT") { cur = { uid: "", summary: "", description: "", exdates: [], organizer: "", cancelled: false }; continue; }
    if (line === "END:VEVENT") { if (cur) events.push(cur); cur = null; continue; }
    if (!cur) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const [name = "", ...rest] = line.slice(0, idx).split(";");
    const params = rest.join(";");
    const value = line.slice(idx + 1);
    if (name === "UID") cur.uid = value;
    else if (name === "SUMMARY") cur.summary = unescape(value);
    else if (name === "DESCRIPTION") cur.description = unescape(value);
    else if (name === "DTSTART") { const l = parseStamp(value, params); if (l) cur.start = l; }
    else if (name === "DTEND") { const l = parseStamp(value, params); if (l) cur.end = l; }
    else if (name === "RRULE") cur.rrule = value;
    else if (name === "EXDATE") { for (const part of value.split(",")) { const l = parseStamp(part, params); if (l) cur.exdates.push(toUtc(l).toISOString()); } }
    else if (name === "RECURRENCE-ID") { const l = parseStamp(value, params); if (l) cur.recurrenceId = l; }
    else if (name === "ORGANIZER") cur.organizer = value.replace(/^mailto:/i, "").toLowerCase();
    else if (name === "STATUS" && /CANCELLED/i.test(value)) cur.cancelled = true;
  }
  return events;
}

const DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const dayNumber = (y: number, m: number, d: number) => Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);

function occurrences(raw: Raw, until: Date): Date[] {
  const start = raw.start!;
  const rule = Object.fromEntries((raw.rrule ?? "").split(";").map((part) => part.split("=") as [string, string]));
  const freq = rule["FREQ"] ?? "";
  const interval = Math.max(1, Number(rule["INTERVAL"] ?? 1));
  const count = rule["COUNT"] ? Number(rule["COUNT"]) : Infinity;
  const stop = rule["UNTIL"] ? (() => { const l = parseStamp(rule["UNTIL"]!, ""); return l ? (l.allDay ? new Date(Date.UTC(l.y, l.m - 1, l.d, 23, 59, 59)) : toUtc(l)) : null; })() : null;
  const byDay = (rule["BYDAY"] ?? "").split(",").filter(Boolean);
  const byMonthDay = (rule["BYMONTHDAY"] ?? "").split(",").filter(Boolean).map(Number);
  const first = dayNumber(start.y, start.m, start.d);
  const startDow = new Date(Date.UTC(start.y, start.m - 1, start.d)).getUTCDay();
  const mondayOfFirst = first - ((startDow + 6) % 7);
  const out: Date[] = [];
  let emitted = 0;
  const limit = Math.min(until.getTime() / 86_400_000 + 2, first + 365 * 15);
  for (let day = first; day <= limit && emitted < count; day += 1) {
    const date = new Date(day * 86_400_000);
    const y = date.getUTCFullYear(); const m = date.getUTCMonth() + 1; const d = date.getUTCDate(); const dow = date.getUTCDay();
    let hit = false;
    if (freq === "DAILY") hit = (day - first) % interval === 0;
    else if (freq === "WEEKLY") hit = Math.floor((day - mondayOfFirst) / 7) % interval === 0 && (byDay.length ? byDay.some((code) => code.slice(-2) === DAYS[dow]) : dow === startDow);
    else if (freq === "MONTHLY") {
      const months = (y - start.y) * 12 + (m - start.m);
      if (months >= 0 && months % interval === 0) {
        if (byDay.length) {
          const nth = Math.floor((d - 1) / 7) + 1; const fromEnd = -Math.floor((new Date(Date.UTC(y, m, 0)).getUTCDate() - d) / 7) - 1;
          hit = byDay.some((code) => { const ord = code.length > 2 ? Number(code.slice(0, -2)) : 0; return code.slice(-2) === DAYS[dow] && (ord === 0 || ord === nth || ord === fromEnd); });
        } else hit = d === (byMonthDay[0] ?? start.d);
      }
    } else if (freq === "YEARLY") hit = (y - start.y) % interval === 0 && m === start.m && d === start.d;
    if (!hit) continue;
    const at = zonedToUtc(y, m, d, start.h, start.mi, start.s, start.zone);
    if (stop && at > stop) break;
    emitted += 1;
    out.push(at);
  }
  return out;
}

/**
 * Parses an .ics file. With a window, recurring meetings are expanded into the instances that fall inside it
 * (cancelled and moved instances are respected); all-day entries are skipped. Without a window only the first
 * occurrence of each event is returned.
 */
export function parseIcs(text: string, window?: IcsWindow): IcsEvent[] {
  const raws = readEvents(text).filter((raw) => raw.start && !raw.start.allDay && !raw.cancelled);
  const overrides = new Map<string, Raw>();
  for (const raw of raws) if (raw.recurrenceId) overrides.set(`${raw.uid}|${toUtc(raw.recurrenceId).toISOString()}`, raw);
  const events: IcsEvent[] = [];
  const push = (raw: Raw, startsAt: Date) => {
    const duration = raw.end ? toUtc(raw.end).getTime() - toUtc(raw.start!).getTime() : 0;
    const endsAt = duration > 0 ? new Date(startsAt.getTime() + duration) : null;
    if (window && (startsAt > window.to || (endsAt ?? startsAt) < window.from)) return;
    events.push({ uid: raw.uid, title: raw.summary || "(No subject)", startsAt: startsAt.toISOString(), endsAt: endsAt ? endsAt.toISOString() : null, description: raw.description, organizerEmail: raw.organizer });
  };
  for (const raw of raws) {
    if (raw.recurrenceId) { push(raw, toUtc(raw.start!)); continue; }
    if (window && raw.rrule) {
      for (const at of occurrences(raw, window.to)) {
        const key = at.toISOString();
        if (raw.exdates.includes(key) || overrides.has(`${raw.uid}|${key}`)) continue;
        push(raw, at);
      }
    } else push(raw, toUtc(raw.start!));
  }
  // cancelled instances of a recurring series are written as EXDATE; cancelled overrides were filtered above
  return events.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}
