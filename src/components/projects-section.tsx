import { useMemo, useState, type FormEvent } from "react";
import { Archive, ArrowDownToLine, CalendarDays, Check, ClipboardCheck, Clock3, ListChecks, Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BUCKET_COPY, BUCKET_OPTIONS, Empty, ModalShell, PriorityChip, TIMEZONES, shortDuration, zoneAbbr } from "@/components/ui-kit";
import { ActivityTimeline } from "@/components/activity-timeline";
import { PlanBoard } from "@/components/plan-board";
import { buildActivity, groupActivity, type ActivityEntry } from "@/lib/activity";
import { formatClock } from "@/lib/night-shift";
import { plannedDateFor } from "@/lib/plan";
import { createTask, createTemplate, removeTemplate, saveProject } from "@/lib/tracker-store";
import { totalSeconds } from "@/lib/timers";
import type { Attachment, Meeting, PlanBucket, Project, Task, TaskPriority, WorkflowTemplate } from "@/lib/tracker-types";

const COLORS = ["#38bdf8", "#4ade80", "#fbbf24", "#f472b6", "#a78bfa", "#fb7185"];
type Tab = "overview" | "activity" | "tasks" | "plan" | "meetings" | "workflows" | "notes";

function health(open: number, blocked: number, highOpen: number, total: number) {
  if (!total) return { label: "No work yet", tone: "idle" };
  if (blocked) return { label: "At risk", tone: "risk" };
  if (highOpen >= 3) return { label: "Busy", tone: "busy" };
  return { label: "On track", tone: "ok" };
}

export function ProjectEditDialog({ project, onClose, onSave }: { project: Project; onClose: () => void; onSave: (changes: Partial<Project>) => Promise<void> }) {
  const [name, setName] = useState(project.name);
  const [client, setClient] = useState(project.client_name);
  const [timezone, setTimezone] = useState(project.timezone);
  const [domains, setDomains] = useState(project.domain_rules.join(", "));
  const [notes, setNotes] = useState(project.notes);
  const [color, setColor] = useState(project.color || COLORS[0]!);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    await onSave({ name: name.trim(), client_name: client.trim(), timezone, domain_rules: domains.split(",").map((value) => value.trim()).filter(Boolean), notes, color });
    onClose();
  };
  return <ModalShell title="Edit project" onClose={onClose}>
    <form className="modal-form" onSubmit={submit}>
      <label className="field-label" htmlFor="p-name">Project name</label>
      <Input id="p-name" required autoFocus value={name} onChange={(event) => setName(event.target.value)} />
      <div className="form-split">
        <label className="field-label" htmlFor="p-client">Client<Input id="p-client" value={client} onChange={(event) => setClient(event.target.value)} /></label>
        <label className="field-label" htmlFor="p-tz">Client time zone<select id="p-tz" value={timezone} onChange={(event) => setTimezone(event.target.value)}>{[...new Set([...TIMEZONES, timezone])].map((zone) => <option key={zone} value={zone}>{zone.replace("_", " ")}</option>)}</select></label>
      </div>
      <label className="field-label" htmlFor="p-domains">Email domains (comma separated)</label>
      <Input id="p-domains" value={domains} onChange={(event) => setDomains(event.target.value)} placeholder="clientcorp.com, studio.co" />
      <span className="field-label">Colour</span>
      <div className="swatches">{COLORS.map((value) => <button type="button" key={value} aria-label={`Colour ${value}`} aria-pressed={color === value} className={color === value ? "on" : ""} style={{ background: value }} onClick={() => setColor(value)} />)}</div>
      <label className="field-label" htmlFor="p-notes">Notes</label>
      <Textarea id="p-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Working preferences, contacts, access notes" />
      <div className="modal-actions"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit">Save</Button></div>
    </form>
  </ModalShell>;
}

