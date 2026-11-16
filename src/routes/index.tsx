import { createFileRoute } from "@tanstack/react-router";
import {
  AlarmClock, ArrowDownToLine, ArrowLeftRight, ArrowRight, Archive, CalendarDays, Check,
  CheckCircle2, ChevronDown, ChevronRight, Clipboard, Clock3, Coffee, Command, Copy, CornerDownLeft,
  ExternalLink, FileImage, Focus, FolderKanban, History, ImagePlus, ListChecks, LoaderCircle, LockKeyhole,
  LogOut, Mail, Moon, MoreHorizontal, Pause, Play, Plus, Search, Send, Settings2, ShieldCheck,
  Sparkles, Sun, Timer, Trash2, Upload, Users, WandSparkles, X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  formatClock, formatDateLabel, getNextShiftDate, getShiftDateKey, getShiftDateKeyFromCivilDate,
  getShiftDateKeyFromStart, getShiftEnd, getShiftProgress, getShiftStart, getShiftState,
  isoToIstDateTimeInput, istDateTimeInputToIso,
} from "@/lib/night-shift";
import {
  addTaskStep, createMeeting, createProject, createTask, createTemplate, ensureShift,
  loadTrackerData, removeAttachment, removeTask, saveMeeting, saveProject, saveShift,
  setStepComplete, taskStatusChanges, updateAttachment, updateTask, uploadEvidence,
} from "@/lib/tracker-store";
import type { Attachment, Meeting, PlanBucket, Project, Shift, Task, TaskPriority, TrackerData, WorkflowTemplate } from "@/lib/tracker-types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "My Shift — Night-Shift Operations Tracker" },
      { name: "description", content: "Run your overnight workday, organize projects, and search shift history." },
      { property: "og:title", content: "My Shift — Night-Shift Operations Tracker" },
      { property: "og:description", content: "A private operations tracker for your 5:30 PM–3:30 AM IST shift." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NightShiftApp,
});

type Section = "shift" | "planner" | "archive";
type LoginMode = "sign-in" | "create";
type TrackerUser = { id: string; email?: string };
type Modal = "project" | "meeting" | "template" | "wrap" | null;

const BUCKET_OPTIONS: { id: PlanBucket; label: string }[] = [
  { id: "tonight", label: "Tonight" },
  { id: "tomorrow", label: "Tomorrow" },
  { id: "next_7_days", label: "Next 7 days" },
  { id: "next_30_days", label: "Next 30 days" },
  { id: "backlog", label: "Backlog" },
];
const BUCKET_COPY: Record<PlanBucket, string> = {
  tonight: "Tonight", tomorrow: "Tomorrow", next_7_days: "Next 7 days", next_30_days: "Next 30 days", backlog: "Backlog",
};
const BRAND_MARKS = ["project-tone-0", "project-tone-1", "project-tone-2", "project-tone-3"];
const EMPTY_DATA: TrackerData = { projects: [], tasks: [], meetings: [], templates: [], shifts: [], attachments: [] };

function createId() {
  return crypto.randomUUID();
}

function relativeDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  return `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function dateAtMinute(date: Date, minute: number) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const value = `${fields["year"]}-${fields["month"]}-${fields["day"]}T${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
  return istDateTimeInputToIso(value);
}

function timeLeftUntil(target: Date, now: Date) {
  const seconds = Math.max(0, Math.floor((target.getTime() - now.getTime()) / 1000));
  return `${String(Math.floor(seconds / 3600)).padStart(2, "0")}h ${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")}m`;
}

function LoginScreen() {
  const [mode, setMode] = useState<LoginMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      const result = mode === "sign-in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
      if (result.error) throw result.error;
      if (mode === "create" && !result.data.session) {
        setNotice("Check your inbox to confirm your account, then come back to sign in.");
      } else {
        setNotice("Signing in…");
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Sign-in could not be completed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="auth-screen">
      <section className="auth-story">
        <div className="brand-row"><span className="brand-glyph"><Moon size={20} /></span><span>Nightshift</span><span className="brand-separator">/</span><span className="brand-muted">Operations desk</span></div>
        <div className="auth-copy">
          <span className="eyebrow"><span className="live-dot" /> YOUR HOURS, IN ORDER</span>
          <h1>Make the<br /><em>quiet hours</em><br />count.</h1>
          <p>A clear desk for tonight's work, your client projects, and everything that happened on shift.</p>
        </div>
        <div className="auth-foot"><Clock3 size={15} /> 5:30 PM — 3:30 AM <span>·</span> ASIA / KOLKATA</div>
        <div className="auth-number" aria-hidden="true">01</div>
      </section>
      <section className="auth-panel">
        <div className="auth-form-wrap">
          <div className="auth-icon"><LockKeyhole size={21} /></div>
          <h2>{mode === "sign-in" ? "Welcome back" : "Create your account"}</h2>
          <p className="auth-subtitle">{mode === "sign-in" ? "Sign in to open your private operations desk." : "Create an account to keep your shifts private."}</p>
          <form className="auth-form" onSubmit={submit}>
            <label className="field-label" htmlFor="account-email">Email address</label>
            <Input id="account-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@work.com" />
            <label className="field-label" htmlFor="account-password">Password</label>
            <Input id="account-password" type="password" autoComplete={mode === "sign-in" ? "current-password" : "new-password"} required minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 6 characters" />
            <Button type="submit" disabled={busy} className="auth-submit">{busy ? <LoaderCircle size={16} className="spin" /> : null}{mode === "sign-in" ? "Sign in" : "Create account"}<ArrowRight size={16} /></Button>
          </form>
          {notice ? <p role="status" className="auth-notice">{notice}</p> : null}
          <button type="button" className="auth-mode-switch" onClick={() => { setMode(mode === "sign-in" ? "create" : "sign-in"); setNotice(""); }}>{mode === "sign-in" ? "New here? Create an account" : "Already have an account? Sign in"}</button>
          <div className="auth-security"><ShieldCheck size={15} /> Your work stays private to your account.</div>
        </div>
        <div className="auth-panel-foot"><span>PRIVATE WORKSPACE</span><span>IST UTC +05:30</span></div>
      </section>
    </main>
  );
}

