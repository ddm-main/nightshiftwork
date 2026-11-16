import { describe, expect, it } from "vitest";
import { parseIcs, zonedToUtc } from "@/lib/ics";

const wrap = (...events: string[]) => ["BEGIN:VCALENDAR", "VERSION:2.0", ...events, "END:VCALENDAR"].join("\r\n");
const event = (...lines: string[]) => ["BEGIN:VEVENT", ...lines, "END:VEVENT"].join("\r\n");
const window = { from: new Date("2026-11-09T00:00:00Z"), to: new Date("2026-11-30T00:00:00Z") };

describe("zones", () => {
  it("converts wall-clock time in a zone, across daylight saving", () => {
    expect(zonedToUtc(2026, 11, 16, 9, 0, 0, "America/New_York").toISOString()).toBe("2026-11-16T14:00:00.000Z");
    expect(zonedToUtc(2026, 7, 16, 9, 0, 0, "America/New_York").toISOString()).toBe("2026-07-16T13:00:00.000Z");
  });
});

describe("parseIcs with windows time zones", () => {
  it("reads Outlook's Windows TZID names", () => {
    const [meeting] = parseIcs(wrap(event("UID:a", "SUMMARY:Standup", "DTSTART;TZID=Eastern Standard Time:20261116T090000", "DTEND;TZID=Eastern Standard Time:20261116T093000")));
    expect(meeting).toMatchObject({ startsAt: "2026-11-16T14:00:00.000Z", endsAt: "2026-11-16T14:30:00.000Z" });
  });
  it("skips all-day entries and cancelled events", () => {
    expect(parseIcs(wrap(event("UID:h", "SUMMARY:Holiday", "DTSTART;VALUE=DATE:20261120"), event("UID:c", "SUMMARY:Gone", "STATUS:CANCELLED", "DTSTART:20261116T100000Z")))).toHaveLength(0);
  });
});

describe("recurring meetings", () => {
  const weekly = event("UID:w", "SUMMARY:Weekly sync", "DTSTART;TZID=Eastern Standard Time:20261102T100000", "DTEND;TZID=Eastern Standard Time:20261102T103000", "RRULE:FREQ=WEEKLY;BYDAY=MO,WE");
  it("expands weekly BYDAY rules inside the window", () => {
    const days = parseIcs(wrap(weekly), window).map((item) => item.startsAt.slice(0, 10));
    expect(days).toEqual(["2026-11-09", "2026-11-11", "2026-11-16", "2026-11-18", "2026-11-23", "2026-11-25"]);
  });
  it("honours EXDATE, COUNT and moved instances", () => {
    const ex = event("UID:x", "SUMMARY:Daily", "DTSTART:20261109T120000Z", "DTEND:20261109T123000Z", "RRULE:FREQ=DAILY;COUNT=4", "EXDATE:20261110T120000Z");
    expect(parseIcs(wrap(ex), window).map((item) => item.startsAt.slice(0, 10))).toEqual(["2026-11-09", "2026-11-11", "2026-11-12"]);
    const moved = event("UID:w", "SUMMARY:Weekly sync (moved)", "RECURRENCE-ID;TZID=Eastern Standard Time:20261116T100000", "DTSTART;TZID=Eastern Standard Time:20261116T140000", "DTEND;TZID=Eastern Standard Time:20261116T143000");
    const result = parseIcs(wrap(weekly, moved), window).filter((item) => item.startsAt.startsWith("2026-11-16"));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ title: "Weekly sync (moved)", startsAt: "2026-11-16T19:00:00.000Z" });
  });
  it("keeps the same wall-clock time across a daylight-saving change", () => {
    const rule = event("UID:d", "SUMMARY:Daily", "DTSTART;TZID=Eastern Standard Time:20261030T090000", "DTEND;TZID=Eastern Standard Time:20261030T093000", "RRULE:FREQ=DAILY");
    const dst = parseIcs(wrap(rule), { from: new Date("2026-10-30T00:00:00Z"), to: new Date("2026-11-03T00:00:00Z") });
    expect(dst.map((item) => item.startsAt)).toEqual(["2026-10-30T13:00:00.000Z", "2026-10-31T13:00:00.000Z", "2026-11-01T14:00:00.000Z", "2026-11-02T14:00:00.000Z"]);
  });
});