export function ProjectsSection({ userId, projects, tasks, meetings, templates, attachments, now, activeClientId, busy, onUseClient, onRun, onNewProject, onEditTask, onOpenMeeting, onLogWork, onOpenAttachment }: {
  userId: string; projects: Project[]; tasks: Task[]; meetings: Meeting[]; templates: WorkflowTemplate[]; attachments: Attachment[]; now: Date; activeClientId: string; busy: boolean;
  onLogWork: (projectId: string) => void; onOpenAttachment: (attachmentId: string) => void;
  onUseClient: (id: string) => void; onRun: (action: () => Promise<unknown>, text?: string) => Promise<void>;
  onNewProject: () => void; onEditTask: (task: Task) => void; onOpenMeeting: (meeting: Meeting) => void;
}) {
  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [taskFilter, setTaskFilter] = useState<"open" | "blocked" | "done" | "all">("open");
  const [editing, setEditing] = useState(false);
  const [quickTitle, setQuickTitle] = useState("");
  const [quickPriority, setQuickPriority] = useState<TaskPriority>("normal");
  const [quickBucket, setQuickBucket] = useState<PlanBucket>("tomorrow");
  const [flowName, setFlowName] = useState("");
  const [flowSteps, setFlowSteps] = useState("");
  const [flowOpen, setFlowOpen] = useState(false);
  const [notes, setNotes] = useState<string | null>(null);

  const stats = useMemo(() => new Map(projects.map((project) => {
    const list = tasks.filter((task) => task.project_id === project.id);
    const done = list.filter((task) => task.status === "done").length;
    const blocked = list.filter((task) => task.status === "blocked").length;
    const open = list.length - done;
    const highOpen = list.filter((task) => task.status !== "done" && task.priority === "high").length;
    const seconds = list.reduce((sum, task) => sum + totalSeconds(task, now), 0);
    const upcoming = meetings.filter((meeting) => meeting.project_id === project.id && new Date(meeting.starts_at) >= now).length;
    return [project.id, { list, done, blocked, open, highOpen, seconds, upcoming }];
  })), [projects, tasks, meetings, now]);

  const listed = projects.filter((project) => Boolean(project.archived_at) === showArchived).filter((project) => `${project.name} ${project.client_name}`.toLowerCase().includes(query.toLowerCase()));
  const selected = projects.find((project) => project.id === selectedId) ?? listed[0] ?? null;
  const selectedStats = selected ? stats.get(selected.id) : null;

  const activityDays = useMemo(() => groupActivity(buildActivity({ projectId: selected?.id ?? "", tasks, meetings, attachments, now })), [selected?.id, tasks, meetings, attachments, now]);
  const openActivity = (entry: ActivityEntry) => {
    if (entry.attachmentId) { onOpenAttachment(entry.attachmentId); return; }
    if (entry.meetingId) { const meeting = meetings.find((item) => item.id === entry.meetingId); if (meeting) onOpenMeeting(meeting); return; }
    const task = tasks.find((item) => item.id === entry.taskId); if (task) onEditTask(task);
  };
  const projectMeetings = selected ? meetings.filter((meeting) => meeting.project_id === selected.id).sort((a, b) => a.starts_at.localeCompare(b.starts_at)) : [];
  const projectFlows = selected ? templates.filter((template) => template.project_id === selected.id || template.project_id === null) : [];

  async function addQuickTask(event: FormEvent) {
    event.preventDefault();
    if (!selected || !quickTitle.trim()) return;
    await onRun(async () => { await createTask(userId, { title: quickTitle.trim(), description: "", project_id: selected.id, planning_bucket: quickBucket, planned_date: plannedDateFor(quickBucket, now), priority: quickPriority, steps: [], shift_id: null }); setQuickTitle(""); }, `Added to ${BUCKET_COPY[quickBucket].toLowerCase()}`);
  }

  async function saveFlow(event: FormEvent) {
    event.preventDefault();
    if (!selected || !flowName.trim()) return;
    const steps = flowSteps.split("\n").map((step) => step.trim()).filter(Boolean);
    await onRun(async () => { await createTemplate(userId, { name: flowName.trim(), project_id: selected.id, steps }); setFlowName(""); setFlowSteps(""); setFlowOpen(false); }, "Workflow saved");
  }

  async function useFlow(template: WorkflowTemplate, bucket: PlanBucket) {
    if (!selected) return;
    await onRun(async () => { await createTask(userId, { title: template.name, description: "", project_id: selected.id, planning_bucket: bucket, planned_date: plannedDateFor(bucket, now), priority: "normal", steps: template.steps, shift_id: null }); }, `Task created in ${BUCKET_COPY[bucket].toLowerCase()}`);
  }

  const tasksShown = selectedStats ? selectedStats.list.filter((task) => taskFilter === "all" ? true : taskFilter === "done" ? task.status === "done" : taskFilter === "blocked" ? task.status === "blocked" : task.status !== "done") : [];
  const attention = selectedStats ? selectedStats.list.filter((task) => task.status === "blocked" || (task.status !== "done" && task.priority === "high")).slice(0, 5) : [];
  const total = selectedStats?.list.length ?? 0;

  return <div className="content-wrap projects">
    <div className="page-head">
      <div className="page-title"><h1>Projects</h1><span className="chip">{projects.filter((project) => !project.archived_at).length} active</span></div>
      <div className="page-actions"><Button className="primary-action" size="sm" onClick={onNewProject}><Plus size={14} /> Project</Button></div>
    </div>
    <div className="split">
      <aside className="card list-pane">
        <div className="toolbar tight"><div className="search-field"><Search size={14} /><Input aria-label="Search projects" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" /></div><button className="seg-toggle" onClick={() => setShowArchived(!showArchived)}><Archive size={13} /> {showArchived ? "Active" : "Archived"}</button></div>
        <div className="project-list">{listed.length ? listed.map((project, index) => {
          const st = stats.get(project.id)!; const h = health(st.open, st.blocked, st.highOpen, st.list.length);
          return <button key={project.id} className={`project-row${selected?.id === project.id ? " selected" : ""}`} onClick={() => { setSelectedId(project.id); setTab("overview"); }}>
            <span className="project-monogram" style={{ background: project.color || COLORS[index % COLORS.length] }}>{project.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>
            <span className="project-row-body"><strong>{project.name}</strong><small>{project.client_name || "No client"} · {st.open} open</small><span className="mini-bar"><span style={{ width: `${st.list.length ? Math.round((st.done / st.list.length) * 100) : 0}%` }} /></span></span>
            <span className={`health-dot ${h.tone}`} title={h.label} />
          </button>;
        }) : <Empty icon={<Users size={18} />} text={showArchived ? "No archived projects" : "No projects yet"} action={!showArchived ? <Button variant="outline" size="sm" onClick={onNewProject}><Plus size={14} /> New project</Button> : undefined} />}</div>
      </aside>

      {selected && selectedStats ? <section className="detail-pane">
        <header className="card detail-head">
          <span className="project-monogram big" style={{ background: selected.color || COLORS[0] }}>{selected.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>
          <div className="detail-title"><h2>{selected.name}</h2><span>{selected.client_name || "No client"} · <Clock3 size={12} /> {formatClock(now, selected.timezone)} {zoneAbbr(now, selected.timezone)}</span>{selected.domain_rules.length ? <span className="domain-tags">{selected.domain_rules.map((rule) => <span key={rule}>{rule}</span>)}</span> : null}</div>
          <div className="detail-actions">
            <span className={`chip health ${health(selectedStats.open, selectedStats.blocked, selectedStats.highOpen, total).tone}`}>{health(selectedStats.open, selectedStats.blocked, selectedStats.highOpen, total).label}</span>
            <Button size="sm" variant={activeClientId === selected.id ? "secondary" : "outline"} onClick={() => onUseClient(selected.id)}>{activeClientId === selected.id ? "Active client" : "Use as client"}</Button>
            <Button size="sm" variant="outline" onClick={() => onLogWork(selected.id)}><ClipboardCheck size={13} /> Log work</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}><Pencil size={13} /> Edit</Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void onRun(() => saveProject(userId, selected.id, { archived_at: selected.archived_at ? null : new Date().toISOString() }), selected.archived_at ? "Project restored" : "Project archived")}>{selected.archived_at ? <ArrowDownToLine size={13} /> : <Archive size={13} />} {selected.archived_at ? "Restore" : "Archive"}</Button>
          </div>
        </header>
        <div className="stat-row stat-row-5">
          <div className="stat-tile"><span className="stat-label">Open</span><strong className="stat-value tone-cyan">{selectedStats.open}</strong><small>{selectedStats.highOpen} high priority</small></div>
          <div className="stat-tile"><span className="stat-label">Done</span><strong className="stat-value tone-green">{selectedStats.done}</strong><small>of {total} tasks</small></div>
          <div className="stat-tile"><span className="stat-label">Blocked</span><strong className={`stat-value ${selectedStats.blocked ? "tone-amber" : ""}`}>{selectedStats.blocked}</strong><small>need attention</small></div>
          <div className="stat-tile"><span className="stat-label">Logged</span><strong className="stat-value mono-sm">{shortDuration(selectedStats.seconds)}</strong><small>across all shifts</small></div>
          <div className="stat-tile"><span className="stat-label">Meetings</span><strong className="stat-value">{selectedStats.upcoming}</strong><small>upcoming</small></div>
        </div>
        <div className="segmented tabs" role="tablist">{(["overview", "activity", "tasks", "plan", "meetings", "workflows", "notes"] as Tab[]).map((value) => <button key={value} role="tab" aria-selected={tab === value} onClick={() => setTab(value)}>{value}</button>)}</div>

        {tab === "overview" ? <div className="detail-grid">
          <section className="card"><header className="card-head"><h2>Progress</h2></header>
            <div className="stack-bar" aria-label="Task status breakdown">{(["done", "in_progress", "queued", "blocked"] as const).map((status) => { const count = selectedStats.list.filter((task) => task.status === status).length; return count ? <span key={status} className={`seg ${status}`} style={{ flex: count }} title={`${status.replace("_", " ")}: ${count}`} /> : null; })}</div>
            <div className="legend-row"><span><i className="dot done" /> Done {selectedStats.done}</span><span><i className="dot in_progress" /> Running {selectedStats.list.filter((task) => task.status === "in_progress").length}</span><span><i className="dot queued" /> Queued {selectedStats.list.filter((task) => task.status === "queued").length}</span><span><i className="dot blocked" /> Blocked {selectedStats.blocked}</span></div>
            <form className="inline-add" onSubmit={(event) => void addQuickTask(event)}>
              <Input aria-label="New task for this project" value={quickTitle} onChange={(event) => setQuickTitle(event.target.value)} placeholder={`Add a task to ${selected.name}`} />
              <select aria-label="Priority" value={quickPriority} onChange={(event) => setQuickPriority(event.target.value as TaskPriority)}><option value="high">High</option><option value="normal">Medium</option><option value="low">Low</option></select>
              <select aria-label="Plan" value={quickBucket} onChange={(event) => setQuickBucket(event.target.value as PlanBucket)}>{BUCKET_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select>
              <Button type="submit" size="sm" disabled={!quickTitle.trim() || busy}><Plus size={14} /></Button>
            </form>
          </section>
          <section className="card"><header className="card-head"><h2>Needs attention <span className="count-badge">{attention.length}</span></h2></header>{attention.length ? <div className="row-list">{attention.map((task) => <button className="row-item" key={task.id} onClick={() => onEditTask(task)}><span className="row-title">{task.title}</span><PriorityChip priority={task.priority} />{task.status === "blocked" ? <span className="chip warn">Blocked</span> : null}</button>)}</div> : <p className="muted-note">Nothing blocked or urgent.</p>}</section>
          <section className="card"><header className="card-head"><h2>Next meetings</h2></header>{projectMeetings.filter((meeting) => new Date(meeting.starts_at) >= now).slice(0, 3).map((meeting) => <button className="row-item" key={meeting.id} onClick={() => onOpenMeeting(meeting)}><CalendarDays size={14} /><span className="row-title">{meeting.title}</span><small>{formatClock(new Date(meeting.starts_at), selected.timezone)} {zoneAbbr(new Date(meeting.starts_at), selected.timezone)}</small></button>)}{!projectMeetings.some((meeting) => new Date(meeting.starts_at) >= now) ? <p className="muted-note">No upcoming meetings.</p> : null}</section>
          <section className="card span-2"><header className="card-head"><h2>Recent activity</h2><Button size="sm" variant="ghost" onClick={() => setTab("activity")}>See all →</Button></header><ActivityTimeline days={activityDays.slice(0, 2)} onOpen={openActivity} empty="Nothing recorded yet. Add a task or log work to start this project’s history." /></section>
          <section className="card"><header className="card-head"><h2>Details</h2></header><dl className="facts"><div><dt>Client</dt><dd>{selected.client_name || "—"}</dd></div><div><dt>Time zone</dt><dd>{selected.timezone.replace("_", " ")}</dd></div><div><dt>Domains</dt><dd>{selected.domain_rules.join(", ") || "—"}</dd></div></dl></section>
        </div> : null}

        {tab === "activity" ? <section className="card"><header className="card-head"><h2>Day by day <span className="count-badge">{activityDays.length}</span></h2><Button size="sm" variant="outline" onClick={() => onLogWork(selected.id)}><ClipboardCheck size={13} /> Log work</Button></header><ActivityTimeline days={activityDays} onOpen={openActivity} empty="Nothing recorded yet. Add a task or log work to start this project’s history." /></section> : null}

        {tab === "plan" ? <PlanBoard fixedProjectId={selected.id} userId={userId} allProjects={projects} projects={projects.filter((project) => !project.archived_at)} tasks={tasks} templates={templates} now={now} activeClientId={activeClientId} busy={busy} onRun={onRun} onEditTask={onEditTask} /> : null}

        {tab === "tasks" ? <section className="card"><header className="card-head"><h2>Tasks <span className="count-badge">{tasksShown.length}</span></h2><div className="segmented small">{(["open", "blocked", "done", "all"] as const).map((value) => <button key={value} aria-selected={taskFilter === value} onClick={() => setTaskFilter(value)}>{value}</button>)}</div></header>{tasksShown.length ? <div className="row-list">{tasksShown.map((task) => <button className="row-item task" key={task.id} onClick={() => onEditTask(task)}><span className={`replay-check${task.status === "done" ? " done" : ""}`}>{task.status === "done" ? <Check size={11} /> : null}</span><span className="row-title">{task.title}</span><span className="muted-chip">{BUCKET_COPY[task.planning_bucket]}</span><PriorityChip priority={task.priority} /><small>{task.steps.filter((step) => step.completed).length}/{task.steps.length}</small><small>{shortDuration(totalSeconds(task, now))}</small></button>)}</div> : <Empty icon={<ListChecks size={18} />} text="No tasks in this view" />}</section> : null}

        {tab === "meetings" ? <section className="card"><header className="card-head"><h2>Meetings <span className="count-badge">{projectMeetings.length}</span></h2></header>{projectMeetings.length ? <div className="row-list">{projectMeetings.map((meeting) => <button className="row-item" key={meeting.id} onClick={() => onOpenMeeting(meeting)}><CalendarDays size={14} /><span className="row-title">{meeting.title}</span><small>{new Intl.DateTimeFormat("en-US", { timeZone: selected.timezone, month: "short", day: "numeric" }).format(new Date(meeting.starts_at))} · {formatClock(new Date(meeting.starts_at), selected.timezone)} {zoneAbbr(new Date(meeting.starts_at), selected.timezone)}</small>{meeting.action_items.length ? <span className="muted-chip">{meeting.action_items.length} actions</span> : null}</button>)}</div> : <Empty icon={<CalendarDays size={18} />} text="No meetings linked to this project yet" />}</section> : null}

        {tab === "workflows" ? <section className="card"><header className="card-head"><h2>Workflows <span className="count-badge">{projectFlows.length}</span></h2><Button size="sm" variant="outline" onClick={() => setFlowOpen(!flowOpen)}><Plus size={13} /> New workflow</Button></header>
          {flowOpen ? <form className="modal-form flow-form" onSubmit={(event) => void saveFlow(event)}><Input aria-label="Workflow name" value={flowName} onChange={(event) => setFlowName(event.target.value)} placeholder="e.g. Production deployment" required /><Textarea aria-label="Workflow steps" value={flowSteps} onChange={(event) => setFlowSteps(event.target.value)} placeholder="One checklist step per line" /><div className="modal-actions"><Button type="button" variant="ghost" onClick={() => setFlowOpen(false)}>Cancel</Button><Button type="submit" disabled={!flowName.trim() || busy}>Save workflow</Button></div></form> : null}
          {projectFlows.length ? <div className="row-list">{projectFlows.map((template) => <div className="flow-item" key={template.id}><div><strong>{template.name}</strong><small>{template.steps.length} steps{template.project_id ? "" : " · all projects"}</small><ol>{template.steps.slice(0, 4).map((step, index) => <li key={`${step}-${index}`}>{step}</li>)}{template.steps.length > 4 ? <li className="more">+{template.steps.length - 4} more</li> : null}</ol></div><div className="flow-actions"><select aria-label={`Plan ${template.name} for`} defaultValue="tomorrow" id={`flow-${template.id}`}>{BUCKET_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select><Button size="sm" variant="outline" disabled={busy} onClick={() => void useFlow(template, (document.getElementById(`flow-${template.id}`) as HTMLSelectElement).value as PlanBucket)}>Create task</Button><Button size="icon" variant="ghost" aria-label={`Delete ${template.name}`} onClick={() => void onRun(() => removeTemplate(userId, template.id), "Workflow deleted")}><Trash2 size={14} /></Button></div></div>)}</div> : <Empty icon={<ListChecks size={18} />} text="No workflows yet — save a checklist you repeat" />}</section> : null}

        {tab === "notes" ? <section className="card"><header className="card-head"><h2>Notes</h2><Button size="sm" disabled={busy || notes === null || notes === selected.notes} onClick={() => void onRun(() => saveProject(userId, selected.id, { notes: notes ?? "" }), "Notes saved")}>Save notes</Button></header><Textarea className="notes-area" aria-label="Project notes" value={notes ?? selected.notes} onChange={(event) => setNotes(event.target.value)} placeholder="Contacts, access details, working preferences, escalation steps…" /></section> : null}
      </section> : <section className="detail-pane"><Empty icon={<Users size={20} />} text="Select or create a project to see its workspace" /></section>}
    </div>
    {editing && selected ? <ProjectEditDialog project={selected} onClose={() => setEditing(false)} onSave={(changes) => onRun(() => saveProject(userId, selected.id, changes), "Project updated")} /> : null}
  </div>;
}
