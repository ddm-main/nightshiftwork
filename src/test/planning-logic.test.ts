import { describe, expect, it } from "vitest";
import { extractActionItems } from "@/lib/actions";
import { parseIcs } from "@/lib/ics";
import { parseQuickTask } from "@/lib/quick-add";
import type { Project } from "@/lib/tracker-types";

const projects = [{ id: "p1", name: "Acme Monitoring" }] as unknown as Project[];

describe("parseQuickTask", () => {
  it("reads horizon, priority, project and steps", () => {
    const task = parseQuickTask("Review launch page tomorrow #acme !high : check copy; confirm links", projects);
    expect(task).toEqual({ title: "Review launch page", bucket: "tomorrow", priority: "high", projectId: "p1", steps: ["check copy", "confirm links"] });
  });
  it("falls back to the default horizon", () => {
    expect(parseQuickTask("Plain task", projects, "backlog").bucket).toBe("backlog");
  });
});

describe("extractActionItems", () => {
  it("finds bullets, numbered and labelled lines", () => {
    const items = extractActionItems("Notes\n- Send report\n2) Book call\nAction: Fix login\nrandom line\n[ ] Update docs");
    expect(items).toEqual(["Send report", "Book call", "Fix login", "Update docs"]);
  });
});

describe("parseIcs", () => {
  it("parses UTC and IST events", () => {
    const ics = ["BEGIN:VCALENDAR", "BEGIN:VEVENT", "SUMMARY:Client sync", "DTSTART:20261116T163000Z", "DTEND:20261116T170000Z", "DESCRIPTION:Agenda\\nitem", "END:VEVENT", "BEGIN:VEVENT", "SUMMARY:IST call", "DTSTART;TZID=Asia/Kolkata:20261116T220000", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    const events = parseIcs(ics);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ title: "Client sync", startsAt: "2026-11-16T16:30:00.000Z", endsAt: "2026-11-16T17:00:00.000Z", description: "Agenda\nitem" });
    expect(events[1]?.startsAt).toBe("2026-11-16T16:30:00.000Z");
  });
});

describe("parseQuickTask edge cases", () => {
  it("does not eat horizon words inside a sentence", () => {
    expect(parseQuickTask("Check today's report", projects).title).toBe("Check today's report");
    expect(parseQuickTask("Review later logs", projects, "tomorrow")).toMatchObject({ title: "Review later logs", bucket: "tomorrow" });
  });
  it("reads a trailing or leading horizon", () => {
    expect(parseQuickTask("Deploy release tomorrow", projects)).toMatchObject({ title: "Deploy release", bucket: "tomorrow" });
    expect(parseQuickTask("Backlog Clean up docs", projects)).toMatchObject({ title: "Clean up docs", bucket: "backlog" });
  });
});
