import type { TrackerData } from "@/lib/tracker-types";

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function tasksToCsv(data: TrackerData): string {
  const projectNames = new Map(data.projects.map((project) => [project.id, project.name]));
  const shiftDates = new Map(data.shifts.map((shift) => [shift.id, shift.shift_date]));
  const header = ["shift_date", "project", "title", "status", "priority", "bucket", "planned_date", "logged_minutes", "completed_at", "steps_done", "steps_total"];
  const rows = data.tasks.map((task) => [
    task.shift_id ? shiftDates.get(task.shift_id) : "",
    task.project_id ? projectNames.get(task.project_id) : "",
    task.title,
    task.status,
    task.priority,
    task.planning_bucket,
    task.planned_date,
    Math.round(task.elapsed_seconds / 60),
    task.completed_at,
    task.steps.filter((step) => step.completed).length,
    task.steps.length,
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

export function auditToJson(data: TrackerData): string {
  const { attachments, ...rest } = data;
  return JSON.stringify({ exported_at: new Date().toISOString(), ...rest, attachments: attachments.map(({ previewUrl: _previewUrl, ...item }) => item) }, null, 2);
}

export function downloadText(filename: string, text: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
