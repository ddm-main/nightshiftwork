import { getShiftDateKey } from "@/lib/night-shift";
import { parseMeta } from "@/lib/meta";
import type { Attachment, Meeting, Task } from "@/lib/tracker-types";

export type ActivityKind = "work_logged" | "task_done" | "step_done" | "task_created" | "meeting" | "evidence";
export type ActivityEntry = { id: string; at: string; day: string; kind: ActivityKind; title: string; detail: string; seconds: number; taskId?: string; meetingId?: string; attachmentId?: string };
export type ActivityDay = { day: string; entries: ActivityEntry[]; done: number; steps: number; meetings: number; evidence: number; seconds: number };

/** Builds the history of one project (or all projects) from timestamps the app already stores. */
export function buildActivity(input: { projectId: string | null; tasks: Task[]; meetings: Meeting[]; attachments: Attachment[]; now: Date }): ActivityEntry[] {
  const { projectId, tasks, meetings, attachments, now } = input;
  const mine = tasks.filter((task) => projectId === null || task.project_id === projectId);
  const entries: ActivityEntry[] = [];
  const add = (entry: Omit<ActivityEntry, "day">) => entries.push({ ...entry, day: getShiftDateKey(new Date(entry.at)) });

  for (const task of mine) {
    const logged = parseMeta(task.description).meta.log;
    if (logged && task.completed_at) {
      add({ id: `log-${task.id}`, at: task.completed_at, kind: "work_logged", title: task.title, detail: "", seconds: task.elapsed_seconds, taskId: task.id });
      continue;
    }
    if (task.created_at) add({ id: `new-${task.id}`, at: task.created_at, kind: "task_created", title: task.title, detail: "", seconds: 0, taskId: task.id });
    if (task.status === "done" && task.completed_at) add({ id: `done-${task.id}`, at: task.completed_at, kind: "task_done", title: task.title, detail: "", seconds: task.elapsed_seconds, taskId: task.id });
    for (const step of task.steps) {
      if (step.completed && step.completed_at) add({ id: `step-${step.id}`, at: step.completed_at, kind: "step_done", title: step.title, detail: task.title, seconds: 0, taskId: task.id });
    }
  }
  for (const meeting of meetings) {
    if (projectId !== null && meeting.project_id !== projectId) continue;
    if (new Date(meeting.starts_at) > now) continue;
    const kind = parseMeta(meeting.agenda).meta.kind ?? (meeting.project_id ? "external" : "internal");
    add({ id: `meeting-${meeting.id}`, at: meeting.starts_at, kind: "meeting", title: meeting.title, detail: kind ?? "", seconds: 0, meetingId: meeting.id });
  }
  const taskIds = new Set(mine.map((task) => task.id));
  const meetingIds = new Set(meetings.filter((meeting) => projectId === null || meeting.project_id === projectId).map((meeting) => meeting.id));
  for (const attachment of attachments) {
    const belongs = projectId === null || (attachment.task_id && taskIds.has(attachment.task_id)) || (attachment.meeting_id && meetingIds.has(attachment.meeting_id));
    if (belongs && attachment.created_at) add({ id: `file-${attachment.id}`, at: attachment.created_at, kind: "evidence", title: attachment.file_name, detail: attachment.note ?? "", seconds: 0, attachmentId: attachment.id, ...(attachment.task_id ? { taskId: attachment.task_id } : {}) });
  }
  return entries.sort((a, b) => b.at.localeCompare(a.at));
}

export function groupActivity(entries: ActivityEntry[]): ActivityDay[] {
  const days = new Map<string, ActivityDay>();
  for (const entry of entries) {
    const day = days.get(entry.day) ?? { day: entry.day, entries: [], done: 0, steps: 0, meetings: 0, evidence: 0, seconds: 0 };
    day.entries.push(entry);
    if (entry.kind === "task_done" || entry.kind === "work_logged") { day.done += 1; day.seconds += entry.seconds; }
    else if (entry.kind === "step_done") day.steps += 1;
    else if (entry.kind === "meeting") day.meetings += 1;
    else if (entry.kind === "evidence") day.evidence += 1;
    days.set(entry.day, day);
  }
  return [...days.values()].sort((a, b) => b.day.localeCompare(a.day));
}
