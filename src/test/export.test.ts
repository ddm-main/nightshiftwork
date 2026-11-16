import { describe, expect, it } from "vitest";
import { auditToJson, tasksToCsv } from "@/lib/export";
import type { TrackerData } from "@/lib/tracker-types";

const data = {
  projects: [{ id: "p1", name: "Acme, Inc" }],
  shifts: [{ id: "s1", shift_date: "2026-11-16" }],
  meetings: [],
  templates: [],
  attachments: [{ id: "a1", file_name: "x.png", previewUrl: "https://signed" }],
  tasks: [{
    id: "t1", shift_id: "s1", project_id: "p1", title: 'Fix "login"', status: "done", priority: "high",
    planning_bucket: "tonight", planned_date: "2026-11-16", elapsed_seconds: 1800, completed_at: null,
    steps: [{ completed: true }, { completed: false }],
  }],
} as unknown as TrackerData;

describe("export", () => {
  it("escapes CSV cells and computes minutes and steps", () => {
    const lines = tasksToCsv(data).split("\n");
    expect(lines[0]).toContain("shift_date,project,title");
    expect(lines[1]).toBe('2026-11-16,"Acme, Inc","Fix ""login""",done,high,tonight,2026-11-16,30,,1,2');
  });

  it("strips signed preview URLs from the JSON audit log", () => {
    const parsed = JSON.parse(auditToJson(data));
    expect(parsed.attachments[0].previewUrl).toBeUndefined();
    expect(parsed.tasks).toHaveLength(1);
  });
});
