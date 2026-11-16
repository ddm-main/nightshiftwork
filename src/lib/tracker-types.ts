export type PlanBucket = "tonight" | "tomorrow" | "next_7_days" | "next_30_days" | "backlog";
export type TaskStatus = "queued" | "in_progress" | "done" | "blocked";
export type TaskPriority = "low" | "normal" | "high";

export type Project = {
  id: string;
  name: string;
  client_name: string;
  timezone: string;
  domain_rules: string[];
  notes: string;
  color: string;
  archived_at: string | null;
};

export type TaskStep = {
  id: string;
  title: string;
  completed: boolean;
  position: number;
};

export type Task = {
  id: string;
  shift_id: string | null;
  project_id: string | null;
  template_id: string | null;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  planning_bucket: PlanBucket;
  planned_date: string | null;
  rollover: boolean;
  started_at: string | null;
  completed_at: string | null;
  elapsed_seconds: number;
  position: number;
  steps: TaskStep[];
};

export type Meeting = {
  id: string;
  shift_id: string | null;
  project_id: string | null;
  title: string;
  client_name: string;
  starts_at: string;
  ends_at: string | null;
  agenda: string;
  dossier: string;
  notes: string;
  action_items: string[];
  source: "manual" | "outlook";
};

export type WorkflowTemplate = {
  id: string;
  project_id: string | null;
  name: string;
  steps: string[];
};

export type Shift = {
  id: string;
  shift_date: string;
  focus_notes: string;
  wrap_up: string;
  started_at: string | null;
  ended_at: string | null;
};

export type Attachment = {
  id: string;
  shift_id: string | null;
  task_id: string | null;
  meeting_id: string | null;
  bucket_id: string;
  object_path: string;
  file_name: string;
  content_type: string;
  note: string;
  ocr_text: string;
  previewUrl?: string;
};

export type TrackerData = {
  projects: Project[];
  tasks: Task[];
  meetings: Meeting[];
  templates: WorkflowTemplate[];
  shifts: Shift[];
  attachments: Attachment[];
};

export function emptyTrackerData(): TrackerData {
  return { projects: [], tasks: [], meetings: [], templates: [], shifts: [], attachments: [] };
}