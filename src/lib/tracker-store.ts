import { supabase } from "@/integrations/supabase/client";
import type { Attachment, Meeting, PlanBucket, Project, Shift, Task, TaskPriority, TaskStatus, TaskStep, TrackerData, WorkflowTemplate } from "@/lib/tracker-types";

export async function loadTrackerData(userId: string): Promise<TrackerData> {
  const results = await Promise.all([
    supabase.from("projects").select("*").eq("user_id", userId).order("name"),
    supabase.from("tasks").select("*").eq("user_id", userId).order("position").order("created_at", { ascending: false }),
    supabase.from("task_steps").select("*").eq("user_id", userId).order("position"),
    supabase.from("meetings").select("*").eq("user_id", userId).order("starts_at"),
    supabase.from("workflow_templates").select("*").eq("user_id", userId).order("name"),
    supabase.from("shifts").select("*").eq("user_id", userId).order("shift_date", { ascending: false }),
    supabase.from("shift_attachments").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
  ]);
  for (const result of results) {
    if (result.error) throw new Error(result.error.message);
  }

  const stepsByTask = new Map<string, TaskStep[]>();
  for (const step of results[2].data ?? []) {
    const steps = stepsByTask.get(step.task_id) ?? [];
    steps.push({ id: step.id, title: step.title, completed: step.completed, position: step.position });
    stepsByTask.set(step.task_id, steps);
  }
  const attachmentRows = results[6].data ?? [];
  const attachments = await Promise.all(attachmentRows.map(async (row): Promise<Attachment> => {
    const { data } = await supabase.storage.from(row.bucket_id).createSignedUrl(row.object_path, 3600);
    return { ...row, previewUrl: data?.signedUrl };
  }));

  return {
    projects: (results[0].data ?? []) as Project[],
    tasks: (results[1].data ?? []).map((row) => ({ ...row, steps: stepsByTask.get(row.id) ?? [] })) as Task[],
    meetings: (results[3].data ?? []).map((row) => ({ ...row, source: row.source as Meeting["source"] })) as Meeting[],
    templates: (results[4].data ?? []).map((row) => ({
      ...row,
      steps: Array.isArray(row.steps) ? row.steps.filter((step): step is string => typeof step === "string") : [],
    })) as WorkflowTemplate[],
    shifts: (results[5].data ?? []) as Shift[],
    attachments,
  };
}

export async function ensureShift(userId: string, shiftDate: string): Promise<Shift> {
  const { data: existing, error: readError } = await supabase
    .from("shifts").select("*").eq("user_id", userId).eq("shift_date", shiftDate).maybeSingle();
  if (readError) throw new Error(readError.message);
  if (existing) return existing;
  const { data, error } = await supabase.from("shifts")
    .insert({ user_id: userId, shift_date: shiftDate }).select("*").single();
  if (error) throw new Error(error.message);
  return data;
}

export async function createProject(userId: string, project: Omit<Project, "id" | "archived_at">): Promise<Project> {
  const { data, error } = await supabase.from("projects")
    .insert({ ...project, user_id: userId }).select("*").single();
  if (error) throw new Error(error.message);
  return data;
}

