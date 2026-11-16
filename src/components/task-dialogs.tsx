import { useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BUCKET_OPTIONS, ModalShell } from "@/components/ui-kit";
import type { PlanBucket, Project, Task, TaskPriority, TaskStatus } from "@/lib/tracker-types";

export type TaskEdit = { title: string; description: string; project_id: string; priority: TaskPriority; planning_bucket: PlanBucket; status: TaskStatus };

export function TaskEditDialog({ task, projects, onClose, onSave, onDelete }: {
  task: Task; projects: Project[]; onClose: () => void;
  onSave: (changes: TaskEdit) => Promise<void>; onDelete: () => Promise<void>;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [projectId, setProjectId] = useState(task.project_id ?? "");
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [bucket, setBucket] = useState<PlanBucket>(task.planning_bucket);
  const [status, setStatus] = useState<TaskStatus>(task.status === "in_progress" ? "queued" : task.status);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !projectId) return;
    setSaving(true);
    try {
      await onSave({ title: title.trim(), description: description.trim(), project_id: projectId, priority, planning_bucket: bucket, status });
      onClose();
    } finally { setSaving(false); }
  };

  return <ModalShell title="Edit task" onClose={onClose}>
    <form className="modal-form" onSubmit={submit}>
      <label className="field-label" htmlFor="edit-title">Title</label>
      <Input id="edit-title" required autoFocus value={title} onChange={(event) => setTitle(event.target.value)} />
      <label className="field-label" htmlFor="edit-notes">Notes</label>
      <Textarea id="edit-notes" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Context, handoff, or definition of done" />
      <div className="form-split">
        <label className="field-label" htmlFor="edit-project">Project
          <select id="edit-project" required value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            <option value="" disabled>Select a project *</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </label>
        <label className="field-label" htmlFor="edit-priority">Priority
          <select id="edit-priority" value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}>
            <option value="high">High</option><option value="normal">Medium</option><option value="low">Low</option>
          </select>
        </label>
      </div>
      <div className="form-split">
        <label className="field-label" htmlFor="edit-bucket">Plan
          <select id="edit-bucket" value={bucket} onChange={(event) => setBucket(event.target.value as PlanBucket)}>
            {BUCKET_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
        <label className="field-label" htmlFor="edit-status">Status
          <select id="edit-status" value={status} onChange={(event) => setStatus(event.target.value as TaskStatus)}>
            <option value="queued">Queued</option><option value="blocked">Blocked</option><option value="done">Done</option>
          </select>
        </label>
      </div>
      <div className="modal-actions split">
        {confirmDelete
          ? <span className="confirm-row">Delete this task?<Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>No</Button><Button type="button" size="sm" className="danger" onClick={() => void onDelete().then(onClose)}>Yes, delete</Button></span>
          : <Button type="button" variant="ghost" className="danger-ghost" onClick={() => setConfirmDelete(true)}><Trash2 size={14} /> Delete</Button>}
        <span className="modal-actions-right"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving || !title.trim() || !projectId}>Save</Button></span>
      </div>
    </form>
  </ModalShell>;
}
