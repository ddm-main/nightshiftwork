import { afterEach, describe, expect, it } from "vitest";
import { validateCalendarUrl } from "@/lib/calendar-url";
import { tasksToCsv } from "@/lib/export";
import { formatClock, getNextShiftDate, getShiftDateKey, getShiftState, setClockFormat } from "@/lib/night-shift";
import { plannedDateFor } from "@/lib/plan";
import { DEFAULT_PREFS, loadPrefs, savePrefs } from "@/lib/prefs";
import { parseQuickTask } from "@/lib/quick-add";
import { runningSeconds } from "@/lib/timers";
import type { Project, TrackerData } from "@/lib/tracker-types";

const ist = (value: string) => new Date(`${value}+05:30`);
const istKey = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date).replace(", ", " ");

describe("next shift calendar", () => {
  it("daytime: the shift after tonight starts tomorrow evening", () => {
    expect(istKey(getNextShiftDate(ist("2026-11-16T09:45:00")))).toBe("2026-11-17 17:30");
  });
  it("Friday evening and the early hours of Saturday both roll to Monday", () => {
    expect(istKey(getNextShiftDate(ist("2026-11-20T21:00:00")))).toBe("2026-11-23 17:30");
    expect(istKey(getNextShiftDate(ist("2026-11-21T01:00:00")))).toBe("2026-11-23 17:30");
  });
  it("after midnight you are still in the previous shift, so the next one is the coming evening", () => {
    // Tuesday 01:00 belongs to Monday's shift; the following shift is Tuesday 17:30, not Wednesday.
    expect(istKey(getNextShiftDate(ist("2026-11-17T01:00:00")))).toBe("2026-11-17 17:30");
  });
});

describe("shift date anchoring", () => {
  it("anchors the early hours to the previous calendar day", () => {
    expect(getShiftDateKey(ist("2026-11-17T01:30:00"))).toBe("2026-11-16");
    expect(getShiftDateKey(ist("2026-11-17T03:29:59"))).toBe("2026-11-16");
    expect(getShiftDateKey(ist("2026-11-17T03:30:00"))).toBe("2026-11-17");
    expect(getShiftState(ist("2026-11-17T17:30:00"))).toBe("active");
  });
  it("plans tonight and tomorrow against the right nights", () => {
    expect(plannedDateFor("tonight", ist("2026-11-17T01:30:00"))).toBe("2026-11-16");
    expect(plannedDateFor("tomorrow", ist("2026-11-16T10:00:00"))).toBe("2026-11-17");
    expect(plannedDateFor("backlog", ist("2026-11-16T10:00:00"))).toBeNull();
  });
});

describe("running timers across midnight", () => {
  it("counts time after midnight but stops at 3:30 AM", () => {
    const task = { status: "in_progress" as const, started_at: ist("2026-11-16T23:30:00").toISOString() };
    expect(runningSeconds(task, ist("2026-11-17T00:30:00"))).toBe(3600);
    expect(runningSeconds(task, ist("2026-11-17T08:00:00"))).toBe(4 * 3600);
  });
});

describe("clock format preference", () => {
  afterEach(() => setClockFormat({ hour12: true, seconds: false }));
  it("switches between 12 and 24 hour, with optional seconds", () => {
    const at = new Date("2026-11-16T16:05:09Z");
    expect(formatClock(at, "Asia/Kolkata")).toMatch(/09:35 PM/);
    setClockFormat({ hour12: false, seconds: true });
    expect(formatClock(at, "Asia/Kolkata")).toBe("21:35:09");
  });
});

describe("prefs storage", () => {
  afterEach(() => localStorage.clear());
  it("round-trips, merges with defaults and survives corrupt data", () => {
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
    savePrefs({ ...DEFAULT_PREFS, hour12: false });
    expect(loadPrefs().hour12).toBe(false);
    localStorage.setItem("ns-prefs", JSON.stringify({ seconds: true }));
    expect(loadPrefs()).toEqual({ ...DEFAULT_PREFS, seconds: true });
    localStorage.setItem("ns-prefs", "{not json");
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
  });
});