export async function saveProject(userId: string, projectId: string, changes: Partial<Project>): Promise<void> {
  const { error } = await supabase.from("projects").update(changes).eq("id", projectId).eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export type NewTaskInput = {
  title: string;
  description: string;
  project_id: string | null;
  planning_bucket: PlanBucket;
  planned_date: string | null;
  priority: TaskPriority;
  steps: string[];
  shift_id: string | null;
  rollover?: boolean;
};

export async function createTask(userId: string, task: NewTaskInput): Promise<Task> {
  const { steps, ...taskValues } = task;
  const { data, error } = await supabase.from("tasks")
    .insert({ ...taskValues, user_id: userId }).select("*").single();
  if (error) throw new Error(error.message);
  if (steps.length) {
    const { error: stepError } = await supabase.from("task_steps").insert(
      steps.map((title, position) => ({ user_id: userId, task_id: data.id, title, position })),
    );
    if (stepError) {
      await supabase.from("tasks").delete().eq("id", data.id).eq("user_id", userId);
      throw new Error(stepError.message);
    }
  }
  return { ...data, steps: steps.map((title, position) => ({ id: `${data.id}-${position}`, title, completed: false, position })) } as Task;
}

export async function updateTask(userId: string, taskId: string, changes: Partial<Pick<Task, "title" | "description" | "status" | "priority" | "planning_bucket" | "planned_date" | "rollover" | "started_at" | "completed_at" | "elapsed_seconds" | "position" | "project_id" | "shift_id">>): Promise<void> {
  const { error } = await supabase.from("tasks").update(changes).eq("id", taskId).eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function removeTask(userId: string, taskId: string): Promise<void> {
  const { error } = await supabase.from("tasks").delete().eq("id", taskId).eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function setStepComplete(userId: string, stepId: string, completed: boolean): Promise<void> {
  const { error } = await supabase.from("task_steps").update({ completed, completed_at: completed ? new Date().toISOString() : null })
    .eq("id", stepId).eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function addTaskStep(userId: string, taskId: string, title: string, position: number): Promise<TaskStep> {
  const { data, error } = await supabase.from("task_steps").insert({ user_id: userId, task_id: taskId, title, position }).select("*").single();
  if (error) throw new Error(error.message);
  return { id: data.id, title: data.title, completed: data.completed, position: data.position };
}

export async function createMeeting(userId: string, meeting: Omit<Meeting, "id" | "source">): Promise<Meeting> {
  const { data, error } = await supabase.from("meetings")
    .insert({ ...meeting, user_id: userId, source: "manual" }).select("*").single();
  if (error) throw new Error(error.message);
  return { ...data, source: "manual" };
}

export async function saveMeeting(userId: string, meetingId: string, changes: Partial<Meeting>): Promise<void> {
  const { error } = await supabase.from("meetings").update(changes).eq("id", meetingId).eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function createTemplate(userId: string, template: Omit<WorkflowTemplate, "id">): Promise<WorkflowTemplate> {
  const { data, error } = await supabase.from("workflow_templates")
    .insert({ ...template, user_id: userId }).select("*").single();
  if (error) throw new Error(error.message);
  return { ...data, steps: template.steps };
}

export async function saveShift(userId: string, shiftId: string, changes: Partial<Pick<Shift, "focus_notes" | "wrap_up" | "started_at" | "ended_at">>): Promise<void> {
  const { error } = await supabase.from("shifts").update(changes).eq("id", shiftId).eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function uploadEvidence(userId: string, shiftId: string | null, taskId: string | null, file: File): Promise<Attachment> {
  const bucket = "task-evidence";
  const objectPath = `${userId}/${shiftId ?? "unassigned"}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
  const { error: uploadError } = await supabase.storage.from(bucket).upload(objectPath, file, { contentType: file.type || "image/png", upsert: false });
  if (uploadError) throw new Error(uploadError.message);
  const { data, error } = await supabase.from("shift_attachments").insert({
    user_id: userId,
    shift_id: shiftId,
    task_id: taskId,
    bucket_id: bucket,
    object_path: objectPath,
    file_name: file.name || "pasted-evidence.png",
    content_type: file.type || "image/png",
  }).select("*").single();
  if (error) {
    await supabase.storage.from(bucket).remove([objectPath]);
    throw new Error(error.message);
  }
  const { data: signed } = await supabase.storage.from(bucket).createSignedUrl(objectPath, 3600);
  return { ...data, previewUrl: signed?.signedUrl };
}

export async function updateAttachment(userId: string, attachmentId: string, changes: Partial<Pick<Attachment, "note" | "ocr_text">>): Promise<void> {
  const { error } = await supabase.from("shift_attachments").update(changes).eq("id", attachmentId).eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function removeAttachment(userId: string, attachment: Attachment): Promise<void> {
  const { error: deleteError } = await supabase.storage.from(attachment.bucket_id).remove([attachment.object_path]);
  if (deleteError) throw new Error(deleteError.message);
  const { error } = await supabase.from("shift_attachments").delete().eq("id", attachment.id).eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export type TaskChanges = Partial<Pick<Task, "status" | "elapsed_seconds" | "started_at" | "completed_at" | "rollover" | "planning_bucket" | "planned_date" | "project_id" | "shift_id">>;

export function taskStatusChanges(status: TaskStatus): TaskChanges {
  return {
    status,
    ...(status === "done" ? { completed_at: new Date().toISOString() } : { completed_at: null }),
  };
}