import { useState, type DragEvent, type FormEvent } from "react";
import { GripVertical, ListChecks, Pencil, Plus, Search, WandSparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BUCKET_COPY, BUCKET_OPTIONS, Empty, PriorityChip, shortDuration } from "@/components/ui-kit";
import { plannedDateFor } from "@/lib/plan";
import { parseQuickTask } from "@/lib/quick-add";
import { createTask, updateTask } from "@/lib/tracker-store";
import { totalSeconds } from "@/lib/timers";
import type { PlanBucket, Project, Task, TaskPriority, WorkflowTemplate } from "@/lib/tracker-types";

const weight: Record<TaskPriority, number> = { high: 0, normal: 1, low: 2 };

export function PlanBoard({ userId, projects, tasks, templates, now, activeClientId, busy, onRun, onEditTask }: {
  userId: string; projects: Project[]; tasks: Task[]; templates: WorkflowTemplate[]; now: Date; activeClientId: string; busy: boolean;
  onRun: (action: () => Promise<unknown>, text?: string) => Promise<void>; onEditTask: (task: Task) => void;
}) {
  const [text, setText] = useState("");
  const [project, setProject] = useState(activeClientId);
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [bucket, setBucket] = useState<PlanBucket>("tomorrow");
  const [filterProject, setFilterProject] = useState("all");
  const [filterPriority, setFilterPriority] = useState<"all" | TaskPriority>("all");
  const [query, setQuery] = useState("");
  const [over, setOver] = useState<PlanBucket | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const visible = tasks
    .filter((task) => task.status !== "done")
    .filter((task) => filterProject === "all" || task.project_id === filterProject)
    .filter((task) => filterPriority === "all" || task.priority === filterPriority)
    .filter((task) => task.title.toLowerCase().includes(query.toLowerCase()));

  async function add(event: FormEvent) {
    event.preventDefault();
    const parsed = parseQuickTask(text, projects, bucket);
    if (!parsed.title) return;
    const projectId = parsed.projectId ?? (project || null);
    if (!projectId) { toast.error("Choose a project for this task."); return; }
    await onRun(async () => {
      await createTask(userId, { title: parsed.title, description: "", project_id: projectId, planning_bucket: parsed.bucket, planned_date: plannedDateFor(parsed.bucket, now), priority: parsed.priority !== "normal" ? parsed.priority : priority, steps: parsed.steps, shift_id: null });
      setText("");
    }, `Added to ${BUCKET_COPY[parsed.bucket].toLowerCase()}`);
  }

  async function move(taskId: string, target: PlanBucket) {
    const task = tasks.find((item) => item.id === taskId);
    if (!task || task.planning_bucket === target) return;
    await onRun(() => updateTask(userId, taskId, { planning_bucket: target, planned_date: plannedDateFor(target, now) }), `Moved to ${BUCKET_COPY[target].toLowerCase()}`);
  }

  async function fromWorkflow(templateId: string) {
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    const projectId = template.project_id ?? (activeClientId || null);
    if (!projectId) { toast.error("Pick an active client or link this workflow to a project first."); return; }
    await onRun(() => createTask(userId, { title: template.name, description: "", project_id: projectId, planning_bucket: bucket, planned_date: plannedDateFor(bucket, now), priority: "normal", steps: template.steps, shift_id: null }), `Workflow added to ${BUCKET_COPY[bucket].toLowerCase()}`);
  }

  const onDragStart = (event: DragEvent, task: Task) => { event.dataTransfer.setData("text/plain", task.id); event.dataTransfer.effectAllowed = "move"; setDragId(task.id); };

  return <div className="content-wrap plan">
    <div className="page-head">
      <div className="page-title"><h1>Plan</h1><span className="chip">{visible.length} open</span></div>
      <div className="page-actions">
        <select aria-label="Add from workflow" value="" onChange={(event) => { if (event.target.value) void fromWorkflow(event.target.value); }} disabled={!templates.length}><option value="">{templates.length ? "Add from workflow…" : "No workflows yet"}</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select>
      </div>
    </div>
    <form className="card quick-bar" onSubmit={(event) => void add(event)}>
      <WandSparkles size={15} className="muted-icon" />
      <Input aria-label="Task title" value={text} onChange={(event) => setText(event.target.value)} placeholder="Quick add — e.g. Review launch page tomorrow #acme !high : check copy; confirm links" />
      <select aria-label="Client project" required value={project} onChange={(event) => setProject(event.target.value)}><option value="" disabled>Project *</option>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <select aria-label="Priority" value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}><option value="high">High</option><option value="normal">Medium</option><option value="low">Low</option></select>
      <select aria-label="Planning window" value={bucket} onChange={(event) => setBucket(event.target.value as PlanBucket)}>{BUCKET_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select>
      <Button type="submit" size="sm" disabled={!text.trim() || busy}><Plus size={14} /> Add</Button>
    </form>
    <div className="toolbar">
      <div className="search-field"><Search size={15} /><Input aria-label="Search tasks" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks" /></div>
      <select aria-label="Filter by project" value={filterProject} onChange={(event) => setFilterProject(event.target.value)}><option value="all">All projects</option>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <select aria-label="Filter by priority" value={filterPriority} onChange={(event) => setFilterPriority(event.target.value as "all" | TaskPriority)}><option value="all">Any priority</option><option value="high">High</option><option value="normal">Medium</option><option value="low">Low</option></select>
      <span className="hint">Drag cards between columns to reschedule</span>
    </div>
    <div className="board">{BUCKET_OPTIONS.map((column) => {
      const list = visible.filter((task) => task.planning_bucket === column.id).sort((a, b) => weight[a.priority] - weight[b.priority] || a.title.localeCompare(b.title));
      return <section key={column.id} className={`board-col${over === column.id ? " over" : ""}`} onDragOver={(event) => { event.preventDefault(); setOver(column.id); }} onDragLeave={() => setOver((current) => current === column.id ? null : current)} onDrop={(event) => { event.preventDefault(); setOver(null); const id = event.dataTransfer.getData("text/plain") || dragId; setDragId(null); if (id) void move(id, column.id); }}>
        <header className="board-head"><h2>{column.label}</h2><span className="count-badge">{list.length}</span>{list.some((task) => task.priority === "high") ? <span className="chip warn small">{list.filter((task) => task.priority === "high").length} high</span> : null}</header>
        <div className="board-list">{list.length ? list.map((task) => {
          const owner = projects.find((item) => item.id === task.project_id);
          return <article key={task.id} className={`board-card${dragId === task.id ? " dragging" : ""}`} draggable onDragStart={(event) => onDragStart(event, task)} onDragEnd={() => { setDragId(null); setOver(null); }}>
            <div className="board-card-top"><GripVertical size={13} className="grip" /><strong>{task.title}</strong><button className="icon-mini" aria-label={`Edit ${task.title}`} onClick={() => onEditTask(task)}><Pencil size={13} /></button></div>
            <div className="board-card-meta"><span className="project-tag">{owner?.name ?? "No project"}</span><PriorityChip priority={task.priority} />{task.status === "blocked" ? <span className="chip warn small">BLOCKED</span> : null}{task.steps.length ? <small><ListChecks size={11} /> {task.steps.filter((step) => step.completed).length}/{task.steps.length}</small> : null}{totalSeconds(task, now) > 0 ? <small>{shortDuration(totalSeconds(task, now))}</small> : null}</div>
            <select aria-label={`Move ${task.title}`} value={task.planning_bucket} onChange={(event) => void move(task.id, event.target.value as PlanBucket)}>{BUCKET_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select>
          </article>;
        }) : <Empty icon={<ListChecks size={16} />} text="Drop tasks here" />}</div>
      </section>;
    })}</div>
  </div>;
}
