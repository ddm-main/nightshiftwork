import { describe, expect, it } from "vitest";
import { runningSeconds, totalSeconds } from "@/lib/timers";

const at = (value: string) => new Date(`${value}+05:30`);

describe("timers", () => {
  it("counts live time while the shift is running", () => {
    const task = { status: "in_progress" as const, started_at: at("2026-11-16T21:00:00").toISOString(), elapsed_seconds: 60 };
    expect(runningSeconds(task, at("2026-11-16T21:10:00"))).toBe(600);
    expect(totalSeconds(task, at("2026-11-16T21:10:00"))).toBe(660);
  });
  it("stops counting at 3:30 AM even if the timer was left on", () => {
    const task = { status: "in_progress" as const, started_at: at("2026-11-17T03:00:00").toISOString(), elapsed_seconds: 0 };
    expect(runningSeconds(task, at("2026-11-17T09:45:00"))).toBe(30 * 60);
  });
  it("is zero for paused tasks", () => {
    expect(runningSeconds({ status: "queued", started_at: null }, new Date())).toBe(0);
  });
});
