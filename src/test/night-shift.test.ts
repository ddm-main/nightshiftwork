import { describe, expect, it } from "vitest";

import {
  getShiftDateKey,
  getNextShiftDate,
  getShiftEnd,
  getShiftDateKeyFromStart,
  getShiftProgress,
  getShiftStart,
  getShiftState,
  istDateTimeInputToIso,
  isoToIstDateTimeInput,
  SHIFT_DURATION_MINUTES,
} from "@/lib/night-shift";

const atIST = (value: string) => new Date(`${value}+05:30`);

describe("night shift window and overnight workday", () => {
  it("opens exactly at 5:30 PM and closes exactly at 3:30 AM", () => {
    expect(getShiftState(atIST("2026-11-16T17:29:59"))).toBe("before");
    expect(getShiftState(atIST("2026-11-16T17:30:00"))).toBe("active");
    expect(getShiftState(atIST("2026-11-17T03:29:59"))).toBe("active");
    expect(getShiftState(atIST("2026-11-17T03:30:00"))).toBe("after");
  });

  it("anchors after-midnight work to the shift start date", () => {
    const postMidnight = atIST("2026-11-17T01:30:00");
    expect(getShiftDateKey(postMidnight)).toBe("2026-11-16");
    expect(getShiftStart(postMidnight)).toEqual(atIST("2026-11-16T17:30:00"));
    expect(getShiftEnd(postMidnight)).toEqual(atIST("2026-11-17T03:30:00"));
  });

  it("counts a ten-hour shift and reaches 50 percent at 10:30 PM", () => {
    expect(SHIFT_DURATION_MINUTES).toBe(600);
    expect(getShiftProgress(atIST("2026-11-16T22:30:00"))).toBe(50);
  });

  it("skips Friday-to-Monday and preserves IST when the browser is in another timezone", () => {
    const friday = atIST("2026-11-20T23:00:00");
    expect(getShiftDateKeyFromStart(getNextShiftDate(friday))).toBe("2026-11-23");
  });

  it("round-trips meeting inputs in IST", () => {
    const iso = istDateTimeInputToIso("2026-11-17T01:30");
    expect(iso).toBe("2026-11-16T20:00:00.000Z");
    expect(isoToIstDateTimeInput(iso)).toBe("2026-11-17T01:30");
  });
});