function NightShiftApp() {
  const [user, setUser] = useState<TrackerUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [data, setData] = useState<TrackerData>(EMPTY_DATA);
  const [activeSection, setActiveSection] = useState<Section>("shift");
  const [modal, setModal] = useState<Modal>(null);
  const [selectedAttachment, setSelectedAttachment] = useState<string | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [shift, setShift] = useState<Shift | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [plannerBucket, setPlannerBucket] = useState<PlanBucket>("tomorrow");
  const [archiveMonth, setArchiveMonth] = useState(() => new Date());
  const [archiveDay, setArchiveDay] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showRollovers, setShowRollovers] = useState(false);
  const [evidenceInput, setEvidenceInput] = useState<{ file: File; taskId: string | null } | null>(null);
  const [wrapSeconds, setWrapSeconds] = useState(60);

  useEffect(() => {
    let alive = true;
    void supabase.auth.getSession().then(({ data: result }) => {
      if (!alive) return;
      setUser(result.session?.user ? { id: result.session.user.id, ...(result.session.user.email ? { email: result.session.user.email } : {}) } : null);
      setAuthReady(true);
    }).catch((error: unknown) => {
      if (!alive) return;
      setLoadError(error instanceof Error ? error.message : "Could not reach the sign-in service.");
      setAuthReady(true);
    });
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      setUser(session?.user ? { id: session.user.id, ...(session.user.email ? { email: session.user.email } : {}) } : null);
    });
    return () => { alive = false; authListener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const currentShiftKey = getShiftDateKey(now);
  useEffect(() => {
    if (!user) { setData(EMPTY_DATA); setShift(null); return; }
    let alive = true;
    setBusy(true);
    setLoadError("");
    void Promise.all([loadTrackerData(user.id), ensureShift(user.id, getShiftDateKey(new Date()))])
      .then(([loaded, currentShift]) => {
        if (!alive) return;
        setData(loaded);
        setShift(currentShift);
      })
      .catch((error: unknown) => {
        if (!alive) return;
        setLoadError(error instanceof Error ? error.message : "Your tracker could not be loaded.");
      })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [user, currentShiftKey]);

  const shiftState = getShiftState(now);
  const shiftStart = getShiftStart(now);
  const shiftEnd = getShiftEnd(now);
  const progress = getShiftProgress(now);
  const tasks = data.tasks;
  const projects = data.projects.filter((project) => !project.archived_at);
  const tonightTasks = tasks.filter((task) => task.planning_bucket === "tonight" && task.status !== "done");
  const completedTonight = tasks.filter((task) => task.planning_bucket === "tonight" && task.status === "done").length;
  const upcomingMeetings = data.meetings.filter((meeting) => new Date(meeting.starts_at) >= shiftStart && new Date(meeting.starts_at) <= shiftEnd);
  const activeMeeting = upcomingMeetings.find((meeting) => new Date(meeting.starts_at).getTime() - now.getTime() <= 5 * 60_000 && new Date(meeting.starts_at) >= now);
  const nextShift = getNextShiftDate(now);
  const selectedAttachmentValue = data.attachments.find((attachment) => attachment.id === selectedAttachment) ?? null;

  async function refresh() {
    if (!user) return;
    const [loaded, currentShift] = await Promise.all([loadTrackerData(user.id), ensureShift(user.id, getShiftDateKey(new Date()))]);
    setData(loaded);
    setShift(currentShift);
  }

  async function runAction(action: () => Promise<unknown>, successText?: string) {
    setBusy(true);
    try {
      await action();
      await refresh();
      if (successText) toast.success(successText);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That change could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function beginShift() {
    if (!user || !shift || shiftState !== "active") return;
    await runAction(async () => {
      await saveShift(user.id, shift.id, { started_at: shift.started_at ?? shiftStart.toISOString(), ended_at: null });
    }, "Shift started");
  }

  async function toggleTaskTimer(task: Task) {
    if (!user || !shift) return;
    if (task.status === "in_progress" && task.started_at) {
      const start = new Date(task.started_at);
      const cappedNow = new Date(Math.min(now.getTime(), shiftEnd.getTime()));
      const earned = Math.max(0, Math.floor((cappedNow.getTime() - start.getTime()) / 1000));
      await runAction(() => updateTask(user.id, task.id, { status: "queued", started_at: null, elapsed_seconds: task.elapsed_seconds + earned }), "Timer paused");
      return;
    }
    if (shiftState !== "active") {
      toast.error("Task timers run only during 5:30 PM–3:30 AM IST.");
      return;
    }
    await runAction(async () => {
      if (!shift.started_at) await saveShift(user.id, shift.id, { started_at: shiftStart.toISOString() });
      await updateTask(user.id, task.id, { status: "in_progress", started_at: now.toISOString(), shift_id: shift.id, planning_bucket: "tonight" });
    }, "Timer started");
  }

  async function handleTaskComplete(task: Task, checked: boolean) {
    if (!user) return;
    const earned = task.status === "in_progress" && task.started_at
      ? Math.max(0, Math.floor((Math.min(now.getTime(), shiftEnd.getTime()) - new Date(task.started_at).getTime()) / 1000))
      : 0;
    await runAction(() => updateTask(user.id, task.id, checked
      ? { ...taskStatusChanges("done"), started_at: null, elapsed_seconds: task.elapsed_seconds + earned }
      : { status: "queued", completed_at: null }), checked ? "Task completed" : "Task reopened");
  }

  async function handleStepChange(stepId: string, checked: boolean) {
    if (!user) return;
    await runAction(() => setStepComplete(user.id, stepId, checked));
  }

  async function handleAddStep(task: Task, title: string) {
    if (!user) return;
    await runAction(async () => { await addTaskStep(user.id, task.id, title, task.steps.length); }, "Checklist item added");
  }

  async function onEvidence(file: File, taskId: string | null) {
    if (!user) return;
    const imageFile = file.type.startsWith("image/") ? file : null;
    if (!imageFile) { toast.error("Paste or choose an image file for shift evidence."); return; }
    setEvidenceInput({ file: imageFile, taskId });
  }

  async function saveEvidence(file: File, taskId: string | null) {
    if (!user) return;
    await runAction(async () => {
      const added = await uploadEvidence(user.id, shift?.id ?? null, taskId, file);
      setData((current) => ({ ...current, attachments: [added, ...current.attachments] }));
      setSelectedAttachment(added.id);
      setEvidenceInput(null);
    }, "Evidence saved privately");
  }

  async function updateWrapUp(text: string) {
    if (!user || !shift) return;
    await runAction(async () => {
      await saveShift(user.id, shift.id, { ended_at: now.toISOString(), wrap_up: text });
      setModal(null);
    }, "Shift wrapped up");
  }

  function copyShiftMessage(target: "Slack" | "Teams") {
    const done = tasks.filter((task) => task.planning_bucket === "tonight" && task.status === "done");
    const next = tasks.filter((task) => task.planning_bucket === "tonight" && task.status !== "done");
    const lines = [`Night shift handoff · ${shift?.shift_date ?? currentShiftKey}`, "", "Completed:", ...done.map((task) => `• ${task.title}`), "", "Rolling over:", ...next.map((task) => `• ${task.title}`)];
    if (shift?.wrap_up) lines.push("", "Notes:", shift.wrap_up);
    void navigator.clipboard.writeText(lines.join("\n")).then(() => toast.success(`${target} handoff copied`));
  }

  function handleClipboard(event: ClipboardEvent) {
    const imageItem = Array.from(event.clipboardData?.items ?? []).find((item) => item.type.startsWith("image/"));
    const file = imageItem?.getAsFile();
    if (file && user) {
      event.preventDefault();
      void onEvidence(file, null);
    }
  }

  useEffect(() => {
    window.addEventListener("paste", handleClipboard);
    return () => window.removeEventListener("paste", handleClipboard);
  }, [user]);

  useEffect(() => {
    if (modal !== "wrap") return;
    setWrapSeconds(60);
    const timer = window.setInterval(() => setWrapSeconds((value) => Math.max(0, value - 1)), 1000);
    const close = window.setTimeout(() => setModal(null), 60_000);
    return () => { window.clearInterval(timer); window.clearTimeout(close); };
  }, [modal]);

  if (!authReady) return <main className="boot-screen"><span className="brand-glyph"><Moon size={20} /></span><LoaderCircle size={18} className="spin" /><span>Opening your shift desk</span></main>;
  if (!user) return <><LoginScreen />{loadError ? <div className="auth-runtime-error" role="alert">{loadError}</div> : null}</>;

  return (
    <main className={`app-frame${focusMode ? " focus-on" : ""}`}>
      <aside className="sidebar">
        <div className="side-brand"><span className="brand-glyph"><Moon size={18} /></span><span className="side-wordmark">Nightshift<span>OPS</span></span></div>
        <div className="side-workspace"><span className="workspace-initial">{(user.email?.[0] ?? "W").toUpperCase()}</span><span className="workspace-copy"><strong>My workspace</strong><small>Private desk</small></span><ChevronDown size={15} /></div>
        <div className="side-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          <NavButton section="shift" active={activeSection} setActive={setActiveSection} icon={<Moon size={17} />} label="My shift" {...(tonightTasks.length > 0 ? { badge: String(tonightTasks.length) } : {})} />
          <NavButton section="planner" active={activeSection} setActive={setActiveSection} icon={<FolderKanban size={17} />} label="Projects & planning" />
          <NavButton section="archive" active={activeSection} setActive={setActiveSection} icon={<Archive size={17} />} label="Archive & audit" />
        </nav>
        <div className="side-project-heading"><span className="side-label">CLIENT PROJECTS</span><Button variant="ghost" size="icon" aria-label="Add project" title="Add project" onClick={() => setModal("project")}><Plus size={15} /></Button></div>
        <div className="side-projects">{projects.length ? projects.slice(0, 5).map((project, index) => <button key={project.id} className="side-project" onClick={() => { setActiveSection("planner"); setPlannerBucket("tonight"); }}><span className={`project-pin ${BRAND_MARKS[index % BRAND_MARKS.length]}`} />{project.name}</button>) : <p className="side-empty">Your client list is ready for a first project.</p>}</div>
        <div className="side-bottom">
          <div className="side-shift-status"><span className={`status-dot${shiftState === "active" ? " is-live" : ""}`} /><span><strong>{shiftState === "active" ? "Shift window open" : "Next shift"}</strong><small>17:30 – 03:30 IST</small></span><ArrowRight size={14} /></div>
          <button className="side-account" onClick={() => void supabase.auth.signOut()}><span className="account-avatar">{(user.email?.[0] ?? "U").toUpperCase()}</span><span className="account-copy"><strong>{user.email ?? "Signed in"}</strong><small>Sign out</small></span><LogOut size={15} /></button>
        </div>
      </aside>

      <section className="app-content">
        <header className="topbar"><div className="breadcrumbs"><span>WORKSPACE</span><ChevronRight size={13} /><strong>{activeSection === "shift" ? "MY SHIFT" : activeSection === "planner" ? "PROJECTS & PLANNING" : "ARCHIVE & AUDIT"}</strong></div><div className="topbar-actions"><div className="quiet-pill"><span className="status-dot is-live" /> YOUR TIME IS YOURS</div><Button variant={focusMode ? "secondary" : "ghost"} size="sm" className="focus-button" onClick={() => setFocusMode(!focusMode)}><Focus size={15} />{focusMode ? "Exit focus" : "Focus mode"}</Button><span className="topbar-date">{formatDateLabel(now, "Asia/Kolkata")}</span></div></header>
        {loadError ? <div className="error-banner" role="alert"><span>{loadError}</span><Button variant="outline" size="sm" onClick={() => { setLoadError(""); void refresh(); }}>Retry</Button></div> : null}
        {focusMode ? <div className="focus-strip"><Focus size={15} /> FOCUS MODE <span>·</span> {formatClock(now, "Asia/Kolkata")} IST <Button size="icon" variant="ghost" aria-label="Exit focus mode" onClick={() => setFocusMode(false)}><X size={15} /></Button></div> : null}
        <div className="mobile-section-tabs" role="tablist" aria-label="Tracker sections">
          <button role="tab" aria-selected={activeSection === "shift"} onClick={() => setActiveSection("shift")}><Moon size={15} /> Shift</button>
          <button role="tab" aria-selected={activeSection === "planner"} onClick={() => setActiveSection("planner")}><FolderKanban size={15} /> Plan</button>
          <button role="tab" aria-selected={activeSection === "archive"} onClick={() => setActiveSection("archive")}><Archive size={15} /> Archive</button>
        </div>
        {activeSection === "shift" ? <ShiftSection {...{ now, shift, shiftState, shiftStart, shiftEnd, progress, nextShift, projects, tasks, tonightTasks, completedTonight, upcomingMeetings, activeMeeting, attachments: data.attachments, onBegin: beginShift, onTaskTimer: toggleTaskTimer, onTaskComplete: handleTaskComplete, onStepChange: handleStepChange, onAddStep: handleAddStep, onAddTask: () => setModal("template"), onAddMeeting: () => setModal("meeting"), onWrap: () => setModal("wrap"), onPaste: (file, taskId) => void onEvidence(file, taskId), onAttachment: setSelectedAttachment, onRollover: () => setShowRollovers(!showRollovers), showRollovers, busy }} /> : null}
        {activeSection === "planner" ? <PlannerSection {...{ userId: user.id, now, projects, tasks, meetings: data.meetings, templates: data.templates, bucket: plannerBucket, setBucket: setPlannerBucket, busy, onRun: runAction, onModal: setModal, onDataChange: refresh, onTaskTimer: toggleTaskTimer, shiftState }} /> : null}
        {activeSection === "archive" ? <ArchiveSection {...{ data, now, month: archiveMonth, setMonth: setArchiveMonth, day: archiveDay, setDay: setArchiveDay, search, setSearch, onAttachment: setSelectedAttachment }} /> : null}
        <footer className="page-footer"><span><ShieldCheck size={14} /> PRIVATE TO YOUR ACCOUNT</span><span>Asia / Kolkata <span className="footer-dot">·</span> America / New York</span></footer>
      </section>

      {modal === "project" ? <ProjectModal userId={user.id} onClose={() => setModal(null)} onSave={async (project) => { await runAction(async () => { await createProject(user.id, project); }, "Project created"); setModal(null); }} /> : null}
      {modal === "meeting" ? <MeetingModal userId={user.id} shiftId={shift?.id ?? null} projects={projects} onClose={() => setModal(null)} onSave={async (meeting) => { await runAction(async () => { await createMeeting(user.id, meeting); }, "Meeting added"); setModal(null); }} /> : null}
      {modal === "template" ? <TaskModal userId={user.id} shiftId={shift?.id ?? null} projects={projects} templates={data.templates} defaultBucket="tonight" onClose={() => setModal(null)} onSave={async (task) => { await runAction(async () => { await createTask(user.id, task); }, "Task added to tonight"); setModal(null); }} /> : null}
      {modal === "wrap" ? <WrapModal shift={shift} tasks={tasks} seconds={wrapSeconds} onClose={() => setModal(null)} onSave={updateWrapUp} onCopy={copyShiftMessage} busy={busy} /> : null}
      {evidenceInput ? <EvidenceDialog file={evidenceInput.file} busy={busy} onClose={() => setEvidenceInput(null)} onSave={(file) => void saveEvidence(file, evidenceInput.taskId)} /> : null}
      {selectedAttachmentValue ? <AttachmentDialog attachment={selectedAttachmentValue} busy={busy} onClose={() => setSelectedAttachment(null)} onSaveNote={(note) => { if (!user) return; void runAction(() => updateAttachment(user.id, selectedAttachmentValue.id, { note }), "Evidence note saved"); }} onDelete={() => { if (!user) return; void runAction(() => removeAttachment(user.id, selectedAttachmentValue), "Evidence removed"); setSelectedAttachment(null); }} /> : null}
      {busy ? <div className="save-indicator" role="status"><LoaderCircle size={14} className="spin" /> Saving</div> : null}
    </main>
  );
}

function NavButton({ section, active, setActive, icon, label, badge }: { section: Section; active: Section; setActive: (section: Section) => void; icon: ReactNode; label: string; badge?: string }) {
  return <button className={`nav-item${active === section ? " nav-active" : ""}`} onClick={() => setActive(section)}>{icon}<span>{label}</span>{badge ? <small>{badge}</small> : null}</button>;
}

function SectionHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="section-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action ? <div className="heading-action">{action}</div> : null}</div>;
}

function ShiftSection(props: {
  now: Date; shift: Shift | null; shiftState: ReturnType<typeof getShiftState>; shiftStart: Date; shiftEnd: Date; progress: number;
  nextShift: Date; projects: Project[]; tasks: Task[]; tonightTasks: Task[]; completedTonight: number; upcomingMeetings: Meeting[];
  activeMeeting: Meeting | undefined; attachments: Attachment[]; onBegin: () => void; onTaskTimer: (task: Task) => void;
  onTaskComplete: (task: Task, checked: boolean) => void; onStepChange: (stepId: string, checked: boolean) => void;
  onAddStep: (task: Task, title: string) => void; onAddTask: () => void; onAddMeeting: () => void; onWrap: () => void;
  onPaste: (file: File, taskId: string | null) => void; onAttachment: (id: string) => void; onRollover: () => void; showRollovers: boolean; busy: boolean;
}) {
  const { now, shift, shiftState, shiftStart, shiftEnd, progress, nextShift, projects, tasks, tonightTasks, completedTonight, upcomingMeetings, activeMeeting, attachments, onBegin, onTaskTimer, onTaskComplete, onStepChange, onAddStep, onAddTask, onAddMeeting, onWrap, onPaste, onAttachment, onRollover, showRollovers, busy } = props;
  const shiftProjectCounts = new Set(tonightTasks.map((task) => task.project_id).filter(Boolean)).size;
  const rolloverTasks = tasks.filter((task) => task.rollover && task.status !== "done");
  const running = tonightTasks.find((task) => task.status === "in_progress");
  return <div className="content-wrap">
    <SectionHeading eyebrow="MONDAY NIGHT · SHIFT 01" title="My shift" description={`${formatDateLabel(shiftStart, "Asia/Kolkata")} · Your workday runs through 3:30 AM.`} action={shiftState === "active" ? <Button className="primary-action" onClick={onBegin} disabled={busy}><span className="button-signal" />{shift?.started_at ? "Shift is running" : "Start shift"}<ArrowRight size={16} /></Button> : null} />
    <div className="clock-panel">
      <div className="clock-main"><div className="clock-intro"><span className={`status-dot${shiftState === "active" ? " is-live" : ""}`} />{shiftState === "active" ? "YOUR SHIFT IS LIVE" : "BETWEEN SHIFTS"}</div><div className="clock-digits">{formatClock(now, "Asia/Kolkata")}<span> IST</span></div><div className="clock-context">{shiftState === "active" ? `${Math.max(0, Math.floor((shiftEnd.getTime() - now.getTime()) / 60_000))} minutes remain in this shift` : `Your next shift begins in ${timeLeftUntil(getShiftState(now) === "after" ? new Date(getShiftStart(now).getTime() + 24 * 60 * 60_000) : shiftStart, now)}`}</div></div>
      <div className="clock-secondary"><div className="clock-secondary-top"><span>CLIENT TIME</span><span className="timezone-tag">EST / EDT · NEW YORK</span></div><div className="client-clock">{formatClock(now, "America/New_York")}<span> ET</span></div><div className="client-date">{formatDateLabel(now, "America/New_York")}</div></div>
      <div className="shift-progress"><div className="progress-track"><span style={{ width: `${shiftState === "active" ? progress : 0}%` }} /></div><div className="progress-labels"><span>5:30 PM</span><strong>{shiftState === "active" ? `${Math.round(progress)}% THROUGH` : "10-HOUR WINDOW"}</strong><span>3:30 AM</span></div></div>
      <div className="shift-meta"><div><span className="meta-icon"><ListChecks size={16} /></span><span><strong>{completedTonight} / {tonightTasks.length}</strong><small>Tasks done</small></span></div><div><span className="meta-icon"><FolderKanban size={16} /></span><span><strong>{shiftProjectCounts}</strong><small>Projects in play</small></span></div><div><span className="meta-icon"><Clock3 size={16} /></span><span><strong>{shift?.started_at ? formatClock(new Date(shift.started_at), "Asia/Kolkata") : "—"}</strong><small>Shift opened</small></span></div><div><span className="meta-icon"><Coffee size={16} /></span><span><strong>{formatClock(shiftEnd, "Asia/Kolkata")}</strong><small>Hard stop</small></span></div></div>
    </div>

    <div className="shift-columns">
      <div className="primary-column">
        <div className="block-heading"><div><div className="eyebrow">THE WORK, IN ORDER</div><h2>Tonight's focus <span className="count-badge">{tonightTasks.length}</span></h2></div><div className="inline-actions"><Button variant="ghost" size="icon" title="Show rollover tasks" aria-label="Show rollover tasks" onClick={onRollover}><ArrowDownToLine size={16} /></Button><Button variant="outline" size="sm" onClick={onAddTask}><Plus size={15} /> Add task</Button></div></div>
        {showRollovers && rolloverTasks.length ? <div className="rollover-note"><ArrowDownToLine size={15} /><span><strong>Carried forward</strong> · {rolloverTasks.map((task) => task.title).join(" · ")}</span></div> : null}
        {tonightTasks.length ? <div className="task-list">{tonightTasks.map((task, index) => <TaskCard key={task.id} task={task} project={projects.find((project) => project.id === task.project_id)} index={index} now={now} shiftEnd={shiftEnd} shiftActive={shiftState === "active"} attachments={attachments.filter((attachment) => attachment.task_id === task.id)} busy={busy} onTimer={() => onTaskTimer(task)} onComplete={(checked) => onTaskComplete(task, checked)} onStepChange={onStepChange} onAddStep={(title) => onAddStep(task, title)} onPaste={(file) => onPaste(file, task.id)} onAttachment={onAttachment} />)}</div> : <EmptyTasks onAdd={onAddTask} />}
        <div className="paste-hint"><span className="paste-key">⌘ / CTRL</span><span>Paste a screenshot anywhere on this page to attach shift evidence.</span><button onClick={() => onPaste(new File([], ""), null)} aria-label="Choose screenshot to upload"><Upload size={14} /> Upload</button></div>
        {running && shiftState !== "active" ? <div className="timer-outside-note"><Clock3 size={15} /> A running task timer will stop at the shift boundary.</div> : null}
      </div>
      <aside className="secondary-column">
        <div className="block-heading side-block-title"><div><div className="eyebrow">CLIENT TIME · ET</div><h2>Meetings <span className="count-badge">{upcomingMeetings.length}</span></h2></div><Button variant="ghost" size="icon" title="Add meeting" aria-label="Add meeting" onClick={onAddMeeting}><Plus size={16} /></Button></div>
        {activeMeeting ? <div className="meeting-brief"><div className="brief-label"><Sparkles size={14} /> 5-MINUTE BRIEF</div><strong>{activeMeeting.title}</strong><span>{activeMeeting.client_name || "Client meeting"} · {formatClock(new Date(activeMeeting.starts_at), "America/New_York")} ET</span>{activeMeeting.dossier ? <p>{activeMeeting.dossier}</p> : <p>Add context to this meeting before the call.</p>}</div> : null}
        {upcomingMeetings.length ? <div className="meeting-list">{upcomingMeetings.map((meeting) => <MeetingRow key={meeting.id} meeting={meeting} now={now} />)}</div> : <div className="empty-meetings"><CalendarDays size={19} /><span><strong>No meetings on your shift</strong><small>Calendar sync is unavailable. Add a meeting manually.</small></span><Button variant="outline" size="sm" onClick={onAddMeeting}><Plus size={14} /> Add</Button></div>}
        <div className="side-divider" />
        <div className="block-heading side-block-title"><div><div className="eyebrow">WRAP THE NIGHT</div><h2>End-of-shift handoff</h2></div><Timer size={16} className="muted-icon" /></div>
        <div className="wrap-summary"><span className="wrap-completed"><CheckCircle2 size={16} /> {completedTonight} tasks done</span><span className="wrap-pending">{tonightTasks.length - completedTonight} to roll forward</span></div>
        <Button variant="outline" className="wrap-launch" onClick={onWrap}><Clipboard size={15} /> Open 60-second wrap-up <ArrowRight size={15} /></Button>
        <div className="rollover-foot"><ArrowLeftRight size={14} /><span>Next shift: <strong>{new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", weekday: "long", month: "short", day: "numeric" }).format(nextShift)}</strong> <small>· weekend skip on</small></span></div>
      </aside>
    </div>
  </div>;
}

function EmptyTasks({ onAdd }: { onAdd: () => void }) {
  return <div className="empty-task-state"><div className="empty-mark"><ListChecks size={24} /></div><span className="eyebrow">CLEAR DESK, CLEAR HEAD</span><h3>Your queue starts here.</h3><p>Add tonight's first task when you're ready. No demo tasks, no borrowed data.</p><Button className="primary-action" onClick={onAdd}><Plus size={16} /> Add your first task</Button></div>;
}

function TaskCard({ task, project, index, now, shiftEnd, shiftActive, attachments, busy, onTimer, onComplete, onStepChange, onAddStep, onPaste, onAttachment }: {
  task: Task; project?: Project; index: number; now: Date; shiftEnd: Date; shiftActive: boolean; attachments: Attachment[]; busy: boolean;
  onTimer: () => void; onComplete: (checked: boolean) => void; onStepChange: (stepId: string, checked: boolean) => void; onAddStep: (title: string) => void; onPaste: (file: File) => void; onAttachment: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(task.status === "in_progress");
  const [stepDraft, setStepDraft] = useState("");
  const elapsed = task.elapsed_seconds + (task.status === "in_progress" && task.started_at ? Math.max(0, Math.floor((Math.min(now.getTime(), shiftEnd.getTime()) - new Date(task.started_at).getTime()) / 1000)) : 0);
  const remaining = task.steps.filter((step) => !step.completed).length;
  const submitStep = (event: FormEvent) => { event.preventDefault(); const value = stepDraft.trim(); if (!value) return; onAddStep(value); setStepDraft(""); };
  return <article className={`task-card${task.status === "in_progress" ? " task-running" : ""}`}>
    <div className="task-main-row"><div className="task-index">{String(index + 1).padStart(2, "0")}</div><Checkbox checked={task.status === "done"} onCheckedChange={(value) => onComplete(value === true)} aria-label={`Mark ${task.title} ${task.status === "done" ? "incomplete" : "complete"}`} disabled={busy} />
      <button className="task-title-area" onClick={() => setExpanded(!expanded)}><span className={task.status === "done" ? "task-title is-done" : "task-title"}>{task.title}</span><span className="task-subtitle"><span>{project?.name ?? "Personal"}</span>{task.priority === "high" ? <span className="priority-chip">HIGH PRIORITY</span> : null}{task.rollover ? <span className="rollover-chip">ROLLED OVER</span> : null}</span></button>
      <div className="task-trailing">{task.steps.length ? <button className="checklist-count" onClick={() => setExpanded(!expanded)}><ListChecks size={14} />{task.steps.length - remaining}/{task.steps.length}</button> : null}<span className={task.status === "in_progress" ? "task-timer timer-live" : "task-timer"}><Clock3 size={13} />{relativeDuration(elapsed)}</span><Button variant={task.status === "in_progress" ? "secondary" : "outline"} size="icon" aria-label={task.status === "in_progress" ? `Pause ${task.title}` : `Start timer for ${task.title}`} title={task.status === "in_progress" ? "Pause timer" : shiftActive ? "Start timer" : "Timers work only during shift hours"} onClick={onTimer} disabled={busy || (task.status !== "in_progress" && !shiftActive)}>{task.status === "in_progress" ? <Pause size={15} /> : <Play size={15} />}</Button><button className="expand-task" aria-label={`${expanded ? "Collapse" : "Expand"} ${task.title}`} onClick={() => setExpanded(!expanded)}><ChevronDown size={15} className={expanded ? "rotate-chevron" : ""} /></button></div>
    </div>
    {expanded ? <div className="task-details"><p className="task-description">{task.description || "No notes added yet."}</p>{task.steps.length ? <div className="step-list">{task.steps.map((step) => <label className={`step-row${step.completed ? " step-done" : ""}`} key={step.id}><Checkbox checked={step.completed} onCheckedChange={(value) => onStepChange(step.id, value === true)} aria-label={`Mark step ${step.title}`} /><span>{step.title}</span></label>)}</div> : null}<form className="add-step-row" onSubmit={submitStep}><Input value={stepDraft} onChange={(event) => setStepDraft(event.target.value)} aria-label={`Add a checklist step to ${task.title}`} placeholder="Add a step…" /><Button variant="ghost" size="icon" type="submit" aria-label="Add checklist step" disabled={!stepDraft.trim()}><Plus size={16} /></Button></form>{attachments.length ? <div className="task-attachments">{attachments.map((attachment) => <button key={attachment.id} onClick={() => onAttachment(attachment.id)}><FileImage size={14} />{attachment.file_name}</button>)}</div> : null}<label className="task-attach"><ImagePlus size={14} /> Attach evidence<input type="file" accept="image/*" aria-label={`Attach evidence to ${task.title}`} onChange={(event) => { const file = event.target.files?.[0]; if (file) onPaste(file); event.target.value = ""; }} /></label></div> : null}
  </article>;
}

function MeetingRow({ meeting, now }: { meeting: Meeting; now: Date }) {
  const delta = new Date(meeting.starts_at).getTime() - now.getTime();
  return <div className={`meeting-row${delta <= 0 ? " meeting-past" : ""}`}><div className="meeting-time">{formatClock(new Date(meeting.starts_at), "America/New_York")}<small>ET</small></div><div className="meeting-marker"><span /></div><div className="meeting-detail"><strong>{meeting.title}</strong><span>{meeting.client_name || "Client"}{meeting.source === "outlook" ? " · Outlook" : ""}</span>{meeting.action_items.length ? <small><Check size={12} /> {meeting.action_items.length} action items</small> : null}</div><span className="meeting-duration">{meeting.ends_at ? formatClock(new Date(meeting.ends_at), "America/New_York") : ""}</span></div>;
}

function PlannerSection({ userId, now, projects, tasks, meetings, templates, bucket, setBucket, busy, onRun, onModal, onDataChange, onTaskTimer, shiftState }: {
  userId: string; now: Date; projects: Project[]; tasks: Task[]; meetings: Meeting[]; templates: WorkflowTemplate[]; bucket: PlanBucket;
  setBucket: (bucket: PlanBucket) => void; busy: boolean; onRun: (action: () => Promise<unknown>, text?: string) => Promise<void>;
  onModal: (modal: Modal) => void; onDataChange: () => Promise<void>; onTaskTimer: (task: Task) => void; shiftState: ReturnType<typeof getShiftState>;
}) {
  const [query, setQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateSteps, setTemplateSteps] = useState("");
  const [selectedProject, setSelectedProject] = useState("");
  const [templateOpen, setTemplateOpen] = useState(false);
  const [quickTask, setQuickTask] = useState("");
  const [quickBucket, setQuickBucket] = useState<PlanBucket>("tonight");
  const [quickProject, setQuickProject] = useState("");
  const [quickSteps, setQuickSteps] = useState("");
  const [showQuickSteps, setShowQuickSteps] = useState(false);
  const visibleTasks = tasks.filter((task) => task.planning_bucket === bucket && task.status !== "done")
    .filter((task) => projectFilter === "all" || task.project_id === projectFilter)
    .filter((task) => `${task.title} ${task.description}`.toLowerCase().includes(query.toLowerCase()));
  const archived = useMemo(() => projects.filter((project) => project.archived_at), [projects]);
  const visibleProjects = projects.filter((project) => Boolean(project.archived_at) === showArchived);

  async function submitQuickTask(event: FormEvent) {
    event.preventDefault();
    const title = quickTask.trim();
    if (!title) return;
    const plan = quickBucket === "tonight" ? getShiftState(now) === "active" : true;
    if (!plan && quickBucket === "tonight") {
      toast.error("Tonight's queue is available only during your 5:30 PM–3:30 AM IST shift.");
      return;
    }
    const plannedDate = quickBucket === "tonight" ? getShiftDateKey(now) : quickBucket === "tomorrow" ? getShiftDateKeyFromStart(getNextShiftDate(now)) : null;
    const parsedSteps = quickSteps.split("\n").map((step) => step.trim()).filter(Boolean);
    await onRun(async () => {
      await createTask(userId, {
        title, description: "", project_id: quickProject || null, planning_bucket: quickBucket, planned_date: plannedDate,
        priority: "normal", steps: parsedSteps, shift_id: quickBucket === "tonight" ? null : null,
      });
      setQuickTask(""); setQuickSteps(""); setShowQuickSteps(false);
    }, "Task added");
  }

  async function saveTemplate(event: FormEvent) {
    event.preventDefault();
    const name = templateName.trim();
    if (!name) return;
    const steps = templateSteps.split("\n").map((step) => step.trim()).filter(Boolean);
    await onRun(async () => {
      await createTemplate(userId, { name, project_id: selectedProject || null, steps });
      setTemplateName(""); setTemplateSteps(""); setTemplateOpen(false);
    }, "Workflow saved");
  }

  async function startFromTemplate(template: WorkflowTemplate) {
    await onRun(async () => {
      const shiftDate = bucket === "tonight" && shiftState === "active" ? getShiftDateKey(now) : bucket === "tomorrow" ? getShiftDateKeyFromStart(getNextShiftDate(now)) : null;
      await createTask(userId, {
        title: template.name, description: "", project_id: template.project_id, planning_bucket: bucket,
        planned_date: shiftDate, priority: "normal", steps: template.steps, shift_id: null,
      });
    }, "Task started from workflow");
  }

  async function archiveProject(project: Project, archivedAt: string | null) {
    await onRun(() => saveProject(userId, project.id, { archived_at: archivedAt }), archivedAt ? "Project archived" : "Project restored");
    await onDataChange();
  }

  const projectTasks = (project: Project) => tasks.filter((task) => task.project_id === project.id && task.status !== "done").length;
  const projectMeetings = (project: Project) => meetings.filter((meeting) => meeting.project_id === project.id && new Date(meeting.starts_at) >= now).length;

  return <div className="content-wrap">
    <SectionHeading eyebrow="THE BIGGER PICTURE" title="Projects & planning" description="Keep client work in view and put every next step in its right place." action={<Button className="primary-action" onClick={() => onModal("project")}><Plus size={16} /> Add project</Button>} />
    <section className="quick-add-panel"><div className="quick-add-head"><div><div className="eyebrow"><WandSparkles size={13} /> QUICK ADD</div><strong>Put it somewhere useful.</strong></div><span>One line is enough</span></div>
      <form className="quick-add-form" onSubmit={submitQuickTask}><Input value={quickTask} onChange={(event) => setQuickTask(event.target.value)} aria-label="Task title" placeholder="e.g. Review the launch page before the client call" /><select value={quickBucket} onChange={(event) => setQuickBucket(event.target.value as PlanBucket)} aria-label="Planning window">{BUCKET_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select><select value={quickProject} onChange={(event) => setQuickProject(event.target.value)} aria-label="Client project"><option value="">Personal / no project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select><Button type="submit" disabled={!quickTask.trim() || busy}><Plus size={15} /> Add task</Button></form>
      <button className="quick-add-substeps-toggle" onClick={() => setShowQuickSteps(!showQuickSteps)}><ListChecks size={13} /> {showQuickSteps ? "Hide checklist" : "Add checklist steps"} <ChevronDown size={13} /></button>
      {showQuickSteps ? <Textarea className="quick-add-steps" aria-label="Checklist steps" value={quickSteps} onChange={(event) => setQuickSteps(event.target.value)} placeholder="One step per line" /> : null}
    </section>

    <div className="planner-bucket-tabs" role="tablist" aria-label="Planning horizon">{BUCKET_OPTIONS.map((option) => <button key={option.id} role="tab" aria-selected={bucket === option.id} onClick={() => setBucket(option.id)}>{option.label}<small>{tasks.filter((task) => task.planning_bucket === option.id && task.status !== "done").length}</small></button>)}</div>
    <div className="planner-filters"><div className="search-field"><Search size={15} /><Input aria-label="Search tasks" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks" /></div><select value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)} aria-label="Filter by project"><option value="all">All projects</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></div>
    {visibleTasks.length ? <div className="planner-task-list">{visibleTasks.map((task, index) => <TaskCard key={task.id} task={task} project={projects.find((project) => project.id === task.project_id)} index={index} now={now} shiftEnd={getShiftEnd(now)} shiftActive={shiftState === "active"} attachments={[]} busy={busy} onTimer={() => onTaskTimer(task)} onComplete={(checked) => void onRun(() => updateTask(userId, task.id, checked ? taskStatusChanges("done") : { status: "queued" }), checked ? "Task completed" : "Task reopened")} onStepChange={(stepId, checked) => void onRun(() => setStepComplete(userId, stepId, checked))} onAddStep={(title) => void onRun(() => addTaskStep(userId, task.id, title, task.steps.length), "Checklist item added")} onPaste={() => toast.error("Open this task in My Shift to attach evidence.")} onAttachment={() => undefined} />)}</div> : <div className="empty-planner"><div className="empty-mark"><CalendarDays size={21} /></div><h3>Nothing on the board.</h3><p>Tasks you put in {BUCKET_COPY[bucket].toLowerCase()} will land here.</p><Button variant="outline" onClick={() => document.querySelector<HTMLInputElement>('[aria-label="Task title"]')?.focus()}><Plus size={15} /> Add one above</Button></div>}

    <div className="planner-divider" />
    <div className="directory-head"><div><div className="eyebrow">CLIENT DIRECTORY</div><h2>Projects <span className="count-badge">{visibleProjects.length}</span></h2></div><div className="inline-actions"><button className="archive-toggle" onClick={() => setShowArchived(!showArchived)}><Archive size={14} /> {showArchived ? "Active" : "Archived"} <span>{showArchived ? archived.length : ""}</span></button><Button variant="outline" size="sm" onClick={() => onModal("project")}><Plus size={15} /> New project</Button></div></div>
    {visibleProjects.length ? <div className="project-directory">{visibleProjects.map((project, index) => <article className="project-card" key={project.id}><div className="project-card-top"><span className={`project-monogram ${BRAND_MARKS[index % BRAND_MARKS.length]}`}>{project.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span><div className="project-card-title"><strong>{project.name}</strong><span>{project.client_name || "Client details not set"}</span></div><Button variant="ghost" size="icon" aria-label={`${project.archived_at ? "Restore" : "Archive"} ${project.name}`} title={project.archived_at ? "Restore project" : "Archive project"} disabled={busy} onClick={() => void archiveProject(project, project.archived_at ? null : new Date().toISOString())}>{project.archived_at ? <ArrowDownToLine size={15} /> : <Archive size={15} />}</Button></div><div className="project-attrs"><span><Users size={13} /> {project.client_name || "Unassigned client"}</span><span><Clock3 size={13} /> {project.timezone.replaceAll("_", " ")}</span></div>{project.domain_rules.length ? <div className="domain-tags">{project.domain_rules.map((rule) => <span key={rule}>{rule}</span>)}</div> : <p className="domain-empty">No email-domain rules added</p>}<div className="project-card-footer"><span><ListChecks size={13} /> {projectTasks(project)} open</span><span><CalendarDays size={13} /> {projectMeetings(project)} upcoming</span><span className="project-swatch" /></div></article>)}</div> : <div className="empty-directory"><FolderKanban size={22} /><span><strong>{showArchived ? "No archived projects" : "Your client directory is empty."}</strong><small>{showArchived ? "Archived projects appear here." : "Add a project to group tasks, time zones, and client context."}</small></span><Button variant="outline" size="sm" onClick={() => onModal("project")}><Plus size={14} /> Add project</Button></div>}

    <div className="planner-divider" />
    <div className="directory-head"><div><div className="eyebrow">REPEATABLE WORK</div><h2>Workflow templates <span className="count-badge">{templates.length}</span></h2></div><Button variant="outline" size="sm" onClick={() => setTemplateOpen(!templateOpen)}><Plus size={15} /> New template</Button></div>
    {templateOpen ? <form className="template-form" onSubmit={(event) => void saveTemplate(event)}><Input aria-label="Workflow name" value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="Workflow name" required /><select aria-label="Workflow project" value={selectedProject} onChange={(event) => setSelectedProject(event.target.value)}><option value="">Any project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select><Textarea aria-label="Workflow steps" value={templateSteps} onChange={(event) => setTemplateSteps(event.target.value)} placeholder="One checklist step per line" /><div className="inline-actions"><Button type="button" variant="ghost" onClick={() => setTemplateOpen(false)}>Cancel</Button><Button type="submit" disabled={!templateName.trim() || busy}>Save workflow</Button></div></form> : null}
    {templates.length ? <div className="template-list">{templates.map((template) => <div className="template-row" key={template.id}><span className="template-icon"><ListChecks size={16} /></span><div><strong>{template.name}</strong><small>{template.steps.length} checklist steps · {projects.find((project) => project.id === template.project_id)?.name ?? "Any project"}</small></div><Button variant="outline" size="sm" onClick={() => void startFromTemplate(template)} disabled={busy}>Use for {BUCKET_COPY[bucket].toLowerCase()}<ArrowRight size={14} /></Button></div>)}</div> : <div className="empty-template"><WandSparkles size={17} /><span>Saved checklists are ready when you have a process to repeat.</span></div>}
  </div>;
}

function ArchiveSection({ data, now, month, setMonth, day, setDay, search, setSearch, onAttachment }: {
  data: TrackerData; now: Date; month: Date; setMonth: (date: Date) => void; day: string | null; setDay: (date: string | null) => void; search: string; setSearch: (query: string) => void; onAttachment: (id: string) => void;
}) {
  const monthStart = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1, 12));
  const year = monthStart.getUTCFullYear();
  const monthIndex = monthStart.getUTCMonth();
  const firstWeekday = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const days = Array.from({ length: firstWeekday + daysInMonth }, (_, index) => index < firstWeekday ? null : index - firstWeekday + 1);
  const shiftDayKeys = new Set(data.shifts.map((shift) => shift.shift_date));
  const taskCountByDay = new Map<string, number>();
  for (const task of data.tasks) {
    if (!task.planned_date) continue;
    taskCountByDay.set(task.planned_date, (taskCountByDay.get(task.planned_date) ?? 0) + 1);
  }
  const activeDay = day ?? (monthIndex === now.getMonth() && year === now.getFullYear() ? getShiftDateKey(now) : null);
  const selectedShift = data.shifts.find((shift) => shift.shift_date === activeDay);
  const visibleTasks = data.tasks.filter((task) => !activeDay || task.planned_date === activeDay || task.shift_id === selectedShift?.id);
  const visibleMeetings = data.meetings.filter((meeting) => !activeDay || getShiftDateKey(new Date(meeting.starts_at)) === activeDay);
  const visibleAttachments = data.attachments.filter((attachment) => !activeDay || attachment.shift_id === selectedShift?.id || attachment.task_id && visibleTasks.some((task) => task.id === attachment.task_id));
  const query = search.trim().toLowerCase();
  const searchedTasks = query ? data.tasks.filter((task) => `${task.title} ${task.description} ${task.steps.map((step) => step.title).join(" ")}`.toLowerCase().includes(query)) : [];
  const searchedMeetings = query ? data.meetings.filter((meeting) => `${meeting.title} ${meeting.client_name} ${meeting.notes} ${meeting.agenda} ${meeting.dossier} ${meeting.action_items.join(" ")}`.toLowerCase().includes(query)) : [];
  const searchedAttachments = query ? data.attachments.filter((attachment) => `${attachment.file_name} ${attachment.note} ${attachment.ocr_text}`.toLowerCase().includes(query)) : [];
  const visibleDatedTasks = visibleTasks.filter((task) => !query || `${task.title} ${task.description} ${task.steps.map((step) => step.title).join(" ")}`.toLowerCase().includes(query));
  const visibleDatedMeetings = visibleMeetings.filter((meeting) => !query || `${meeting.title} ${meeting.client_name} ${meeting.notes} ${meeting.agenda} ${meeting.dossier} ${meeting.action_items.join(" ")}`.toLowerCase().includes(query));
  const visibleDatedAttachments = visibleAttachments.filter((attachment) => !query || `${attachment.file_name} ${attachment.note} ${attachment.ocr_text}`.toLowerCase().includes(query));
  const selectedDate = activeDay ? new Date(`${activeDay}T12:00:00`) : null;
  return <div className="content-wrap">
    <SectionHeading eyebrow="THE RECORD, NOT JUST THE RESULT" title="Archive & audit" description="Replay a shift, revisit the notes, and find a detail across your saved work." />
    <section className="archive-search"><Search size={17} /><Input aria-label="Search tasks, meeting notes, and evidence" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tasks, meeting notes, and saved evidence…" /><span><Command size={12} /> K</span></section>
    {query ? <div className="global-search-results"><div className="eyebrow">SEARCH RESULTS · {searchedTasks.length + searchedMeetings.length + searchedAttachments.length}</div>{searchedTasks.map((task) => <div className="search-result" key={`task-${task.id}`}><ListChecks size={16} /><div><strong>{task.title}</strong><small>Task · {task.planned_date ?? "No shift date"} · {task.status.replace("_", " ")}</small></div></div>)}{searchedMeetings.map((meeting) => <div className="search-result" key={`meeting-${meeting.id}`}><CalendarDays size={16} /><div><strong>{meeting.title}</strong><small>Meeting · {formatDateLabel(new Date(meeting.starts_at), "Asia/Kolkata")} · {meeting.notes || meeting.client_name || "No notes"}</small></div></div>)}{searchedAttachments.map((attachment) => <button className="search-result" key={`attachment-${attachment.id}`} onClick={() => onAttachment(attachment.id)}><FileImage size={16} /><span><strong>{attachment.file_name}</strong><small>Evidence · {attachment.note || attachment.ocr_text || "No note"}</small></span></button>)}{!searchedTasks.length && !searchedMeetings.length && !searchedAttachments.length ? <div className="empty-search">No matching tasks, notes, or evidence.</div> : null}</div> : <div className="archive-layout">
      <section className="calendar-panel"><div className="calendar-heading"><div><div className="eyebrow">SHIFT CALENDAR</div><h2>{new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(monthStart)}</h2></div><div className="calendar-nav"><Button variant="ghost" size="icon" aria-label="Previous month" onClick={() => setMonth(new Date(Date.UTC(year, monthIndex - 1, 1, 12)))}><ChevronDown size={16} className="rotate-left" /></Button><Button variant="ghost" size="icon" aria-label="Next month" onClick={() => setMonth(new Date(Date.UTC(year, monthIndex + 1, 1, 12)))}><ChevronDown size={16} className="rotate-right" /></Button></div></div><div className="calendar-grid calendar-weekdays">{["SU", "MO", "TU", "WE", "TH", "FR", "SA"].map((label) => <span key={label}>{label}</span>)}</div><div className="calendar-grid">{days.map((date, index) => { const dateKey = date === null ? null : getShiftDateKeyFromCivilDate(year, monthIndex, date); const hasShift = dateKey !== null && shiftDayKeys.has(dateKey); const count = dateKey ? taskCountByDay.get(dateKey) ?? 0 : 0; const isSelected = dateKey === activeDay; return date === null ? <span className="calendar-blank" key={`empty-${index}`} /> : <button key={dateKey} className={`calendar-day${isSelected ? " calendar-selected" : ""}${hasShift ? " has-shift" : ""}`} onClick={() => setDay(isSelected ? null : dateKey)} aria-label={`${dateKey}${hasShift ? ", saved shift" : ""}`} aria-pressed={isSelected}><span>{date}</span>{hasShift || count ? <i>{count || "·"}</i> : null}</button>; })}</div><div className="calendar-legend"><span><i className="legend-shift" /> Saved shift</span><span><i className="legend-task" /> Tasks</span></div></section>
      <section className="replay-panel"><div className="eyebrow">SHIFT REPLAY</div><h2>{selectedDate ? formatDateLabel(selectedDate, "Asia/Kolkata") : "Choose a day to replay"}</h2>{selectedDate ? <><div className="replay-time"><Clock3 size={14} /> 5:30 PM – 3:30 AM IST <span>·</span> 12:00 PM – 10:00 PM ET*</div><div className="replay-section"><div className="replay-heading"><ListChecks size={15} /> TASKS <span>{visibleDatedTasks.length}</span></div>{visibleDatedTasks.length ? visibleDatedTasks.map((task) => <div className="replay-task" key={task.id}><span className={`replay-check${task.status === "done" ? " done" : ""}`}>{task.status === "done" ? <Check size={11} /> : null}</span><span><strong>{task.title}</strong><small>{task.status.replace("_", " ")} · {relativeDuration(task.elapsed_seconds)}{task.rollover ? " · rolled over" : ""}</small></span></div>) : <p className="replay-empty">No saved tasks for this shift.</p>}</div><div className="replay-section"><div className="replay-heading"><CalendarDays size={15} /> MEETINGS <span>{visibleDatedMeetings.length}</span></div>{visibleDatedMeetings.length ? visibleDatedMeetings.map((meeting) => <div className="replay-meeting" key={meeting.id}><strong>{meeting.title}</strong><small>{formatClock(new Date(meeting.starts_at), "America/New_York")} ET · {meeting.client_name || "Client"}</small>{meeting.notes ? <p>{meeting.notes}</p> : null}{meeting.action_items.length ? <ul>{meeting.action_items.map((item) => <li key={item}>{item}</li>)}</ul> : null}</div>) : <p className="replay-empty">No meeting notes saved.</p>}</div><div className="replay-section"><div className="replay-heading"><FileImage size={15} /> ATTACHMENTS <span>{visibleDatedAttachments.length}</span></div>{visibleDatedAttachments.length ? visibleDatedAttachments.map((attachment) => <button className="replay-attachment" key={attachment.id} onClick={() => onAttachment(attachment.id)}><FileImage size={15} /><span><strong>{attachment.file_name}</strong><small>{attachment.note || attachment.ocr_text || "Saved evidence"}</small></span><ArrowRight size={14} /></button>) : <p className="replay-empty">No saved evidence for this shift.</p>}</div>{selectedShift?.wrap_up ? <div className="replay-wrap"><div className="eyebrow">SHIFT WRAP-UP</div><p>{selectedShift.wrap_up}</p></div> : null}<p className="archive-note">*New York offset changes with daylight saving time.</p></> : <div className="replay-empty large"><History size={21} /><span>Select a calendar date to inspect its shift record.</span></div>}</section>
    </div>}
  </div>;
}

function ModalShell({ title, description, onClose, children, className = "" }: { title: string; description: string; onClose: () => void; children: ReactNode; className?: string }) {
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className={`modal-panel ${className}`} role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-heading"><div><div className="eyebrow">NIGHTSHIFT · PRIVATE WORKSPACE</div><h2 id="modal-title">{title}</h2><p>{description}</p></div><Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}><X size={17} /></Button></div>{children}</section></div>;
}

function ProjectModal({ userId, onClose, onSave }: { userId: string; onClose: () => void; onSave: (project: Omit<Project, "id" | "archived_at">) => Promise<void> }) {
  const [name, setName] = useState(""); const [client, setClient] = useState(""); const [timezone, setTimezone] = useState("America/New_York"); const [domains, setDomains] = useState(""); const [notes, setNotes] = useState(""); const [saving, setSaving] = useState(false);
  const save = async (event: FormEvent) => { event.preventDefault(); if (!name.trim()) return; setSaving(true); try { await onSave({ name: name.trim(), client_name: client.trim(), timezone, domain_rules: domains.split(/[\s,;]+/).map((domain) => domain.trim().toLowerCase()).filter(Boolean), notes: notes.trim(), color: "mint" }); } finally { setSaving(false); } };
  return <ModalShell title="New client project" description="Keep a client’s time zone and sender domains close to their work." onClose={onClose}><form className="modal-form" onSubmit={save}><label className="field-label" htmlFor="project-name">Project name</label><Input id="project-name" autoFocus required value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Site refresh" /><label className="field-label" htmlFor="project-client">Client or company</label><Input id="project-client" value={client} onChange={(event) => setClient(event.target.value)} placeholder="Company name" /><label className="field-label" htmlFor="project-zone">Client time zone</label><select id="project-zone" value={timezone} onChange={(event) => setTimezone(event.target.value)}><option value="America/New_York">America / New York</option><option value="America/Chicago">America / Chicago</option><option value="America/Denver">America / Denver</option><option value="America/Los_Angeles">America / Los Angeles</option><option value="Europe/London">Europe / London</option><option value="Europe/Berlin">Europe / Berlin</option><option value="Asia/Kolkata">Asia / Kolkata</option><option value="Asia/Singapore">Asia / Singapore</option></select><label className="field-label" htmlFor="project-domains">Client email domains</label><Input id="project-domains" value={domains} onChange={(event) => setDomains(event.target.value)} placeholder="client.com, studio.co" /><small className="field-helper">Separate domains with commas or spaces.</small><label className="field-label" htmlFor="project-notes">Client context</label><Textarea id="project-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Useful preferences or working notes" /><div className="modal-actions"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving || !name.trim()}>{saving ? <LoaderCircle size={15} className="spin" /> : <Plus size={15} />} Create project</Button></div></form></ModalShell>;
}

function MeetingModal({ userId, shiftId, projects, onClose, onSave }: { userId: string; shiftId: string | null; projects: Project[]; onClose: () => void; onSave: (meeting: Omit<Meeting, "id" | "source">) => Promise<void> }) {
  const [title, setTitle] = useState(""); const [client, setClient] = useState(""); const [projectId, setProjectId] = useState(""); const [starts, setStarts] = useState(""); const [ends, setEnds] = useState(""); const [agenda, setAgenda] = useState(""); const [dossier, setDossier] = useState(""); const [saving, setSaving] = useState(false);
  const save = async (event: FormEvent) => { event.preventDefault(); if (!title.trim() || !starts) return; setSaving(true); try { await onSave({ shift_id: shiftId, project_id: projectId || null, title: title.trim(), client_name: client.trim(), starts_at: istDateTimeInputToIso(starts), ends_at: ends ? istDateTimeInputToIso(ends) : null, agenda: agenda.trim(), dossier: dossier.trim(), notes: "", action_items: [], }); } finally { setSaving(false); } };
  return <ModalShell title="Add a meeting" description="Add it in IST; it will also show its local time in New York." onClose={onClose}><form className="modal-form" onSubmit={save}><label className="field-label" htmlFor="meeting-title">Meeting</label><Input id="meeting-title" autoFocus required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Weekly project review" /><label className="field-label" htmlFor="meeting-client">Client</label><Input id="meeting-client" value={client} onChange={(event) => setClient(event.target.value)} placeholder="Client or company" /><label className="field-label" htmlFor="meeting-project">Project</label><select id="meeting-project" value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">No project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select><div className="form-split"><label className="field-label" htmlFor="meeting-start">Starts · IST<input id="meeting-start" type="datetime-local" required value={starts} onChange={(event) => setStarts(event.target.value)} /></label><label className="field-label" htmlFor="meeting-end">Ends · IST<input id="meeting-end" type="datetime-local" value={ends} onChange={(event) => setEnds(event.target.value)} /></label></div><label className="field-label" htmlFor="meeting-agenda">Agenda</label><Textarea id="meeting-agenda" value={agenda} onChange={(event) => setAgenda(event.target.value)} placeholder="Topics to cover" /><label className="field-label" htmlFor="meeting-dossier">Pre-meeting dossier</label><Textarea id="meeting-dossier" value={dossier} onChange={(event) => setDossier(event.target.value)} placeholder="Client context, recent work, or questions" /><div className="modal-actions"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving || !title.trim() || !starts}>{saving ? <LoaderCircle size={15} className="spin" /> : <CalendarDays size={15} />} Save meeting</Button></div></form></ModalShell>;
}

function TaskModal({ userId, shiftId, projects, templates, defaultBucket, onClose, onSave }: { userId: string; shiftId: string | null; projects: Project[]; templates: WorkflowTemplate[]; defaultBucket: PlanBucket; onClose: () => void; onSave: (task: { title: string; description: string; project_id: string | null; planning_bucket: PlanBucket; planned_date: string | null; priority: TaskPriority; steps: string[]; shift_id: string | null }) => Promise<void> }) {
  const [title, setTitle] = useState(""); const [description, setDescription] = useState(""); const [projectId, setProjectId] = useState(""); const [bucket, setBucket] = useState(defaultBucket); const [priority, setPriority] = useState<TaskPriority>("normal"); const [steps, setSteps] = useState(""); const [templateId, setTemplateId] = useState(""); const [saving, setSaving] = useState(false);
  function useWorkflow(id: string) { setTemplateId(id); const template = templates.find((item) => item.id === id); if (template) { setTitle(template.name); setProjectId(template.project_id ?? ""); setSteps(template.steps.join("\n")); } }
  const save = async (event: FormEvent) => { event.preventDefault(); if (!title.trim()) return; setSaving(true); const plannedDate = bucket === "tonight" ? getShiftDateKey(new Date()) : bucket === "tomorrow" ? getShiftDateKeyFromStart(getNextShiftDate(new Date())) : null; try { await onSave({ title: title.trim(), description: description.trim(), project_id: projectId || null, planning_bucket: bucket, planned_date: plannedDate, priority, steps: steps.split("\n").map((step) => step.trim()).filter(Boolean), shift_id: bucket === "tonight" ? shiftId : null }); } finally { setSaving(false); } };
  return <ModalShell title="Add to tonight" description="Add a focused task and the checklist steps that move it forward." onClose={onClose}><form className="modal-form" onSubmit={save}><label className="field-label" htmlFor="task-title">Task</label><Input id="task-title" autoFocus required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What needs to get done?" /><label className="field-label" htmlFor="task-notes">Notes</label><Textarea id="task-notes" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Context, handoff, or definition of done" /><div className="form-split"><label className="field-label" htmlFor="task-project">Project<select id="task-project" value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">Personal / no project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label className="field-label" htmlFor="task-bucket">Plan<select id="task-bucket" value={bucket} onChange={(event) => setBucket(event.target.value as PlanBucket)}>{BUCKET_OPTIONS.map((option) => <option value={option.id} key={option.id}>{option.label}</option>)}</select></label></div><div className="form-split"><label className="field-label" htmlFor="task-priority">Priority<select id="task-priority" value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}><option value="normal">Normal</option><option value="high">High</option><option value="low">Low</option></select></label>{templates.length ? <label className="field-label" htmlFor="task-template">Use workflow<select id="task-template" value={templateId} onChange={(event) => useWorkflow(event.target.value)}><option value="">Start fresh</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label> : <span />}</div><label className="field-label" htmlFor="task-steps">Checklist <small>One step per line</small></label><Textarea id="task-steps" value={steps} onChange={(event) => setSteps(event.target.value)} placeholder="Gather references\nDraft the update\nSend for review" /><div className="modal-actions"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving || !title.trim()}>{saving ? <LoaderCircle size={15} className="spin" /> : <Plus size={15} />} Add task</Button></div></form></ModalShell>;
}

function WrapModal({ shift, tasks, seconds, onClose, onSave, onCopy, busy }: { shift: Shift | null; tasks: Task[]; seconds: number; onClose: () => void; onSave: (text: string) => Promise<void>; onCopy: (target: "Slack" | "Teams") => void; busy: boolean }) {
  const [note, setNote] = useState(shift?.wrap_up ?? "");
  const completed = tasks.filter((task) => task.planning_bucket === "tonight" && task.status === "done");
  const pending = tasks.filter((task) => task.planning_bucket === "tonight" && task.status !== "done");
  const save = (event: FormEvent) => { event.preventDefault(); void onSave(note); };
  return <ModalShell title="Close the loop." description={`Your shift recap closes in ${relativeDuration(seconds)}. You can save early or leave this note for later.`} onClose={onClose} className="wrap-modal"><div className="wrap-countdown"><Timer size={16} /><span>60-SECOND WRAP-UP</span><strong>{String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}</strong></div><div className="wrap-tally"><div><CheckCircle2 size={16} /><strong>{completed.length} completed</strong></div><div><ArrowDownToLine size={16} /><strong>{pending.length} rolling over</strong></div></div><div className="wrap-task-summary"><div className="eyebrow">NEXT SHIFT</div>{pending.length ? pending.map((task) => <div key={task.id}><span className="replay-check" />{task.title}</div>) : <p>Your queue is clear for the next shift.</p>}</div><form className="modal-form" onSubmit={save}><label className="field-label" htmlFor="wrap-note">What should you remember?</label><Textarea id="wrap-note" autoFocus value={note} onChange={(event) => setNote(event.target.value)} placeholder="Handoff notes, blockers, or tomorrow's first move" /><div className="wrap-share"><span className="eyebrow">COPY A HANDOFF</span><div><Button type="button" variant="outline" size="sm" onClick={() => onCopy("Slack")}><Copy size={14} /> Slack</Button><Button type="button" variant="outline" size="sm" onClick={() => onCopy("Teams")}><Copy size={14} /> Teams</Button></div></div><div className="modal-actions"><Button type="button" variant="ghost" onClick={onClose}>Keep working</Button><Button type="submit" disabled={busy}>Save wrap-up</Button></div></form></ModalShell>;
}

function EvidenceDialog({ file, busy, onClose, onSave }: { file: File; busy: boolean; onClose: () => void; onSave: (file: File) => void }) {
  const [preview, setPreview] = useState(""); const [name, setName] = useState(file.name || "pasted-evidence.png"); const [redact, setRedact] = useState(false); const canvasRef = useRef<HTMLCanvasElement>(null); const imageRef = useRef<HTMLImageElement>(null); const objectUrl = useMemo(() => file.size ? URL.createObjectURL(file) : "", [file]);
  useEffect(() => () => { if (objectUrl) URL.revokeObjectURL(objectUrl); }, [objectUrl]);
  useEffect(() => { if (objectUrl) setPreview(objectUrl); }, [objectUrl]);
  function onMark(event: React.MouseEvent<HTMLCanvasElement>) { const canvas = canvasRef.current; const image = imageRef.current; if (!canvas || !image) return; const rect = canvas.getBoundingClientRect(); const ctx = canvas.getContext("2d"); if (!ctx) return; canvas.width = image.naturalWidth; canvas.height = image.naturalHeight; ctx.drawImage(image, 0, 0); const scaleX = image.naturalWidth / rect.width; const scaleY = image.naturalHeight / rect.height; const x = Math.max(0, (event.clientX - rect.left) * scaleX); const y = Math.max(0, (event.clientY - rect.top) * scaleY); ctx.fillStyle = redact ? "#161c1c" : "#c7efdf"; ctx.strokeStyle = "#161c1c"; ctx.lineWidth = Math.max(4, image.naturalWidth / 180); ctx.fillRect(x - ctx.lineWidth * 4, y - ctx.lineWidth * 2, ctx.lineWidth * 8, ctx.lineWidth * 4); ctx.strokeRect(x - ctx.lineWidth * 4, y - ctx.lineWidth * 2, ctx.lineWidth * 8, ctx.lineWidth * 4); canvas.toBlob((blob) => { if (blob) setPreview(URL.createObjectURL(blob)); }, "image/png"); }
  async function save() { const finalFile = canvasRef.current?.toBlob ? await new Promise<File>((resolve) => canvasRef.current?.toBlob((blob) => resolve(new File([blob ?? file], name, { type: "image/png" })), "image/png")) : file; onSave(finalFile); }
  return <ModalShell title="Save shift evidence" description="Mark a screenshot or cover a detail before saving it to private storage." onClose={onClose} className="evidence-modal"><div className="evidence-tools"><Button variant={redact ? "secondary" : "outline"} size="sm" onClick={() => setRedact(!redact)}><span className={`redact-swatch${redact ? " redact-active" : ""}`} />{redact ? "Redact marks" : "Highlight marks"}</Button><span>Click the image to mark a spot</span></div><div className="evidence-preview">{preview ? <><img ref={imageRef} src={preview} alt="Screenshot to save" onClick={onMark} /><canvas ref={canvasRef} hidden /></> : <div className="evidence-empty"><ImagePlus size={22} />Choose a screenshot from this device to save it.</div>}</div><label className="field-label" htmlFor="evidence-name">File name</label><Input id="evidence-name" value={name} onChange={(event) => setName(event.target.value)} /><div className="modal-actions"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={() => void save()} disabled={busy || !file.size || !name.trim()}><Upload size={15} /> Save privately</Button></div></ModalShell>;
}

function AttachmentDialog({ attachment, busy, onClose, onSaveNote, onDelete }: { attachment: Attachment; busy: boolean; onClose: () => void; onSaveNote: (note: string) => void; onDelete: () => void }) {
  const [note, setNote] = useState(attachment.note);
  return <ModalShell title={attachment.file_name} description="Private shift evidence. Signed previews expire; reopen the record to load a fresh one." onClose={onClose} className="attachment-modal">{attachment.previewUrl ? <div className="attachment-preview"><img src={attachment.previewUrl} alt={attachment.file_name} /></div> : <div className="attachment-unavailable"><FileImage size={23} /><span>Preview unavailable. Reload the page to request another private link.</span></div>}<label className="field-label" htmlFor="attachment-note">Note</label><Textarea id="attachment-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="What should this screenshot remind you of?" /><div className="modal-actions"><Button variant="ghost" onClick={onDelete} disabled={busy}><Trash2 size={14} /> Remove</Button><span /><Button variant="outline" onClick={onClose}>Close</Button><Button onClick={() => onSaveNote(note)} disabled={busy || note === attachment.note}>Save note</Button></div></ModalShell>;
}