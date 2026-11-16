import { useState, type FormEvent } from "react";
import { CalendarDays, Check, CheckCircle2, ClipboardCheck, Paperclip, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Empty, ModalShell, shortDuration } from "@/components/ui-kit";
import type { ActivityDay, ActivityEntry, ActivityKind } from "@/lib/activity";
import { composeMeta, normalizeTags } from "@/lib/meta";
import { formatClock } from "@/lib/night-shift";
import type { Project } from "@/lib/tracker-types";

const KIND: Record<ActivityKind, { label: string; icon: typeof Check; tone: string }> = {
  work_logged: { label: "Logged work", icon: ClipboardCheck, tone: "live" },
  task_done: { label: "Completed", icon: CheckCircle2, tone: "live" },
  step_done: { label: "Step done", icon: Check, tone: "accent" },
  task_created: { label: "Task added", icon: Plus, tone: "muted" },
  meeting: { label: "Meeting", icon: CalendarDays, tone: "warn" },
  evidence: { label: "File added", icon: Paperclip, tone: "accent" },
};

const dayTitle = (key: string) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "short", day: "numeric" }).format(new Date(`${key}T12:00:00Z`));

export function ActivityTimeline({ days, projectName, onOpen, empty }: {
  days: ActivityDay[]; projectName?: (entry: ActivityEntry) => string | undefined; onOpen: (entry: ActivityEntry) => void; empty: string;
}) {
  if (!days.length) return <Empty icon={<ClipboardCheck size={18} />} text={empty} />;
  return <div className="timeline">{days.map((day) => <section className="timeline-day" key={day.day}>
    <header className="timeline-head">
      <h3>{dayTitle(day.day)}</h3>
      <div className="timeline-sum">
        {day.done ? <span><b>{day.done}</b> done</span> : null}{day.steps ? <span><b>{day.steps}</b> steps</span> : null}
        {day.meetings ? <span><b>{day.meetings}</b> meeting{day.meetings === 1 ? "" : "s"}</span> : null}{day.evidence ? <span><b>{day.evidence}</b> file{day.evidence === 1 ? "" : "s"}</span> : null}
        {day.seconds ? <span><b>{shortDuration(day.seconds)}</b> logged</span> : null}
      </div>
    </header>
    <ol className="timeline-list">{day.entries.map((entry) => { const meta = KIND[entry.kind]; const Icon = meta.icon; const owner = projectName?.(entry);
      return <li key={entry.id}><button className={`timeline-item ${meta.tone}`} onClick={() => onOpen(entry)}>
        <span className="timeline-dot"><Icon size={12} /></span>
        <span className="timeline-time">{formatClock(new Date(entry.at), "Asia/Kolkata")}</span>
        <span className="timeline-body"><strong>{entry.title}</strong><small>{[meta.label, entry.kind === "meeting" && entry.detail ? entry.detail : entry.detail, owner].filter(Boolean).join(" · ")}</small></span>
        {entry.seconds ? <span className="timeline-time">{shortDuration(entry.seconds)}</span> : null}
      </button></li>; })}</ol>
  </section>)}</div>;
}

export function LogWorkDialog({ projects, defaultProjectId, today, onClose, onSave }: {
  projects: Project[]; defaultProjectId: string; today: string; onClose: () => void;
  onSave: (entry: { title: string; description: string; project_id: string; shiftDate: string; minutes: number }) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState(defaultProjectId);
  const [date, setDate] = useState(today);
  const [minutes, setMinutes] = useState("30");
  const [details, setDetails] = useState("");
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);
  const valid = title.trim() && projectId && Number(minutes) >= 0 && date;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    setSaving(true);
    try { await onSave({ title: title.trim(), description: composeMeta(details, { tags: normalizeTags(tags), log: true }), project_id: projectId, shiftDate: date, minutes: Number(minutes) }); onClose(); } finally { setSaving(false); }
  };
  return <ModalShell title="Log work you did" onClose={onClose}>
    <form className="modal-form" onSubmit={submit}>
      <label className="field-label" htmlFor="lw-title">What did you do?</label>
      <Input id="lw-title" autoFocus required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Investigated the checkout timeout with the client" />
      <div className="form-split">
        <label className="field-label" htmlFor="lw-project">Project<select id="lw-project" required value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="" disabled>Select a project *</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
        <label className="field-label" htmlFor="lw-date">Shift date<Input id="lw-date" type="date" required value={date} max={today} onChange={(event) => setDate(event.target.value)} /></label>
      </div>
      <div className="form-split">
        <label className="field-label" htmlFor="lw-min">Time spent (minutes)<Input id="lw-min" type="number" min={0} step={5} value={minutes} onChange={(event) => setMinutes(event.target.value)} /></label>
        <label className="field-label" htmlFor="lw-tags">Tags<Input id="lw-tags" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="call, hotfix" /></label>
      </div>
      <label className="field-label" htmlFor="lw-details">Details</label>
      <Textarea id="lw-details" value={details} onChange={(event) => setDetails(event.target.value)} placeholder="What happened, what you decided, anything worth remembering" />
      <div className="modal-actions"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={!valid || saving}>Save</Button></div>
    </form>
  </ModalShell>;
}
