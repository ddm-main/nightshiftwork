import { describe, expect, it } from "vitest";

import {
  getShiftDateKey,
  getShiftEnd,
  getShiftProgress,
  getShiftStart,
  getShiftState,
  SHIFT_DURATION_MINUTES,
} from "@/lib/night-shift";

describe("night shift window and overnight workday", () => {
  it("opens exactly at 5:30 PM and closes exactly at 3:30 AM", () => {
    expect(getShiftState(new Date(2026, 10, 16, 17, 29, 59))).toBe("before");
    expect(getShiftState(new Date(2026, 10, 16, 17, 30, 0))).toBe("active");
    expect(getShiftState(new Date(2026, 10, 17, 3, 29, 59))).toBe("active");
    expect(getShiftState(new Date(2026, 10, 17, 3, 30, 0))).toBe("after");
  });

  it("anchors after-midnight work to the shift start date", () => {
    expect(getShiftDateKey(new Date(2026, 10, 17, 1, 30))).toBe("2026-11-16");
    expect(getShiftStart(new Date(2026, 10, 17, 1, 30))).toEqual(new Date(2026, 10, 16, 17, 30));
    expect(getShiftEnd(new Date(2026, 10, 17, 1, 30))).toEqual(new Date(2026, 10, 17, 3, 30));
  });

  it("counts a ten-hour shift and reaches 50 percent at 10:30 PM", () => {
    expect(SHIFT_DURATION_MINUTES).toBe(600);
    expect(getShiftProgress(new Date(2026, 10, 16, 22, 30))).toBe(50);
  });
});