describe("calendar link validation", () => {
  it("accepts Microsoft calendar hosts and webcal links", () => {
    expect(validateCalendarUrl("https://outlook.office365.com/owa/calendar/a/b/reachcalendar.ics")).not.toBeNull();
    expect(validateCalendarUrl("webcal://outlook.live.com/owa/calendar/x/calendar.ics")?.protocol).toBe("https:");
  });
  it("rejects other hosts, look-alikes, plain http, credentials and ports", () => {
    for (const bad of ["https://example.com/a.ics", "https://outlook.office365.com.evil.com/a.ics", "http://outlook.office365.com/a.ics", "https://user:pw@outlook.office365.com/a.ics", "https://outlook.office365.com:8443/a.ics", "javascript:alert(1)", "", "not a url"]) expect(validateCalendarUrl(bad), bad).toBeNull();
  });
});

describe("quick add edge cases", () => {
  const projects = [{ id: "p1", name: "HG Foods" }, { id: "p2", name: "Orbit Logistics" }] as unknown as Project[];
  it("keeps unknown #tags in the title and ignores empty input", () => {
    expect(parseQuickTask("Fix #unknown thing", projects)).toMatchObject({ title: "Fix #unknown thing", projectId: null });
    expect(parseQuickTask("   ", projects).title).toBe("");
  });
  it("matches projects by prefix, case-insensitively", () => {
    expect(parseQuickTask("Ship it #HG", projects).projectId).toBe("p1");
    expect(parseQuickTask("Ship it #orbit", projects).projectId).toBe("p2");
  });
  it("handles steps with extra separators and high/low flags", () => {
    expect(parseQuickTask("Deploy !low : a;; b ;", projects)).toMatchObject({ priority: "low", steps: ["a", "b"] });
  });
});

describe("CSV export", () => {
  it("includes project and shift names and escapes quotes, commas and line breaks", () => {
    const data = { projects: [{ id: "p", name: "HG, Foods" }], shifts: [{ id: "s", shift_date: "2026-11-16" }], meetings: [], templates: [], attachments: [], tasks: [{ id: "t", shift_id: "s", project_id: "p", title: 'Say "hi"\nnow', status: "queued", priority: "normal", planning_bucket: "tonight", planned_date: "2026-11-16", elapsed_seconds: 90, completed_at: null, steps: [] }] } as unknown as TrackerData;
    const csv = tasksToCsv(data);
    expect(csv).toContain('"HG, Foods"');
    expect(csv).toContain('"Say ""hi""\nnow"');
    expect(csv.split("\n")[0]).toContain("logged_minutes");
  });
});

import { getReportingAnchor, getShiftEnd, getShiftStart } from "@/lib/night-shift";

describe("handover window anchors to the shift that just ended", () => {
  it("reports on Monday's shift at 3:35 AM Tuesday", () => {
    const anchor = getReportingAnchor(ist("2026-11-17T03:35:00"));
    expect(getShiftDateKey(anchor)).toBe("2026-11-16");
    expect(getShiftStart(anchor).toISOString()).toBe(ist("2026-11-16T17:30:00").toISOString());
    expect(getShiftEnd(anchor).toISOString()).toBe(ist("2026-11-17T03:30:00").toISOString());
  });
  it("leaves every other moment untouched", () => {
    for (const moment of ["2026-11-16T21:00:00", "2026-11-17T03:29:59", "2026-11-17T05:30:00", "2026-11-17T12:00:00"]) {
      expect(getReportingAnchor(ist(moment)).getTime(), moment).toBe(ist(moment).getTime());
    }
    expect(getShiftDateKey(getReportingAnchor(ist("2026-11-17T09:00:00")))).toBe("2026-11-17");
  });
});

import { tasksDueTonight } from "@/lib/plan";
import type { Task } from "@/lib/tracker-types";

describe("tasks that come due", () => {
  const t = (over: Partial<Task>) => ({ id: "x", status: "queued", planning_bucket: "tomorrow", planned_date: null, ...over }) as Task;
  it("moves yesterday's Tomorrow tasks and last night's open Tonight tasks, but not done or future ones", () => {
    const list = [
      t({ id: "a", planning_bucket: "tomorrow", planned_date: "2026-11-17" }),
      t({ id: "b", planning_bucket: "tomorrow", planned_date: "2026-11-18" }),
      t({ id: "c", planning_bucket: "tonight", planned_date: "2026-11-16" }),
      t({ id: "d", planning_bucket: "tonight", planned_date: "2026-11-17" }),
      t({ id: "e", planning_bucket: "tonight", planned_date: "2026-11-16", status: "done" }),
      t({ id: "f", planning_bucket: "backlog", planned_date: null }),
    ];
    expect(tasksDueTonight(list, "2026-11-17").map((task) => task.id)).toEqual(["a", "c"]);
  });
});
