import { describe, expect, it } from "vitest";
import { buildActivity, groupActivity } from "@/lib/activity";
import { classifyMeeting, composeMeta, normalizeLinks, normalizeTags, parseMeta } from "@/lib/meta";
import type { Attachment, Meeting, Task } from "@/lib/tracker-types";

describe("meta footer", () => {
  it("round-trips tags, links, type and the log flag", () => {
    const text = composeMeta("Fixed the checkout error.", { tags: ["Billing", "#urgent"], links: ["https://ex.com/t/42"], kind: "external", log: true });
    expect(text).toBe("Fixed the checkout error.\n---\nTags: billing, urgent\nLink: https://ex.com/t/42\nType: external\nLogged: yes");
    expect(parseMeta(text)).toEqual({ body: "Fixed the checkout error.", meta: { tags: ["billing", "urgent"], links: ["https://ex.com/t/42"], kind: "external", log: true } });
  });
  it("works with an empty body and leaves ordinary text alone", () => {
    expect(parseMeta(composeMeta("", { tags: ["a"] }))).toMatchObject({ body: "", meta: { tags: ["a"] } });
    expect(composeMeta("Just notes", {})).toBe("Just notes");
    const withRule = "Intro\n---\nthis is not metadata";
    expect(parseMeta(withRule)).toEqual({ body: withRule, meta: { tags: [], links: [], kind: null, log: false } });
  });
  it("cleans tags and links", () => {
    expect(normalizeTags(" Billing, #Urgent!!, urgent ,  two words ")).toEqual(["billing", "urgent", "two-words"]);
    expect(normalizeLinks("https://a.com javascript:alert(1) http://b.com/x")).toEqual(["https://a.com", "http://b.com/x"]);
  });
  it("classifies meetings by organizer domain", () => {
    expect(classifyMeeting("boss@ilink.com", "me@ilink.com", false)).toBe("internal");
    expect(classifyMeeting("pm@client.com", "me@ilink.com", false)).toBe("external");
    expect(classifyMeeting("anyone@ilink.com", "me@ilink.com", true)).toBe("external");
    expect(classifyMeeting("", "me@ilink.com", false)).toBe("internal");
  });
});

const task = (over: Partial<Task>): Task => ({ id: "t", shift_id: null, project_id: "p1", template_id: null, title: "Task", description: "", status: "queued", priority: "normal", planning_bucket: "tonight", planned_date: null, rollover: false, started_at: null, completed_at: null, elapsed_seconds: 0, position: 0, steps: [], ...over }) as Task;

describe("project activity", () => {
  const now = new Date("2026-11-17T12:00:00Z");
  const tasks = [
    task({ id: "a", title: "Patch bug", created_at: "2026-11-16T14:00:00Z", status: "done", completed_at: "2026-11-16T20:00:00Z", elapsed_seconds: 1800, steps: [{ id: "s1", title: "reproduce", completed: true, position: 0, completed_at: "2026-11-16T15:00:00Z" }, { id: "s2", title: "fix", completed: false, position: 1 }] }),
    task({ id: "b", title: "Wrote report", created_at: "2026-11-16T21:00:00Z", status: "done", completed_at: "2026-11-16T21:00:00Z", elapsed_seconds: 3600, description: composeMeta("", { log: true }) }),
    task({ id: "c", title: "Other project", project_id: "p2", created_at: "2026-11-16T14:00:00Z" }),
  ];
  const meetings = [{ id: "m1", project_id: "p1", title: "Sync", starts_at: "2026-11-16T16:00:00Z", agenda: composeMeta("", { kind: "external" }) }, { id: "m2", project_id: "p1", title: "Future", starts_at: "2026-11-30T16:00:00Z", agenda: "" }] as unknown as Meeting[];
  const attachments = [{ id: "f1", task_id: "a", meeting_id: null, file_name: "shot.png", note: "proof", created_at: "2026-11-16T18:00:00Z" }] as unknown as Attachment[];

  it("lists what happened for one project, newest first, without other projects or future meetings", () => {
    const entries = buildActivity({ projectId: "p1", tasks, meetings, attachments, now });
    expect(entries.map((entry) => `${entry.kind}:${entry.title}`)).toEqual(["work_logged:Wrote report", "task_done:Patch bug", "evidence:shot.png", "meeting:Sync", "step_done:reproduce", "task_created:Patch bug"]);
    expect(entries.find((entry) => entry.kind === "meeting")?.detail).toBe("external");
  });
  it("groups by shift date with totals", () => {
    const days = groupActivity(buildActivity({ projectId: "p1", tasks, meetings, attachments, now }));
    expect(days).toHaveLength(1);
    expect(days[0]).toMatchObject({ day: "2026-11-16", done: 2, steps: 1, meetings: 1, evidence: 1, seconds: 5400 });
  });
  it("covers every project when no project is given", () => {
    expect(buildActivity({ projectId: null, tasks, meetings, attachments, now }).some((entry) => entry.title === "Other project")).toBe(true);
  });
});
