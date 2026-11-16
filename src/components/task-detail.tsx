import { useState, type FormEvent } from "react";
import { Check, ExternalLink, FileText, Link2, Paperclip, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BUCKET_OPTIONS, ModalShell, shortDuration } from "@/components/ui-kit";
import { composeMeta, normalizeLinks, normalizeTags, parseMeta } from "@/lib/meta";
import { formatClock } from "@/lib/night-shift";
import { totalSeconds } from "@/lib/timers";
import type { Attachment, PlanBucket, Project, Task, TaskPriority, TaskStatus } from "@/lib/tracker-types";

export type TaskEdit = { title: string; description: string; project_id: string; priority: TaskPriority; planning_bucket: PlanBucket; status: TaskStatus };

const stamp = (iso: string | null | undefined) => iso ? `${new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", month: "short", day: "numeric" }).format(new Date(iso))} · ${formatClock(new Date(iso), "Asia/Kolkata")} IST` : "—";

export function TaskDetailDialog({ task, projects, attachments, now, busy, onClose, onSave, onDelete, onToggleStep, onAddStep, onRenameStep, onRemoveStep, onUpload, onOpenAttachment }: {
  task: Task; projects: Project[]; attachments: Attachment[]; now: Date; busy: boolean; onClose: () => void;
  onSave: (changes: TaskEdit) => Promise<void>; onDelete: () => Promise<void>;
  onToggleStep: (stepId: string, checked: boolean) => void; onAddStep: (title: string) => void; onRenameStep: (stepId: string, title: string) => void; onRemoveStep: (stepId: string) => void;
  onUpload: (files: File[]) => void; onOpenAttachment: (attachment: Attachment) => void;
}) {
  const parsed = parseMeta(task.description);
  const [title, setTitle] = useState(task.title);
  const [body, setBody] = useState(parsed.body);
  const [tags, setTags] = useState(parsed.meta.tags.join(", "));
  const [links, setLinks] = useState(parsed.meta.links.join("\n"));
  const [projectId, setProjectId] = useState(task.project_id ?? "");
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [bucket, setBucket] = useState<PlanBucket>(task.planning_bucket);
  const [status, setStatus] = useState<TaskStatus>(task.status === "in_progress" ? "queued" : task.status);
  const [stepDraft, setStepDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const doneSteps = task.steps.filter((step) => step.completed).length;
  const linkList = normalizeLinks(links);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !projectId) return;
    setSaving(true);
    try {
      await onSave({ title: title.trim(), description: composeMeta(body, { tags: normalizeTags(tags), links: linkList, log: parsed.meta.log }), project_id: projectId, priority, planning_bucket: bucket, status });
      onClose();
    } finally { setSaving(false); }
  };
  const addStep = (event: FormEvent) => { event.preventDefault(); const value = stepDraft.trim(); if (!value) return; onAddStep(value); setStepDraft(""); };

  return <ModalShell title="Task details" onClose={onClose} className="task-detail">
    <form className="detail-form" onSubmit={submit}>
      <div className="detail-main">
        <label className="field-label" htmlFor="td-title">Title</label>
        <Input id="td-title" required autoFocus value={title} onChange={(event) => setTitle(event.target.value)} />
        <div className="form-split">
          <label className="field-label" htmlFor="td-project">Project
            <select id="td-project" required value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="" disabled>Select a project *</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
          </label>
          <label className="field-label" htmlFor="td-priority">Priority
            <select id="td-priority" value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}><option value="high">High</option><option value="normal">Medium</option><option value="low">Low</option></select>
          </label>
        </div>
        <div className="form-split">
          <label className="field-label" htmlFor="td-bucket">Plan
            <select id="td-bucket" value={bucket} onChange={(event) => setBucket(event.target.value as PlanBucket)}>{BUCKET_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select>
          </label>
          <label className="field-label" htmlFor="td-status">Status
            <select id="td-status" value={status} onChange={(event) => setStatus(event.target.value as TaskStatus)}><option value="queued">Queued</option><option value="blocked">Blocked</option><option value="done">Done</option></select>
          </label>
        </div>
        <label className="field-label" htmlFor="td-tags">Tags</label>
        <Input id="td-tags" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="billing, hotfix, client-call" />
        <label className="field-label" htmlFor="td-notes">Details</label>
        <Textarea id="td-notes" className="td-notes" value={body} onChange={(event) => setBody(event.target.value)} placeholder="What this is, what was done, decisions, commands, anything you want to find later" />
        <label className="field-label" htmlFor="td-links">Links (one per line)</label>
        <Textarea id="td-links" className="td-links" value={links} onChange={(event) => setLinks(event.target.value)} placeholder="https://tickets.example.com/42" />
        {linkList.length ? <div className="link-chips">{linkList.map((link) => <a key={link} href={link} target="_blank" rel="noreferrer"><Link2 size={12} /> {link.replace(/^https?:\/\//, "").slice(0, 40)} <ExternalLink size={11} /></a>)}</div> : null}
      </div>

      <aside className="detail-side">
        <section className="side-card">
          <header><h3>Steps <span className="count-badge">{doneSteps}/{task.steps.length}</span></h3></header>
          <div className="step-edit-list">{task.steps.map((step) => <div className={`step-edit${step.completed ? " done" : ""}`} key={step.id}>
            <Checkbox checked={step.completed} onCheckedChange={(value) => onToggleStep(step.id, value === true)} aria-label={`Mark step ${step.title}`} />
            <input defaultValue={step.title} aria-label={`Step ${step.title}`} onBlur={(event) => { const value = event.target.value.trim(); if (!value) { event.target.value = step.title; return; } if (value !== step.title) onRenameStep(step.id, value); }} onKeyDown={(event) => { if (event.key === "Enter") (event.target as HTMLInputElement).blur(); }} />
            <button type="button" className="icon-mini" aria-label={`Remove step ${step.title}`} onClick={() => onRemoveStep(step.id)}><X size={13} /></button>
          </div>)}</div>
          <div className="add-step-row"><Input value={stepDraft} onChange={(event) => setStepDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addStep(event); }} aria-label="Add a step" placeholder="Add a step…" /><Button type="button" size="icon" variant="ghost" aria-label="Add step" disabled={!stepDraft.trim()} onClick={addStep}><Plus size={15} /></Button></div>
        </section>

        <section className="side-card">
          <header><h3>Files &amp; screenshots <span className="count-badge">{attachments.length}</span></h3></header>
          {attachments.length ? <div className="file-grid">{attachments.map((attachment) => <button type="button" key={attachment.id} className="file-tile" title={attachment.note || attachment.file_name} onClick={() => onOpenAttachment(attachment)}>
            {attachment.content_type.startsWith("image/") && attachment.previewUrl ? <img src={attachment.previewUrl} alt={attachment.file_name} /> : <span className="file-icon"><FileText size={20} /></span>}
            <small>{attachment.file_name}</small>
          </button>)}</div> : <p className="muted-note">Nothing attached yet.</p>}
          <label className="outlook-upload"><Paperclip size={14} /> Attach files<input type="file" multiple hidden onChange={(event) => { const files = Array.from(event.target.files ?? []); if (files.length) onUpload(files); event.target.value = ""; }} /></label>
          <p className="field-helper">You can also paste a screenshot (Ctrl/Cmd+V) while this window is open.</p>
        </section>

        <section className="side-card facts">
          <header><h3>History</h3></header>
          <dl><div><dt>Created</dt><dd>{stamp(task.created_at)}</dd></div><div><dt>Completed</dt><dd>{stamp(task.completed_at)}</dd></div><div><dt>Time logged</dt><dd>{shortDuration(totalSeconds(task, now))}</dd></div></dl>
        </section>
      </aside>

      <div className="modal-actions split detail-actions">
        {confirmDelete
          ? <span className="confirm-row">Delete this task and its steps?<Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>No</Button><Button type="button" size="sm" className="danger" onClick={() => void onDelete().then(onClose)}>Yes, delete</Button></span>
          : <Button type="button" variant="ghost" className="danger-ghost" onClick={() => setConfirmDelete(true)}><Trash2 size={14} /> Delete</Button>}
        <span className="modal-actions-right"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving || busy || !title.trim() || !projectId}><Check size={14} /> Save</Button></span>
      </div>
    </form>
  </ModalShell>;
}
