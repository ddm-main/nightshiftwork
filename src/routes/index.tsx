import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowDownToLine, ArrowLeftRight, ArrowRight, Archive, CalendarDays, Check,
  CheckCircle2, ChevronDown, Clipboard, Clock3, Command, Copy, Download,
  FileImage, FolderKanban, Pencil, ImagePlus, ListChecks, LoaderCircle, LockKeyhole,
  LogOut, Pause, Play, Plus, Search, ShieldCheck,
  Sparkles, Trash2, Upload, Users, 
  Activity, Bell, SlidersHorizontal,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Toaster, toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ClockMenu } from "@/components/clock-menu";
import { MeetingDialog, MeetingsSection } from "@/components/meetings-section";
import { PlanBoard } from "@/components/plan-board";
import { PreferencesDialog } from "@/components/preferences";
import { ProjectsSection } from "@/components/projects-section";
import { TaskEditDialog, type TaskEdit } from "@/components/task-dialogs";
import { DEFAULT_PREFS, loadPrefs, savePrefs, type Prefs } from "@/lib/prefs";
import { plannedDateFor } from "@/lib/plan";
import { runningSeconds, totalSeconds } from "@/lib/timers";
import { BUCKET_COPY, BUCKET_OPTIONS, ModalShell, relativeDuration, shortDuration, timeLeftUntil, zoneAbbr } from "@/components/ui-kit";
import { auditToJson, downloadText, tasksToCsv } from "@/lib/export";
import { extractActionItems } from "@/lib/actions";
import { parseIcs } from "@/lib/ics";
import { parseQuickTask } from "@/lib/quick-add";
import {
  formatClock, formatDateLabel, getNextShiftDate, getShiftDateKey, getShiftDateKeyFromCivilDate,
  getShiftDateKeyFromStart, getShiftEnd, getShiftProgress, getShiftStart, getShiftState,
  istDateTimeInputToIso, nextGapChange, setClockFormat,
} from "@/lib/night-shift";
import {
  addTaskStep, removeTask, createMeeting, removeMeeting, saveMeeting, createProject, createTask, ensureShift,
  loadTrackerData, removeAttachment, saveShift,
  setStepComplete, taskStatusChanges, updateAttachment, updateTask, uploadEvidence, uploadReport,
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

type Section = "shift" | "meetings" | "projects" | "planner" | "archive";
type LoginMode = "sign-in" | "create";
type TrackerUser = { id: string; email?: string };
type Modal = "project" | "meeting" | "template" | "wrap" | null;

const EMPTY_DATA: TrackerData = { projects: [], tasks: [], meetings: [], templates: [], shifts: [], attachments: [] };

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
      <ParticleField enabled />
      <section className="auth-story">
        <div className="brand-row"><Logo size={30} /><span>Nightshift</span><span className="brand-separator">/</span><span className="brand-muted">Operations desk</span></div>
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
  const [shift, setShift] = useState<Shift | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [archiveMonth, setArchiveMonth] = useState(() => new Date());
  const [archiveDay, setArchiveDay] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [clientId, setClientIdState] = useState("");
  const [meetingDetailId, setMeetingDetailId] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [menu, setMenu] = useState<"bell" | "account" | null>(null);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [prefs, setPrefsState] = useState<Prefs>(DEFAULT_PREFS);
  useEffect(() => { setPrefsState(loadPrefs()); }, []);
  const setPrefs = (next: Prefs) => { setPrefsState(next); savePrefs(next); };
  setClockFormat({ hour12: prefs.hour12, seconds: prefs.seconds });
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [readNotices, setReadNotices] = useState<Record<string, string>>({});
  useEffect(() => { try { setReadNotices(JSON.parse(localStorage.getItem("ns-read-notices") ?? "{}") as Record<string, string>); } catch { /* ignore */ } }, []);
  const markRead = (entries: Array<{ id: string; text: string }>) => setReadNotices((current) => { const next = { ...current }; for (const entry of entries) next[entry.id] = entry.text; try { localStorage.setItem("ns-read-notices", JSON.stringify(next)); } catch { /* ignore */ } return next; });
  useEffect(() => {
    if (!menu) return;
    const close = (event: MouseEvent) => { if (!(event.target as HTMLElement).closest(".menu-wrap")) setMenu(null); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);
  useEffect(() => { try { setClientIdState(localStorage.getItem("ns-client") ?? ""); } catch { /* storage unavailable */ } }, []);
  const setClientId = (id: string) => { setClientIdState(id); try { localStorage.setItem("ns-client", id); } catch { /* ignore */ } };
  const [evidenceInput, setEvidenceInput] = useState<{ file: File; taskId: string | null } | null>(null);

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
  const isThisShift = (task: Task) => task.planned_date === currentShiftKey || (task.completed_at ?? "") >= shiftStart.toISOString();
  const tonightOpen = tasks.filter((task) => task.planning_bucket === "tonight" && task.status !== "done");
  const tonightDone = tasks.filter((task) => task.planning_bucket === "tonight" && task.status === "done" && isThisShift(task));
  const tonightTasks = [...tonightOpen, ...tonightDone];
  const openTonightCount = tonightOpen.length;
  const completedTonight = tonightDone.length;
  const upcomingMeetings = data.meetings.filter((meeting) => new Date(meeting.starts_at) >= shiftStart && new Date(meeting.starts_at) <= shiftEnd);
  const activeMeeting = upcomingMeetings.find((meeting) => new Date(meeting.starts_at).getTime() - now.getTime() <= 5 * 60_000 && new Date(meeting.starts_at) >= now);
  const nextShift = getNextShiftDate(now);
  const clientProject = projects.find((project) => project.id === clientId && !project.archived_at);
  const clientTz = clientProject?.timezone ?? "America/New_York";
  const gapChange = nextGapChange(now, clientTz);
  const minutesLeft = (shiftEnd.getTime() - now.getTime()) / 60_000;
  const wrapDue = shiftState === "active" && minutesLeft <= prefs.wrapLeadMin;
  const nextMeetingSoon = data.meetings.map((meeting) => ({ meeting, mins: (new Date(meeting.starts_at).getTime() - now.getTime()) / 60_000 })).filter((item) => item.mins > 0 && item.mins <= 30).sort((a, b) => a.mins - b.mins)[0];
  const noProjectCount = tasks.filter((task) => task.status !== "done" && !task.project_id).length;
  const blockedCount = tasks.filter((task) => task.status === "blocked").length;
  const highOpenTonight = tonightOpen.filter((task) => task.priority === "high").length;
  const notices: Array<{ id: string; tone: "alert" | "warn" | "info"; text: string; go?: () => void }> = [];
  if (wrapDue) notices.push({ id: "wrap", tone: "alert", text: `Shift ends in ${Math.max(1, Math.round(minutesLeft))} min — wrap up`, go: () => setModal("wrap") });
  if (nextMeetingSoon) notices.push({ id: "meeting", tone: "info", text: `${nextMeetingSoon.meeting.title} starts in ${Math.max(1, Math.round(nextMeetingSoon.mins))} min`, go: () => setMeetingDetailId(nextMeetingSoon.meeting.id) });
  if (blockedCount) notices.push({ id: "blocked", tone: "warn", text: `${blockedCount} blocked task${blockedCount === 1 ? "" : "s"} need attention`, go: () => setActiveSection("shift") });
  if (highOpenTonight) notices.push({ id: "high", tone: "warn", text: `${highOpenTonight} high-priority task${highOpenTonight === 1 ? "" : "s"} still open tonight`, go: () => setActiveSection("shift") });
  if (noProjectCount) notices.push({ id: "noproject", tone: "warn", text: `${noProjectCount} open task${noProjectCount === 1 ? "" : "s"} have no project`, go: () => setActiveSection("planner") });
  if (gapChange) notices.push({ id: "dst", tone: "info", text: `US time change in ${gapChange.inDays} days: gap ${gapChange.from}→${gapChange.to}h` });
  if (!projects.some((project) => !project.archived_at)) notices.push({ id: "firstproject", tone: "info", text: "Create your first client project", go: () => setActiveSection("projects") });
  const unreadNotices = notices.filter((notice) => readNotices[notice.id] !== notice.text);
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
    if (task.status === "in_progress") {
      await runAction(() => updateTask(user.id, task.id, { status: "queued", started_at: null, elapsed_seconds: task.elapsed_seconds + runningSeconds(task, now) }), "Timer paused");
      return;
    }
    if (shiftState !== "active") {
      toast.error("Task timers run only during 5:30 PM–3:30 AM IST.");
      return;
    }
    await runAction(async () => {
      if (prefs.singleTimer) {
        for (const other of tasks.filter((item) => item.status === "in_progress" && item.id !== task.id)) {
          await updateTask(user.id, other.id, { status: "queued", started_at: null, elapsed_seconds: other.elapsed_seconds + runningSeconds(other, now) });
        }
      }
      if (!shift.started_at) await saveShift(user.id, shift.id, { started_at: shiftStart.toISOString() });
      await updateTask(user.id, task.id, { status: "in_progress", started_at: now.toISOString(), shift_id: shift.id, planning_bucket: "tonight" });
    }, "Timer started");
  }

  async function handleTaskComplete(task: Task, checked: boolean) {
    if (!user) return;
    await runAction(() => updateTask(user.id, task.id, checked
      ? { ...taskStatusChanges("done"), started_at: null, elapsed_seconds: task.elapsed_seconds + runningSeconds(task, now) }
      : { status: "queued", completed_at: null }), checked ? "Task completed" : "Task reopened");
  }

  async function editTask(task: Task, changes: TaskEdit) {
    if (!user) return;
    const earned = runningSeconds(task, now);
    const bucketChanged = changes.planning_bucket !== task.planning_bucket;
    const statusPart = changes.status === "done"
      ? { ...taskStatusChanges("done"), started_at: null, elapsed_seconds: task.elapsed_seconds + earned }
      : changes.status === "blocked"
        ? { status: "blocked" as const, started_at: null, completed_at: null, elapsed_seconds: task.elapsed_seconds + earned }
        : task.status === "in_progress" ? {} : { status: "queued" as const, completed_at: null };
    await runAction(() => updateTask(user.id, task.id, {
      title: changes.title, description: changes.description, project_id: changes.project_id, priority: changes.priority, planning_bucket: changes.planning_bucket,
      ...(bucketChanged ? { planned_date: plannedDateFor(changes.planning_bucket, now) } : {}), ...statusPart,
    }), "Task updated");
  }

  async function deleteTask(task: Task) {
    if (!user) return;
    await runAction(() => removeTask(user.id, task.id), "Task deleted");
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

  async function saveMeetingFile(meeting: Meeting, file: File) {
    if (!user) return;
    await runAction(async () => {
      const added = await uploadEvidence(user.id, shift?.id ?? null, null, file, { bucket: "meeting-assets", meetingId: meeting.id });
      setData((current) => ({ ...current, attachments: [added, ...current.attachments] }));
    }, "Meeting file saved privately");
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
      await uploadReport(user.id, shift.id, `handover-${shift.shift_date}.md`, handoverText("Slack", text)).catch(() => toast.warning("Saved, but the report file could not be stored"));
      setModal(null);
    }, "Shift wrapped up");
  }

  async function pullTask(task: Task) {
    if (!user) return;
    await runAction(() => updateTask(user.id, task.id, { planning_bucket: "tonight", planned_date: getShiftDateKey(now) }), "Moved to tonight");
  }

  async function quickAddTask(text: string, projectId: string, priority: TaskPriority) {
    if (!user) return;
    const parsed = parseQuickTask(text, projects, "tonight");
    if (!parsed.title) { toast.error("Add a task title first."); return; }
    const chosenProject = parsed.projectId ?? (projectId || null);
    if (!chosenProject) { toast.error("Choose a project for this task."); return; }
    const plannedDate = parsed.bucket === "tonight" ? getShiftDateKey(now) : parsed.bucket === "tomorrow" ? getShiftDateKeyFromStart(getNextShiftDate(now)) : null;
    await runAction(() => createTask(user.id, { title: parsed.title, description: "", project_id: chosenProject, planning_bucket: parsed.bucket, planned_date: plannedDate, priority: parsed.priority !== "normal" ? parsed.priority : priority, steps: parsed.steps, shift_id: null }), `Added to ${BUCKET_COPY[parsed.bucket].toLowerCase()}`);
  }

  async function tasksFromItems(items: string[], projectId: string | null) {
    if (!user || !items.length) return;
    const chosenProject = projectId ?? clientProject?.id ?? null;
    if (!chosenProject) { toast.error("Choose an active client (top bar) so these tasks have a project."); return; }
    await runAction(async () => {
      for (const title of items) {
        await createTask(user.id, { title, description: "", project_id: chosenProject, planning_bucket: "tonight", planned_date: getShiftDateKey(now), priority: "normal", steps: [], shift_id: null });
      }
    }, `${items.length} task${items.length === 1 ? "" : "s"} added to tonight`);
  }

  async function importIcs(file: File) {
    if (!user) return;
    const events = parseIcs(await file.text());
    if (!events.length) { toast.error("No events found in that .ics file."); return; }
    const known = new Set(data.meetings.map((meeting) => `${meeting.title}|${new Date(meeting.starts_at).toISOString()}`));
    const fresh = events.filter((event) => !known.has(`${event.title}|${event.startsAt}`));
    await runAction(async () => {
      for (const event of fresh) {
        await createMeeting(user.id, { shift_id: shift?.id ?? null, project_id: clientProject?.id ?? null, title: event.title, client_name: clientProject?.client_name ?? "", starts_at: event.startsAt, ends_at: event.endsAt, agenda: "", dossier: event.description, notes: "", action_items: [] });
      }
    }, fresh.length ? `${fresh.length} meeting${fresh.length === 1 ? "" : "s"} imported` : "Everything in that file is already imported");
  }

  async function saveMeetingDetail(meetingId: string, changes: Partial<Meeting>) {
    if (!user) return;
    await runAction(() => saveMeeting(user.id, meetingId, changes), "Meeting saved");
  }

  async function deleteMeeting(meeting: Meeting) {
    if (!user) return;
    await runAction(() => removeMeeting(user.id, meeting.id), "Meeting deleted");
  }

  function handoverText(target: "Slack" | "Teams" | "Email" | "Client", wrapNote = shift?.wrap_up ?? "") {
    const tonight = tonightTasks;
    const done = tonight.filter((task) => task.status === "done");
    const blocked = tonight.filter((task) => task.status === "blocked");
    const next = tonight.filter((task) => task.status !== "done" && task.status !== "blocked");
    const hours = (tonight.reduce((sum, task) => sum + totalSeconds(task, now), 0) / 3600).toFixed(1);
    const bullet = (task: Task) => target === "Client" ? `• ${task.title}${projects.find((project) => project.id === task.project_id) ? ` (${projects.find((project) => project.id === task.project_id)?.name})` : ""}` : `• ${task.title}`;
    const date = shift?.shift_date ?? currentShiftKey;
    const lines = [target === "Email" ? `Subject: Night shift handover · ${date}\n\nHi team,\n` : target === "Client" ? `Subject: Overnight update · ${date}\n\nHi,\n\nHere is where things stand after tonight's shift.\n` : `Night shift handoff · ${date}`, "", `Logged: ${hours}h`, "", "Completed:", ...done.map(bullet), "", "In flight / rolling over:", ...next.map(bullet)];
    if (blocked.length) lines.push("", "Blocked:", ...blocked.map(bullet));
    if (wrapNote) lines.push("", "Notes:", wrapNote);
    if (target === "Email" || target === "Client") lines.push("", target === "Client" ? "Regards," : "Thanks,");
    return lines.join("\n");
  }

  function copyShiftMessage(target: "Slack" | "Teams" | "Email" | "Client") {
    void navigator.clipboard.writeText(handoverText(target)).then(() => toast.success(`${target} handoff copied`));
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
    const onSearchKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setActiveSection("archive");
        window.setTimeout(() => document.querySelector<HTMLInputElement>('[aria-label="Search tasks, meeting notes, and evidence"]')?.focus(), 60);
      }
    };
    window.addEventListener("keydown", onSearchKey);
    return () => window.removeEventListener("keydown", onSearchKey);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.metaKey || event.ctrlKey || event.altKey || modal || target?.closest("input, textarea, select, [contenteditable]")) return;
      if (/^[1-9]$/.test(event.key)) {
        const step = tasks.find((task) => task.status === "in_progress")?.steps[Number(event.key) - 1];
        if (step) void handleStepChange(step.id, !step.completed);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const autoPausing = useRef(false);
  useEffect(() => {
    if (!user || shiftState === "active" || autoPausing.current) return;
    const stale = tasks.filter((task) => task.status === "in_progress");
    if (!stale.length) return;
    autoPausing.current = true;
    void (async () => {
      try {
        for (const task of stale) await updateTask(user.id, task.id, { status: "queued", started_at: null, elapsed_seconds: task.elapsed_seconds + runningSeconds(task, new Date()) });
        await refresh();
        toast.message("Timer stopped at the end of the shift");
      } catch { /* retried on next change */ } finally { autoPausing.current = false; }
    })();
  }, [shiftState, tasks]); // eslint-disable-line react-hooks/exhaustive-deps

  const reminded = useRef(new Map<string, number>());
  useEffect(() => {
    if (!prefs.timerReminderMin) return;
    for (const task of tasks.filter((item) => item.status === "in_progress" && item.started_at)) {
      const mins = runningSeconds(task, now) / 60;
      const steps = Math.floor(mins / prefs.timerReminderMin);
      if (steps >= 1 && (reminded.current.get(task.id) ?? 0) < steps) {
        reminded.current.set(task.id, steps);
        toast.info(`Still on “${task.title}”? Timer is at ${shortDuration(runningSeconds(task, now))}.`);
      }
    }
  }, [Math.floor(now.getTime() / 60_000), prefs.timerReminderMin]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    window.addEventListener("paste", handleClipboard);
    return () => window.removeEventListener("paste", handleClipboard);
  }, [user]);

  if (!authReady) return <main className="boot-screen"><Logo size={30} /><LoaderCircle size={18} className="spin" /><span>Opening your shift desk</span></main>;
  if (!user) return <><Toaster theme="dark" /><LoginScreen />{loadError ? <div className="auth-runtime-error" role="alert">{loadError}</div> : null}</>;

  const editingTask = tasks.find((task) => task.id === editingTaskId) ?? null;
  const meetingForDialog = data.meetings.find((item) => item.id === meetingDetailId) ?? null;
  const upcomingCount = data.meetings.filter((meeting) => new Date(meeting.ends_at ?? meeting.starts_at) >= now).length;
  const activeProjects = data.projects.filter((project) => !project.archived_at);
  const headActions = <>
    <button className="client-chip" title="Active client — change it from the clock menu" onClick={() => setActiveSection("projects")}><Users size={13} />{clientProject ? (clientProject.client_name || clientProject.name) : "Default client"} · {zoneAbbr(now, clientTz)}</button>
    {wrapDue ? <Button className="primary-action wrap-due" size="sm" onClick={() => setModal("wrap")}><Clipboard size={13} /> Wrap up now</Button> : null}
    {shiftState === "active" ? <Button className="primary-action" size="sm" onClick={() => void beginShift()} disabled={busy || !!shift?.started_at}><span className="button-signal" />{shift?.started_at ? "Shift running" : "Start shift"}</Button> : null}
  </>;

  return (
    <><ParticleField enabled /><Toaster theme="dark" position="bottom-right" />
    <main className="app-frame">
      <header className="topnav">
        <button className="nav-brand" aria-label="Go to dashboard" title="Dashboard" onClick={() => { setActiveSection("shift"); setMenu(null); }}><Logo size={26} /><span className="nav-wordmark">Nightshift</span></button>
        <nav className="nav-tabs" aria-label="Main navigation">
          <NavButton section="shift" active={activeSection} setActive={setActiveSection} icon={<Activity size={15} />} label="Dashboard" {...(openTonightCount > 0 ? { badge: String(openTonightCount) } : {})} />
          <NavButton section="meetings" active={activeSection} setActive={setActiveSection} icon={<CalendarDays size={15} />} label="Meetings" {...(upcomingCount > 0 ? { badge: String(upcomingCount) } : {})} />
          <NavButton section="projects" active={activeSection} setActive={setActiveSection} icon={<Users size={15} />} label="Projects" {...(activeProjects.length > 0 ? { badge: String(activeProjects.length) } : {})} />
          <NavButton section="planner" active={activeSection} setActive={setActiveSection} icon={<FolderKanban size={15} />} label="Plan" {...(tasks.filter((task) => task.status !== "done" && task.planning_bucket !== "tonight").length > 0 ? { badge: String(tasks.filter((task) => task.status !== "done" && task.planning_bucket !== "tonight").length) } : {})} />
          <NavButton section="archive" active={activeSection} setActive={setActiveSection} icon={<Archive size={15} />} label="Archive" />
        </nav>
        <div className="nav-right">
          <ClockMenu now={now} clientTz={clientTz} clientId={clientProject?.id ?? ""} projects={projects} onClient={setClientId} shiftState={shiftState} shiftStart={shiftStart} shiftEnd={shiftEnd} nextShift={nextShift} gapChange={gapChange} />
          <div className="menu-wrap">
            <button className={`icon-nav${unreadNotices.some((notice) => notice.tone !== "info") ? " has-alert" : ""}`} aria-label={`Notifications (${unreadNotices.length} unread)`} aria-expanded={menu === "bell"} onClick={() => setMenu(menu === "bell" ? null : "bell")}><Bell size={16} />{unreadNotices.length ? <span className="bell-badge">{unreadNotices.length}</span> : null}</button>
            {menu === "bell" ? <div className="popover" role="menu"><div className="popover-title"><span>Notifications</span><button className="link-btn" disabled={!unreadNotices.length} onClick={() => markRead(notices)}>Mark all read</button></div>{notices.length ? notices.map((notice) => { const unread = readNotices[notice.id] !== notice.text; return <button key={notice.id} role="menuitem" className={`notice ${notice.tone}${unread ? "" : " read"}`} onClick={() => { markRead([notice]); setMenu(null); notice.go?.(); }}><span className="notice-dot" />{notice.text}</button>; }) : <p className="popover-empty">All clear</p>}</div> : null}
          </div>
          <div className="menu-wrap">
            <button className="nav-account" aria-label="Account menu" aria-expanded={menu === "account"} onClick={() => setMenu(menu === "account" ? null : "account")}><span className="account-avatar">{(user.email?.[0] ?? "U").toUpperCase()}</span><span className="account-label">Account</span><ChevronDown size={13} /></button>
            {menu === "account" ? <div className="popover small" role="menu"><div className="popover-title">{user.email ?? "Signed in"}</div><button role="menuitem" className="menu-item" onClick={() => { setMenu(null); setPrefsOpen(true); }}><SlidersHorizontal size={14} /> Preferences</button><button role="menuitem" className="menu-item" onClick={() => void supabase.auth.signOut()}><LogOut size={14} /> Sign out</button></div> : null}
          </div>
        </div>
      </header>
      <section className="app-content">
        {loadError ? <div className="error-banner" role="alert"><span>{loadError}</span><Button variant="outline" size="sm" onClick={() => { setLoadError(""); void refresh(); }}>Retry</Button></div> : null}
        {activeSection === "shift" ? <ShiftSection {...{ onEditTask: (task: Task) => setEditingTaskId(task.id), headActions, onTile: (kind: "projects" | "archive" | "meeting") => { if (kind === "meeting") { const next = upcomingMeetings.filter((meeting) => new Date(meeting.starts_at) > now).sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0]; if (next) setMeetingDetailId(next.id); else setActiveSection("meetings"); } else setActiveSection(kind); }, now, shift, shiftState, shiftStart, shiftEnd, progress, nextShift, projects, tasks, tonightTasks, completedTonight, upcomingMeetings, activeMeeting, attachments: data.attachments, clientTz, onQuickAdd: (text: string, projectId: string, priority: TaskPriority) => void quickAddTask(text, projectId, priority), activeClientId: clientProject?.id ?? "", onPull: (task: Task) => void pullTask(task), onOpenMeeting: (meeting: Meeting) => setMeetingDetailId(meeting.id), onImportIcs: (file: File) => void importIcs(file), onPasteNotes: () => setPasteOpen(true), onTaskTimer: toggleTaskTimer, onTaskComplete: handleTaskComplete, onStepChange: handleStepChange, onAddStep: handleAddStep, onAddTask: () => setModal("template"), onAddMeeting: () => setModal("meeting"), onWrap: () => setModal("wrap"), onPaste: (file, taskId) => void onEvidence(file, taskId), onAttachment: setSelectedAttachment, busy, onMeetingFile: saveMeetingFile, onNotes: (text: string) => { if (user && shift) void saveShift(user.id, shift.id, { focus_notes: text }).catch(() => toast.error("Scratchpad could not be saved")); } }} /> : null}
        {activeSection === "meetings" ? <MeetingsSection meetings={data.meetings} projects={projects} now={now} tz={clientTz} onOpen={(meeting) => setMeetingDetailId(meeting.id)} onAdd={() => setModal("meeting")} onImport={(file) => void importIcs(file)} onTasks={(meeting) => void tasksFromItems(meeting.action_items, meeting.project_id)} /> : null}
        {activeSection === "projects" ? <ProjectsSection userId={user.id} projects={data.projects} tasks={tasks} meetings={data.meetings} templates={data.templates} now={now} activeClientId={clientProject?.id ?? ""} busy={busy} onUseClient={(id) => { setClientId(id); toast.success("Active client updated"); }} onRun={runAction} onNewProject={() => setModal("project")} onEditTask={(task) => setEditingTaskId(task.id)} onOpenMeeting={(meeting) => setMeetingDetailId(meeting.id)} /> : null}
        {activeSection === "planner" ? <PlanBoard userId={user.id} projects={projects} tasks={tasks} templates={data.templates} now={now} activeClientId={clientProject?.id ?? ""} busy={busy} onRun={runAction} onEditTask={(task) => setEditingTaskId(task.id)} /> : null}
        {activeSection === "archive" ? <ArchiveSection {...{ clientTz, data, now, month: archiveMonth, setMonth: setArchiveMonth, day: archiveDay, setDay: setArchiveDay, search, setSearch, onAttachment: setSelectedAttachment }} /> : null}
      </section>

      {modal === "project" ? <ProjectModal userId={user.id} onClose={() => setModal(null)} onSave={async (project) => { await runAction(async () => { await createProject(user.id, project); }, "Project created"); setModal(null); }} /> : null}
      {modal === "meeting" ? <MeetingModal userId={user.id} shiftId={shift?.id ?? null} projects={projects} onClose={() => setModal(null)} onSave={async (meeting) => { await runAction(async () => { await createMeeting(user.id, meeting); }, "Meeting added"); setModal(null); }} /> : null}
      {modal === "template" ? <TaskModal defaultProjectId={clientProject?.id ?? ""} userId={user.id} shiftId={shift?.id ?? null} projects={projects} templates={data.templates} defaultBucket="tonight" onClose={() => setModal(null)} onSave={async (task) => { await runAction(async () => { await createTask(user.id, task); }, "Task added to tonight"); setModal(null); }} /> : null}
      {modal === "wrap" ? <WrapModal shift={shift} tasks={tasks} onClose={() => setModal(null)} onSave={updateWrapUp} onCopy={copyShiftMessage} busy={busy} /> : null}
      {meetingForDialog ? <MeetingDialog key={meetingForDialog.id} meeting={meetingForDialog} projects={projects} tz={clientTz} onClose={() => setMeetingDetailId(null)} onSave={(changes) => saveMeetingDetail(meetingForDialog.id, changes)} onDelete={() => deleteMeeting(meetingForDialog)} onCreateTasks={(items, projectId) => tasksFromItems(items, projectId)} /> : null}
      {editingTask ? <TaskEditDialog key={editingTask.id} task={editingTask} projects={projects} onClose={() => setEditingTaskId(null)} onSave={(changes) => editTask(editingTask, changes)} onDelete={() => deleteTask(editingTask)} /> : null}
      {prefsOpen ? <PreferencesDialog prefs={prefs} onChange={setPrefs} projects={projects} clientId={clientProject?.id ?? ""} onClient={setClientId} onClose={() => setPrefsOpen(false)} /> : null}
      {pasteOpen ? <PasteNotesDialog onClose={() => setPasteOpen(false)} onCreate={(items) => tasksFromItems(items, clientProject?.id ?? null)} /> : null}
      {evidenceInput ? <EvidenceDialog file={evidenceInput.file} busy={busy} onClose={() => setEvidenceInput(null)} onSave={(file) => void saveEvidence(file, evidenceInput.taskId)} /> : null}
      {selectedAttachmentValue ? <AttachmentDialog attachment={selectedAttachmentValue} busy={busy} onClose={() => setSelectedAttachment(null)} onSaveNote={(note) => { if (!user) return; void runAction(() => updateAttachment(user.id, selectedAttachmentValue.id, { note }), "Evidence note saved"); }} onDelete={() => { if (!user) return; void runAction(() => removeAttachment(user.id, selectedAttachmentValue), "Evidence removed"); setSelectedAttachment(null); }} /> : null}
      {busy ? <div className="save-indicator" role="status"><LoaderCircle size={14} className="spin" /> Saving</div> : null}
    </main></>
  );
}

function ParticleField({ enabled }: { enabled: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !enabled || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let w = 0; let h = 0; let raf = 0;
    const resize = () => { w = window.innerWidth; h = window.innerHeight; canvas.width = w * dpr; canvas.height = h * dpr; canvas.style.width = `${w}px`; canvas.style.height = `${h}px`; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    resize();
    window.addEventListener("resize", resize);
    const count = Math.round(Math.min(120, (w * h) / 13000));
    const dots = Array.from({ length: count }, () => ({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 0.28, vy: (Math.random() - 0.5) * 0.28, r: Math.random() * 1.5 + 0.6, a: Math.random() * 0.5 + 0.25, t: Math.random() * Math.PI * 2 }));
    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      for (const d of dots) {
        d.x += d.vx; d.y += d.vy; d.t += 0.02;
        if (d.x < -5) d.x = w + 5; if (d.x > w + 5) d.x = -5; if (d.y < -5) d.y = h + 5; if (d.y > h + 5) d.y = -5;
        ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(140, 228, 255, ${Math.min(1, d.a * 1.3 * (0.65 + 0.35 * Math.sin(d.t)))})`; ctx.fill();
      }
      for (let i = 0; i < dots.length; i += 1) for (let j = i + 1; j < dots.length; j += 1) {
        const a = dots[i]!; const b = dots[j]!; const dx = a.x - b.x; const dy = a.y - b.y; const dist = Math.hypot(dx, dy);
        if (dist < 120) { ctx.strokeStyle = `rgba(90, 200, 240, ${0.13 * (1 - dist / 120)})`; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, [enabled]);
  return <canvas ref={ref} className="particles" aria-hidden="true" />;
}

function Logo({ size = 28 }: { size?: number }) {
  return <svg className="logo-mark" width={size} height={size} viewBox="0 0 32 32" fill="none" aria-label="Nightshift" role="img">
    <defs><linearGradient id="ns-logo" x1="4" y1="3" x2="28" y2="29" gradientUnits="userSpaceOnUse"><stop stopColor="#22f0e6" /><stop offset="1" stopColor="#4cff9b" /></linearGradient></defs>
    <path d="M16 2.5 28 7v8.5c0 7.2-4.9 12.4-12 14C8.9 27.9 4 22.7 4 15.5V7L16 2.5Z" stroke="url(#ns-logo)" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M21.2 19.4A7 7 0 1 1 13.6 9.6a5.5 5.5 0 0 0 7.6 9.8Z" fill="url(#ns-logo)" />
    <circle cx="21.6" cy="11.2" r="1.3" fill="#4cff9b" />
  </svg>;
}

function NavButton({ section, active, setActive, icon, label, badge }: { section: Section; active: Section; setActive: (section: Section) => void; icon: ReactNode; label: string; badge?: string }) {
  return <button className={`nav-item${active === section ? " nav-active" : ""}`} onClick={() => setActive(section)}>{icon}<span>{label}</span>{badge ? <small>{badge}</small> : null}</button>;
}

function ShiftSection(props: {
  now: Date; shift: Shift | null; shiftState: ReturnType<typeof getShiftState>; shiftStart: Date; shiftEnd: Date; progress: number;
  nextShift: Date; projects: Project[]; tasks: Task[]; tonightTasks: Task[]; completedTonight: number; upcomingMeetings: Meeting[];
  activeMeeting: Meeting | undefined; attachments: Attachment[]; clientTz: string; onTaskTimer: (task: Task) => void;
  onTaskComplete: (task: Task, checked: boolean) => void; onStepChange: (stepId: string, checked: boolean) => void;
  onAddStep: (task: Task, title: string) => void; onAddTask: () => void; onAddMeeting: () => void; onWrap: () => void;
  onPaste: (file: File, taskId: string | null) => void; onAttachment: (id: string) => void; busy: boolean; onNotes: (text: string) => void;
  onMeetingFile: (meeting: Meeting, file: File) => void; activeClientId: string; onQuickAdd: (text: string, projectId: string, priority: TaskPriority) => void; onPull: (task: Task) => void;
  onOpenMeeting: (meeting: Meeting) => void; onImportIcs: (file: File) => void; onPasteNotes: () => void;
  onEditTask: (task: Task) => void; headActions: React.ReactNode; onTile: (kind: "projects" | "archive" | "meeting") => void;
}) {
  const { now, shift, shiftState, shiftEnd, progress, nextShift, projects, tasks, tonightTasks, completedTonight, upcomingMeetings, activeMeeting, attachments, clientTz, activeClientId, onTaskTimer, onTaskComplete, onStepChange, onAddStep, onAddTask, onAddMeeting, onWrap, onPaste, onAttachment, busy, onNotes, onMeetingFile, onQuickAdd, onPull, onOpenMeeting, onImportIcs, onPasteNotes, onEditTask, headActions, onTile } = props;
  const [quick, setQuick] = useState("");
  const [quickProject, setQuickProject] = useState(activeClientId);
  const [quickPriority, setQuickPriority] = useState<TaskPriority>("normal");
  useEffect(() => { setQuickProject(activeClientId); }, [activeClientId]);
  const projectsInPlay = new Set(tonightTasks.map((task) => task.project_id).filter(Boolean)).size;
  const blocked = tonightTasks.filter((task) => task.status === "blocked").length;
  const running = tonightTasks.find((task) => task.status === "in_progress");
  const loggedSeconds = tonightTasks.reduce((sum, task) => sum + totalSeconds(task, now), 0);
  const nextMeeting = upcomingMeetings.filter((meeting) => new Date(meeting.starts_at) > now).sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];
  const taskPct = tonightTasks.length ? Math.round((completedTonight / tonightTasks.length) * 100) : 0;
  const BUCKET_ORDER: PlanBucket[] = ["tomorrow", "next_7_days", "next_30_days", "backlog"];
  const upNext = tasks.filter((task) => task.status !== "done" && task.planning_bucket !== "tonight").sort((a, b) => BUCKET_ORDER.indexOf(a.planning_bucket) - BUCKET_ORDER.indexOf(b.planning_bucket)).slice(0, 5);
  const evidence = attachments.filter((attachment) => attachment.content_type.startsWith("image/") && attachment.previewUrl).slice(0, 6);
  const progressByProject = projects.filter((project) => !project.archived_at).map((project) => ({ id: project.id, name: project.name, total: tonightTasks.filter((task) => task.project_id === project.id).length, done: tonightTasks.filter((task) => task.project_id === project.id && task.status === "done").length })).filter((item) => item.total > 0);
  return <div className="content-wrap dash">
    <div className="dash-head">
      <div className="dash-head-main">
      <div className="dash-title"><h1>Shift activity</h1><span className={`chip ${shiftState}`}>{shiftState === "active" ? "Live" : shiftState === "after" ? "Handover" : "Standby"}</span>{blocked ? <span className="chip warn">{blocked} blocked</span> : null}{running ? <span className="chip run">Timer running</span> : null}</div>
      <p className="dash-meta">{completedTonight} done · {tonightTasks.length - completedTonight} open · {relativeDuration(loggedSeconds)} logged · {upcomingMeetings.length} meeting{upcomingMeetings.length === 1 ? "" : "s"}</p>
      <div className="proj-strip"><div className="proj-item"><span>Tonight</span><div className="mini-bar"><span style={{ width: `${taskPct}%` }} /></div><em>{completedTonight}/{tonightTasks.length}</em></div>{progressByProject.map((item) => <div className="proj-item" key={item.id}><span>{item.name}</span><div className="mini-bar"><span style={{ width: `${Math.round((item.done / item.total) * 100)}%` }} /></div><em>{item.done}/{item.total}</em></div>)}</div>
      </div>
      <div className="dash-head-actions">{headActions}</div>
    </div>
    <div className="stat-row">
      <div className="stat-tile tile-wide"><span className="stat-label">Shift · 5:30 PM → 3:30 AM IST</span><strong className="stat-value">{shiftState === "active" ? `${Math.round(progress)}%` : shiftState === "after" ? "Done" : "Standby"}</strong><div className="progress-track"><span style={{ width: `${shiftState === "active" ? progress : 0}%` }} /></div></div>
      <div className="stat-tile"><span className="stat-label">Tasks</span><strong className="stat-value tone-green">{completedTonight}<em>/{tonightTasks.length}</em></strong><div className="mini-bar"><span style={{ width: `${taskPct}%` }} /></div></div>
      <button className="stat-tile link" onClick={() => onTile("archive")} title="Open the archive for this shift"><span className="stat-label">Logged</span><strong className="stat-value mono-sm tone-cyan">{relativeDuration(loggedSeconds)}</strong><small>{running ? "Timer running" : "Idle"}</small></button>
      <button className="stat-tile link" onClick={() => onTile("meeting")} title="Open the next meeting"><span className="stat-label">Next meeting</span><strong className="stat-value mono-sm">{nextMeeting ? timeLeftUntil(new Date(nextMeeting.starts_at), now) : "—"}</strong><small>{nextMeeting?.title ?? "None scheduled"}</small></button>
      <button className="stat-tile link" onClick={() => onTile("projects")} title="Open projects"><span className="stat-label">Projects · Blocked</span><strong className={`stat-value ${blocked ? "tone-amber" : "tone-cyan"}`}>{projectsInPlay}<em> · {blocked}</em></strong><small>in play tonight</small></button>
    </div>
    <div className="dash-grid">
      <section className="card card-tasks">
        <header className="card-head"><h2>Tonight <span className="count-badge">{tonightTasks.length}</span></h2><div className="card-actions"><Button variant="ghost" size="sm" onClick={onPasteNotes}><Clipboard size={14} /> Paste notes</Button><Button variant="outline" size="sm" onClick={onAddTask}><Plus size={14} /> Task</Button></div></header>
        <form className="inline-add" onSubmit={(event) => { event.preventDefault(); const value = quick.trim(); if (!value) return; if (!quickProject && !/#[\w-]+/.test(value)) { toast.error("Choose a project for this task."); return; } onQuickAdd(value, quickProject, quickPriority); setQuick(""); }}>
          <Input value={quick} onChange={(event) => setQuick(event.target.value)} aria-label="Quick add task" placeholder="Quick add — e.g. Fix backups tomorrow !high : check logs; verify" />
          <select aria-label="Project" value={quickProject} onChange={(event) => setQuickProject(event.target.value)}><option value="">Project *</option>{projects.filter((project) => !project.archived_at).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
          <select aria-label="Priority" value={quickPriority} onChange={(event) => setQuickPriority(event.target.value as TaskPriority)}><option value="high">High</option><option value="normal">Medium</option><option value="low">Low</option></select>
          <Button type="submit" size="sm" disabled={!quick.trim() || busy}><Plus size={14} /></Button>
        </form>
        {tonightTasks.length ? <div className="task-list">{tonightTasks.map((task, index) => <TaskCard key={task.id} task={task} project={projects.find((project) => project.id === task.project_id)} index={index} now={now} shiftEnd={shiftEnd} shiftActive={shiftState === "active"} attachments={attachments.filter((attachment) => attachment.task_id === task.id)} busy={busy} onTimer={() => onTaskTimer(task)} onComplete={(checked) => onTaskComplete(task, checked)} onStepChange={onStepChange} onAddStep={(title) => onAddStep(task, title)} onPaste={(file) => onPaste(file, task.id)} onAttachment={onAttachment} onEdit={() => onEditTask(task)} />)}</div> : <EmptyTasks onAdd={onAddTask} />}
        <div className="paste-hint"><span>Paste a screenshot to attach evidence</span><button onClick={() => onPaste(new File([], ""), null)} aria-label="Choose screenshot to upload"><Upload size={14} /> Upload</button></div>
      </section>
      <div className="dash-col">
        <section className="card">
          <header className="card-head"><h2>Meetings <span className="count-badge">{upcomingMeetings.length}</span></h2><div className="card-actions"><label className="icon-btn" title="Import .ics calendar file" aria-label="Import calendar file"><Download size={14} /><input type="file" accept=".ics,text/calendar" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) onImportIcs(file); event.target.value = ""; }} /></label><Button variant="ghost" size="icon" title="Add meeting" aria-label="Add meeting" onClick={onAddMeeting}><Plus size={15} /></Button></div></header>
          {activeMeeting ? <div className="meeting-brief"><div className="brief-label"><Sparkles size={14} /> STARTING SOON</div><strong>{activeMeeting.title}</strong><span>{activeMeeting.client_name || "Client meeting"} · {formatClock(new Date(activeMeeting.starts_at), clientTz)} {zoneAbbr(new Date(activeMeeting.starts_at), clientTz)}</span>{activeMeeting.dossier ? <p>{activeMeeting.dossier}</p> : null}</div> : null}
          {upcomingMeetings.length ? <div className="meeting-list">{upcomingMeetings.map((meeting) => <MeetingRow key={meeting.id} meeting={meeting} now={now} tz={clientTz} onOpen={() => onOpenMeeting(meeting)} onFile={(file) => onMeetingFile(meeting, file)} />)}</div> : <div className="empty-meetings"><CalendarDays size={18} /><span>No meetings tonight</span></div>}
        </section>
        <section className="card">
          <header className="card-head"><h2>Up next <span className="count-badge">{upNext.length}</span></h2></header>
          {upNext.length ? <div className="queue-list">{upNext.map((task) => <div className="queue-row" key={task.id}><span className="queue-bucket">{BUCKET_COPY[task.planning_bucket]}</span><span className="queue-title">{task.title}</span><Button variant="outline" size="sm" onClick={() => onPull(task)} disabled={busy}>Tonight</Button></div>)}</div> : <div className="empty-meetings"><ListChecks size={18} /><span>Nothing queued</span></div>}
        </section>
      </div>
      <div className="dash-col">
        <section className="card"><Scratchpad key={shift?.id ?? "none"} initial={shift?.focus_notes ?? ""} disabled={!shift} onSave={onNotes} /></section>
        {evidence.length ? <section className="card"><header className="card-head"><h2>Evidence <span className="count-badge">{attachments.length}</span></h2></header><div className="thumb-grid">{evidence.map((attachment) => <button key={attachment.id} className="thumb" onClick={() => onAttachment(attachment.id)} title={attachment.file_name}><img src={attachment.previewUrl} alt={attachment.file_name} /></button>)}</div></section> : null}
        <section className="card">
          <header className="card-head"><h2>Handoff</h2></header>
          <div className="wrap-summary"><span className="wrap-completed"><CheckCircle2 size={15} /> {completedTonight} done</span><span className="wrap-pending">{tonightTasks.length - completedTonight} rolling over</span></div>
          <Button variant="outline" className="wrap-launch" onClick={onWrap}><Clipboard size={15} /> Wrap up shift <ArrowRight size={15} /></Button>
          <div className="rollover-foot"><ArrowLeftRight size={14} /><span>Next shift <strong>{new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", weekday: "short", month: "short", day: "numeric" }).format(nextShift)}</strong></span></div>
        </section>
      </div>
    </div>
  </div>;
}

function Scratchpad({ initial, disabled, onSave }: { initial: string; disabled: boolean; onSave: (text: string) => void }) {
  const [text, setText] = useState(initial);
  const [state, setState] = useState<"saved" | "saving">("saved");
  const last = useRef(initial);
  useEffect(() => {
    if (text === last.current) return;
    setState("saving");
    const timer = window.setTimeout(() => { last.current = text; onSave(text); setState("saved"); }, 800);
    return () => window.clearTimeout(timer);
  }, [text, onSave]);
  return <div className="scratchpad">
    <div className="block-heading side-block-title"><div><div className="eyebrow">SCRATCHPAD · {state === "saving" ? "SAVING…" : "AUTO-SAVED"}</div><h2>Shift notes</h2></div></div>
    <Textarea aria-label="Shift scratchpad" disabled={disabled} value={text} onChange={(event) => setText(event.target.value)} placeholder={disabled ? "Begin the shift to start taking notes" : "Client pings, loose thoughts, handover bullets"} />
  </div>;
}

function EmptyTasks({ onAdd }: { onAdd: () => void }) {
  return <div className="empty-task-state"><div className="empty-mark"><ListChecks size={24} /></div><span className="eyebrow">CLEAR DESK, CLEAR HEAD</span><h3>No tasks yet</h3><Button className="primary-action" onClick={onAdd}><Plus size={16} /> Add task</Button></div>;
}

function TaskCard({ task, project, index, now, shiftEnd, shiftActive, attachments, busy, onTimer, onComplete, onStepChange, onAddStep, onPaste, onAttachment, onEdit }: {
  task: Task; project?: Project; index: number; now: Date; shiftEnd: Date; shiftActive: boolean; attachments: Attachment[]; busy: boolean; onEdit: () => void;
  onTimer: () => void; onComplete: (checked: boolean) => void; onStepChange: (stepId: string, checked: boolean) => void; onAddStep: (title: string) => void; onPaste: (file: File) => void; onAttachment: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(task.status === "in_progress");
  const [stepDraft, setStepDraft] = useState("");
  const elapsed = totalSeconds(task, now);
  void shiftEnd;
  const remaining = task.steps.filter((step) => !step.completed).length;
  const submitStep = (event: FormEvent) => { event.preventDefault(); const value = stepDraft.trim(); if (!value) return; onAddStep(value); setStepDraft(""); };
  return <article className={`task-card${task.status === "in_progress" ? " task-running" : ""}${task.status === "done" ? " is-done" : ""}`}>
    <div className="task-main-row"><div className="task-index">{String(index + 1).padStart(2, "0")}</div><Checkbox checked={task.status === "done"} onCheckedChange={(value) => onComplete(value === true)} aria-label={`Mark ${task.title} ${task.status === "done" ? "incomplete" : "complete"}`} disabled={busy} />
      <button className="task-title-area" onClick={() => setExpanded(!expanded)}><span className={task.status === "done" ? "task-title is-done" : "task-title"}>{task.title}</span><span className="task-subtitle"><span>{project?.name ?? "No project"}</span><span className={`priority-chip p-${task.priority}`}>{task.priority === "high" ? "HIGH" : task.priority === "low" ? "LOW" : "MEDIUM"}</span>{task.status === "blocked" ? <span className="chip warn small">BLOCKED</span> : null}{task.rollover ? <span className="rollover-chip">ROLLED OVER</span> : null}</span></button>
      <div className="task-trailing">{task.steps.length ? <button className="checklist-count" onClick={() => setExpanded(!expanded)}><ListChecks size={14} />{task.steps.length - remaining}/{task.steps.length}</button> : null}<span className={task.status === "in_progress" ? "task-timer timer-live" : "task-timer"}><Clock3 size={13} />{relativeDuration(elapsed)}</span><Button className="timer-btn" variant={task.status === "in_progress" ? "secondary" : "outline"} size="icon" aria-label={task.status === "in_progress" ? `Pause ${task.title}` : `Start timer for ${task.title}`} title={task.status === "in_progress" ? "Pause timer" : shiftActive ? "Start timer" : "Timers work only during shift hours"} onClick={onTimer} disabled={busy || (task.status !== "in_progress" && !shiftActive)}>{task.status === "in_progress" ? <Pause size={15} /> : <Play size={15} />}</Button><button className="icon-mini" aria-label={`Edit ${task.title}`} title="Edit task" onClick={onEdit}><Pencil size={14} /></button><button className="expand-task" aria-label={`${expanded ? "Collapse" : "Expand"} ${task.title}`} onClick={() => setExpanded(!expanded)}><ChevronDown size={15} className={expanded ? "rotate-chevron" : ""} /></button></div>
    </div>
    {expanded ? <div className="task-details"><p className="task-description">{task.description || "No notes added yet."}</p>{task.steps.length ? <div className="step-list">{task.steps.map((step) => <label className={`step-row${step.completed ? " step-done" : ""}`} key={step.id}><Checkbox checked={step.completed} onCheckedChange={(value) => onStepChange(step.id, value === true)} aria-label={`Mark step ${step.title}`} /><span>{step.title}</span></label>)}</div> : null}<form className="add-step-row" onSubmit={submitStep}><Input value={stepDraft} onChange={(event) => setStepDraft(event.target.value)} aria-label={`Add a checklist step to ${task.title}`} placeholder="Add a step…" /><Button variant="ghost" size="icon" type="submit" aria-label="Add checklist step" disabled={!stepDraft.trim()}><Plus size={16} /></Button></form>{attachments.length ? <div className="task-attachments">{attachments.map((attachment) => <button key={attachment.id} onClick={() => onAttachment(attachment.id)}><FileImage size={14} />{attachment.file_name}</button>)}</div> : null}<label className="task-attach"><ImagePlus size={14} /> Attach evidence<input type="file" accept="image/*" aria-label={`Attach evidence to ${task.title}`} onChange={(event) => { const file = event.target.files?.[0]; if (file) onPaste(file); event.target.value = ""; }} /></label></div> : null}
  </article>;
}

function MeetingRow({ meeting, now, tz, onFile, onOpen }: { meeting: Meeting; now: Date; tz: string; onFile: (file: File) => void; onOpen: () => void }) {
  const start = new Date(meeting.starts_at);
  const delta = start.getTime() - now.getTime();
  return <div className={`meeting-row${delta <= 0 ? " meeting-past" : ""}`} role="button" tabIndex={0} onClick={onOpen} onKeyDown={(event) => { if (event.key === "Enter") onOpen(); }}>
    <div className="meeting-time">{formatClock(start, tz)}<small>{zoneAbbr(start, tz)} · {formatClock(start, "Asia/Kolkata")} IST</small></div>
    <div className="meeting-detail"><strong>{meeting.title}</strong><span>{meeting.client_name || "Client"}{meeting.action_items.length ? ` · ${meeting.action_items.length} actions` : ""}</span></div>
    <label className="meeting-attach" title="Attach a file to this meeting" onClick={(event) => event.stopPropagation()}><Upload size={13} /><input type="file" hidden aria-label={`Attach file to ${meeting.title}`} onChange={(event) => { const file = event.target.files?.[0]; if (file) onFile(file); event.target.value = ""; }} /></label>
  </div>;
}

function ArchiveSection({ clientTz, data, now, month, setMonth, day, setDay, search, setSearch, onAttachment }: {
  clientTz: string; data: TrackerData; now: Date; month: Date; setMonth: (date: Date) => void; day: string | null; setDay: (date: string | null) => void; search: string; setSearch: (query: string) => void; onAttachment: (id: string) => void;
}) {
  const [kind, setKind] = useState<"all" | "tasks" | "meetings" | "evidence">("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const inProject = (id: string | null | undefined) => projectFilter === "all" || id === projectFilter;
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
  const visibleTasks = data.tasks.filter((task) => (!activeDay || task.planned_date === activeDay || task.shift_id === selectedShift?.id) && inProject(task.project_id));
  const visibleMeetings = data.meetings.filter((meeting) => (!activeDay || getShiftDateKey(new Date(meeting.starts_at)) === activeDay) && inProject(meeting.project_id));
  const visibleAttachments = data.attachments.filter((attachment) => !activeDay || attachment.shift_id === selectedShift?.id || attachment.task_id && visibleTasks.some((task) => task.id === attachment.task_id));
  const query = search.trim().toLowerCase();
  const searchedTasks = query && (kind === "all" || kind === "tasks") ? data.tasks.filter((task) => inProject(task.project_id) && `${task.title} ${task.description} ${task.steps.map((step) => step.title).join(" ")}`.toLowerCase().includes(query)) : [];
  const searchedMeetings = query && (kind === "all" || kind === "meetings") ? data.meetings.filter((meeting) => inProject(meeting.project_id) && `${meeting.title} ${meeting.client_name} ${meeting.notes} ${meeting.agenda} ${meeting.dossier} ${meeting.action_items.join(" ")}`.toLowerCase().includes(query)) : [];
  const searchedAttachments = query && (kind === "all" || kind === "evidence") ? data.attachments.filter((attachment) => (projectFilter === "all" || inProject(data.tasks.find((task) => task.id === attachment.task_id)?.project_id)) && `${attachment.file_name} ${attachment.note} ${attachment.ocr_text}`.toLowerCase().includes(query)) : [];
  const visibleDatedTasks = visibleTasks.filter((task) => !query || `${task.title} ${task.description} ${task.steps.map((step) => step.title).join(" ")}`.toLowerCase().includes(query));
  const visibleDatedMeetings = visibleMeetings.filter((meeting) => !query || `${meeting.title} ${meeting.client_name} ${meeting.notes} ${meeting.agenda} ${meeting.dossier} ${meeting.action_items.join(" ")}`.toLowerCase().includes(query));
  const visibleDatedAttachments = visibleAttachments.filter((attachment) => !query || `${attachment.file_name} ${attachment.note} ${attachment.ocr_text}`.toLowerCase().includes(query));
  const selectedDate = activeDay ? new Date(`${activeDay}T12:00:00`) : null;
  const monthKey = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
  const monthTasks = data.tasks.filter((task) => (task.planned_date ?? "").startsWith(monthKey) || (task.completed_at ?? "").startsWith(monthKey));
  const monthSeconds = monthTasks.reduce((sum, task) => sum + task.elapsed_seconds, 0);
  const monthStats: Array<[string, string, string]> = [
    ["Shifts", String(data.shifts.filter((shift) => shift.shift_date.startsWith(monthKey)).length), "this month"],
    ["Completed", String(monthTasks.filter((task) => task.status === "done").length), `of ${monthTasks.length} tasks`],
    ["Logged", monthSeconds < 3600 ? `${Math.round(monthSeconds / 60)}m` : `${(monthSeconds / 3600).toFixed(1)}h`, "task time"],
    ["Meetings", String(data.meetings.filter((meeting) => getShiftDateKey(new Date(meeting.starts_at)).startsWith(monthKey)).length), "attended"],
    ["Evidence", String(data.attachments.filter((attachment) => (attachment.created_at ?? "").startsWith(monthKey)).length), "files saved"],
  ];
  const secondsByProject = new Map<string, number>();
  for (const task of monthTasks) if (task.project_id) secondsByProject.set(task.project_id, (secondsByProject.get(task.project_id) ?? 0) + task.elapsed_seconds);
  const maxSeconds = Math.max(1, ...secondsByProject.values());
  const projectBars = [...secondsByProject.entries()].map(([id, seconds]) => ({ id, name: data.projects.find((project) => project.id === id)?.name ?? "Unknown", pct: Math.max(4, (seconds / maxSeconds) * 100), label: seconds < 3600 ? `${Math.round(seconds / 60)}m` : `${(seconds / 3600).toFixed(1)}h` })).sort((a, b) => b.pct - a.pct).slice(0, 6);
  const shiftKeys = [...new Set([...data.shifts.map((shift) => shift.shift_date), ...data.tasks.map((task) => task.planned_date ?? "")])].filter((key) => key.startsWith(monthKey)).sort().reverse();
  const shiftRows = shiftKeys.map((key) => {
    const shiftRow = data.shifts.find((shift) => shift.shift_date === key);
    const list = data.tasks.filter((task) => (task.planned_date === key || (shiftRow && task.shift_id === shiftRow.id)) && inProject(task.project_id));
    return { key, label: new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(new Date(`${key}T12:00:00Z`)), wrapped: Boolean(shiftRow?.ended_at), done: list.filter((task) => task.status === "done").length, total: list.length, time: shortDuration(list.reduce((sum, task) => sum + task.elapsed_seconds, 0)) };
  });
  function copyStandup() {
    const done = visibleDatedTasks.filter((task) => task.status === "done");
    const open = visibleDatedTasks.filter((task) => task.status !== "done");
    const text = [`Shift ${activeDay}`, "", "Done:", ...done.map((task) => `• ${task.title}`), "", "Open:", ...open.map((task) => `• ${task.title}`), ...(selectedShift?.wrap_up ? ["", "Notes:", selectedShift.wrap_up] : [])].join("\n");
    void navigator.clipboard.writeText(text).then(() => toast.success("Standup copied"));
  }
  return <div className="content-wrap archive">
    <div className="stat-row stat-row-5">{monthStats.map(([label, value, hint]) => <div className="stat-tile" key={label}><span className="stat-label">{label}</span><strong className="stat-value">{value}</strong><small>{hint}</small></div>)}</div>
    <section className="archive-search"><Search size={17} /><Input aria-label="Search tasks, meeting notes, and evidence" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tasks, meeting notes, and saved evidence…" /><span><Command size={12} /> K</span><Button variant="outline" size="sm" onClick={() => downloadText("nightshift-tasks.csv", tasksToCsv(data), "text/csv")}><Download size={14} /> CSV</Button><Button variant="outline" size="sm" onClick={() => downloadText("nightshift-audit.json", auditToJson(data), "application/json")}><Download size={14} /> JSON</Button></section>
    <div className="toolbar archive-filters">
      <div className="segmented" role="tablist" aria-label="Result type">{(["all", "tasks", "meetings", "evidence"] as const).map((value) => <button key={value} role="tab" aria-selected={kind === value} onClick={() => setKind(value)}>{value}</button>)}</div>
      <select aria-label="Filter by project" value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}><option value="all">All projects</option>{data.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
      <div className="segmented" role="tablist" aria-label="Shift view">{(["calendar", "list"] as const).map((value) => <button key={value} role="tab" aria-selected={view === value} onClick={() => setView(value)}>{value}</button>)}</div>
    </div>
    {query ? <div className="global-search-results"><div className="eyebrow">SEARCH RESULTS · {searchedTasks.length + searchedMeetings.length + searchedAttachments.length}</div>{searchedTasks.map((task) => <div className="search-result" key={`task-${task.id}`}><ListChecks size={16} /><div><strong>{task.title}</strong><small>Task · {task.planned_date ?? "No shift date"} · {task.status.replace("_", " ")}</small></div></div>)}{searchedMeetings.map((meeting) => <div className="search-result" key={`meeting-${meeting.id}`}><CalendarDays size={16} /><div><strong>{meeting.title}</strong><small>Meeting · {formatDateLabel(new Date(meeting.starts_at), "Asia/Kolkata")} · {meeting.notes || meeting.client_name || "No notes"}</small></div></div>)}{searchedAttachments.map((attachment) => <button className="search-result" key={`attachment-${attachment.id}`} onClick={() => onAttachment(attachment.id)}><FileImage size={16} /><span><strong>{attachment.file_name}</strong><small>Evidence · {attachment.note || attachment.ocr_text || "No note"}</small></span></button>)}{!searchedTasks.length && !searchedMeetings.length && !searchedAttachments.length ? <div className="empty-search">No matching tasks, notes, or evidence.</div> : null}</div> : <div className="archive-layout">
      <aside className="archive-side">
      {view === "calendar" ? <section className="card calendar-panel"><div className="calendar-heading"><div><h2>{new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(monthStart)}</h2></div><div className="calendar-nav"><Button variant="ghost" size="icon" aria-label="Previous month" onClick={() => setMonth(new Date(Date.UTC(year, monthIndex - 1, 1, 12)))}><ChevronDown size={16} className="rotate-left" /></Button><Button variant="ghost" size="icon" aria-label="Next month" onClick={() => setMonth(new Date(Date.UTC(year, monthIndex + 1, 1, 12)))}><ChevronDown size={16} className="rotate-right" /></Button></div></div><div className="calendar-grid calendar-weekdays">{["SU", "MO", "TU", "WE", "TH", "FR", "SA"].map((label) => <span key={label}>{label}</span>)}</div><div className="calendar-grid">{days.map((date, index) => { const dateKey = date === null ? null : getShiftDateKeyFromCivilDate(year, monthIndex, date); const hasShift = dateKey !== null && shiftDayKeys.has(dateKey); const count = dateKey ? taskCountByDay.get(dateKey) ?? 0 : 0; const isSelected = dateKey === activeDay; return date === null ? <span className="calendar-blank" key={`empty-${index}`} /> : <button key={dateKey} className={`calendar-day${isSelected ? " calendar-selected" : ""}${hasShift ? " has-shift" : ""}`} style={{ "--heat": Math.min(1, count / 6) } as React.CSSProperties} onClick={() => setDay(isSelected ? null : dateKey)} aria-label={`${dateKey}${hasShift ? ", saved shift" : ""}`} aria-pressed={isSelected}><span>{date}</span>{hasShift || count ? <i>{count || "·"}</i> : null}</button>; })}</div><div className="calendar-legend"><span><i className="legend-shift" /> Saved shift</span><span><i className="legend-task" /> Tasks</span></div></section> : <section className="card shift-list"><header className="card-head"><h2>Shifts <span className="count-badge">{shiftRows.length}</span></h2></header>{shiftRows.length ? <div className="row-list">{shiftRows.map((row) => <button className={`row-item shift-row${row.key === activeDay ? " selected" : ""}`} key={row.key} onClick={() => setDay(row.key)}><span className="row-title">{row.label}</span><span className={`pill${row.wrapped ? " ok" : ""}`}>{row.wrapped ? "Wrapped" : "Open"}</span><small>{row.done}/{row.total}</small><small>{row.time}</small></button>)}</div> : <p className="replay-empty">No shifts this month.</p>}<div className="calendar-nav list-nav"><Button variant="ghost" size="sm" onClick={() => setMonth(new Date(Date.UTC(year, monthIndex - 1, 1, 12)))}>← Prev</Button><span>{new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(monthStart)}</span><Button variant="ghost" size="sm" onClick={() => setMonth(new Date(Date.UTC(year, monthIndex + 1, 1, 12)))}>Next →</Button></div></section>}
        <section className="card"><header className="card-head"><h2>By project</h2></header>{projectBars.length ? <div className="bar-list">{projectBars.map((bar) => <div className="bar-row" key={bar.id}><span className="bar-name">{bar.name}</span><div className="bar-track"><span style={{ width: `${bar.pct}%` }} /></div><small>{bar.label}</small></div>)}</div> : <p className="replay-empty">No project time logged this month.</p>}</section>
      </aside>
      <div className="archive-main">
        <section className="card replay-head">
          <div><h2>{selectedDate ? formatDateLabel(selectedDate, "Asia/Kolkata") : "Pick a day"}</h2><small>5:30 PM → 3:30 AM IST{selectedShift ? "" : " · no shift saved"}</small></div>
          {selectedDate ? <div className="replay-chips"><Button size="sm" variant="outline" onClick={copyStandup}>Copy standup</Button><Button size="sm" variant="outline" onClick={() => downloadText(`nightshift-${activeDay}.json`, JSON.stringify({ shift: selectedShift ?? null, tasks: visibleDatedTasks, meetings: visibleDatedMeetings }, null, 2), "application/json")}><Download size={13} /> Day</Button><span className={`pill${selectedShift?.ended_at ? " ok" : ""}`}>{selectedShift?.ended_at ? "Wrapped up" : selectedShift ? "Open" : "No shift"}</span><span className="pill">{visibleDatedTasks.filter((task) => task.status === "done").length}/{visibleDatedTasks.length} tasks</span><span className="pill">{relativeDuration(visibleDatedTasks.reduce((sum, task) => sum + task.elapsed_seconds, 0))} logged</span></div> : null}
        </section>
        {selectedDate ? <div className="replay-grid">
          <section className="card"><header className="card-head"><h2><ListChecks size={14} /> Tasks <span className="count-badge">{visibleDatedTasks.length}</span></h2></header>{visibleDatedTasks.length ? <div className="replay-list">{visibleDatedTasks.map((task) => <div className="replay-item" key={task.id}><span className={`replay-check${task.status === "done" ? " done" : ""}`}>{task.status === "done" ? <Check size={11} /> : null}</span><div className="replay-body"><strong>{task.title}</strong><small>{data.projects.find((project) => project.id === task.project_id)?.name ?? "No project"} · {task.steps.filter((step) => step.completed).length}/{task.steps.length} steps{task.rollover ? " · rolled over" : ""}</small></div><span className={`priority-chip p-${task.priority}`}>{task.priority === "high" ? "HIGH" : task.priority === "low" ? "LOW" : "MED"}</span><span className="replay-time">{relativeDuration(task.elapsed_seconds)}</span></div>)}</div> : <p className="replay-empty">No tasks saved for this shift.</p>}</section>
          <section className="card"><header className="card-head"><h2><CalendarDays size={14} /> Meetings <span className="count-badge">{visibleDatedMeetings.length}</span></h2></header>{visibleDatedMeetings.length ? <div className="replay-list">{visibleDatedMeetings.map((meeting) => <div className="replay-item stack" key={meeting.id}><div className="replay-body"><strong>{meeting.title}</strong><small>{formatClock(new Date(meeting.starts_at), clientTz)} {zoneAbbr(new Date(meeting.starts_at), clientTz)} · {formatClock(new Date(meeting.starts_at), "Asia/Kolkata")} IST · {meeting.client_name || "Client"}</small></div>{meeting.notes ? <p className="replay-note">{meeting.notes}</p> : null}{meeting.action_items.length ? <ul className="replay-actions">{meeting.action_items.map((item) => <li key={item}>{item}</li>)}</ul> : null}</div>)}</div> : <p className="replay-empty">No meetings saved.</p>}</section>
          <section className="card"><header className="card-head"><h2><FileImage size={14} /> Evidence <span className="count-badge">{visibleDatedAttachments.length}</span></h2></header>{visibleDatedAttachments.length ? <div className="thumb-grid wide">{visibleDatedAttachments.map((attachment) => <button className="thumb" key={attachment.id} onClick={() => onAttachment(attachment.id)} title={attachment.file_name}>{attachment.previewUrl ? <img src={attachment.previewUrl} alt={attachment.file_name} /> : <FileImage size={18} />}</button>)}</div> : <p className="replay-empty">No evidence saved.</p>}</section>
          <section className="card"><header className="card-head"><h2><Clipboard size={14} /> Handover note</h2></header>{selectedShift?.wrap_up ? <p className="replay-note">{selectedShift.wrap_up}</p> : <p className="replay-empty">No handover note.</p>}{selectedShift?.focus_notes ? <><div className="replay-sub">Scratchpad</div><p className="replay-note">{selectedShift.focus_notes}</p></> : null}</section>
        </div> : <section className="card"><p className="replay-empty">Select a date on the calendar to replay that shift.</p></section>}
      </div>
    </div>}
  </div>;
}

function PasteNotesDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (items: string[]) => Promise<void> }) {
  const [text, setText] = useState("");
  const items = extractActionItems(text);
  return <ModalShell title="Paste notes or email" description="" onClose={onClose}>
    <div className="modal-form">
      <Textarea autoFocus value={text} onChange={(event) => setText(event.target.value)} placeholder={"Paste text. Bullets, numbered lines and “Action:” lines become tasks."} />
      {items.length ? <ul className="extract-list">{items.map((item) => <li key={item}><Check size={13} /> {item}</li>)}</ul> : <p className="field-helper">No action items found yet.</p>}
      <div className="modal-actions"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={!items.length} onClick={() => void onCreate(items).then(onClose)}>Add {items.length || ""} to tonight</Button></div>
    </div>
  </ModalShell>;
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

function TaskModal({ userId, shiftId, projects, templates, defaultBucket, defaultProjectId, onClose, onSave }: { userId: string; shiftId: string | null; defaultProjectId: string; projects: Project[]; templates: WorkflowTemplate[]; defaultBucket: PlanBucket; onClose: () => void; onSave: (task: { title: string; description: string; project_id: string | null; planning_bucket: PlanBucket; planned_date: string | null; priority: TaskPriority; steps: string[]; shift_id: string | null }) => Promise<void> }) {
  const [title, setTitle] = useState(""); const [description, setDescription] = useState(""); const [projectId, setProjectId] = useState(defaultProjectId); const [bucket, setBucket] = useState(defaultBucket); const [priority, setPriority] = useState<TaskPriority>("normal"); const [steps, setSteps] = useState(""); const [templateId, setTemplateId] = useState(""); const [saving, setSaving] = useState(false);
  function useWorkflow(id: string) { setTemplateId(id); const template = templates.find((item) => item.id === id); if (template) { setTitle(template.name); setProjectId(template.project_id ?? defaultProjectId); setSteps(template.steps.join("\n")); } }
  const save = async (event: FormEvent) => { event.preventDefault(); if (!title.trim() || !projectId) return; setSaving(true); const plannedDate = bucket === "tonight" ? getShiftDateKey(new Date()) : bucket === "tomorrow" ? getShiftDateKeyFromStart(getNextShiftDate(new Date())) : null; try { await onSave({ title: title.trim(), description: description.trim(), project_id: projectId || null, planning_bucket: bucket, planned_date: plannedDate, priority, steps: steps.split("\n").map((step) => step.trim()).filter(Boolean), shift_id: bucket === "tonight" ? shiftId : null }); } finally { setSaving(false); } };
  return <ModalShell title="New task" description="" onClose={onClose}><form className="modal-form" onSubmit={save}><label className="field-label" htmlFor="task-title">Task</label><Input id="task-title" autoFocus required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What needs to get done?" /><label className="field-label" htmlFor="task-notes">Notes</label><Textarea id="task-notes" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Context, handoff, or definition of done" /><div className="form-split"><label className="field-label" htmlFor="task-project">Project<select id="task-project" required value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="" disabled>Select a project *</option>{projects.filter((project) => !project.archived_at).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label className="field-label" htmlFor="task-bucket">Plan<select id="task-bucket" value={bucket} onChange={(event) => setBucket(event.target.value as PlanBucket)}>{BUCKET_OPTIONS.map((option) => <option value={option.id} key={option.id}>{option.label}</option>)}</select></label></div><div className="form-split"><label className="field-label" htmlFor="task-priority">Priority<select id="task-priority" value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}><option value="high">High</option><option value="normal">Medium</option><option value="low">Low</option></select></label>{templates.length ? <label className="field-label" htmlFor="task-template">Use workflow<select id="task-template" value={templateId} onChange={(event) => useWorkflow(event.target.value)}><option value="">Start fresh</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label> : <span />}</div><label className="field-label" htmlFor="task-steps">Checklist <small>One step per line</small></label><Textarea id="task-steps" value={steps} onChange={(event) => setSteps(event.target.value)} placeholder={"Gather references\nDraft the update\nSend for review"} /><div className="modal-actions"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving || !title.trim()}>{saving ? <LoaderCircle size={15} className="spin" /> : <Plus size={15} />} Add task</Button></div></form></ModalShell>;
}

function WrapModal({ shift, tasks, onClose, onSave, onCopy, busy }: { shift: Shift | null; tasks: Task[]; onClose: () => void; onSave: (text: string) => Promise<void>; onCopy: (target: "Slack" | "Teams" | "Email" | "Client") => void; busy: boolean }) {
  const [note, setNote] = useState(shift?.wrap_up ?? "");
  const completed = tasks.filter((task) => task.planning_bucket === "tonight" && task.status === "done");
  const pending = tasks.filter((task) => task.planning_bucket === "tonight" && task.status !== "done");
  const save = (event: FormEvent) => { event.preventDefault(); void onSave(note); };
  return <ModalShell title="Wrap up" description="" onClose={onClose} className="wrap-modal"><div className="wrap-tally"><div><CheckCircle2 size={16} /><strong>{completed.length} completed</strong></div><div><ArrowDownToLine size={16} /><strong>{pending.length} rolling over</strong></div></div><div className="wrap-task-summary">{pending.length ? pending.map((task) => <div key={task.id}><span className="replay-check" />{task.title}</div>) : <p>Your queue is clear for the next shift.</p>}</div><form className="modal-form" onSubmit={save}><label className="field-label" htmlFor="wrap-note">What should you remember?</label><Textarea id="wrap-note" autoFocus value={note} onChange={(event) => setNote(event.target.value)} placeholder="Handoff notes, blockers, or tomorrow's first move" /><div className="wrap-share"><span className="eyebrow">COPY A HANDOFF</span><div><Button type="button" variant="outline" size="sm" onClick={() => onCopy("Slack")}><Copy size={14} /> Slack</Button><Button type="button" variant="outline" size="sm" onClick={() => onCopy("Teams")}><Copy size={14} /> Teams</Button><Button type="button" variant="outline" size="sm" onClick={() => onCopy("Email")}><Copy size={14} /> Email</Button><Button type="button" variant="outline" size="sm" onClick={() => onCopy("Client")}><Copy size={14} /> Client</Button></div></div><div className="modal-actions"><Button type="button" variant="ghost" onClick={onClose}>Keep working</Button><Button type="submit" disabled={busy}>Save wrap-up</Button></div></form></ModalShell>;
}

function EvidenceDialog({ file, busy, onClose, onSave }: { file: File; busy: boolean; onClose: () => void; onSave: (file: File) => void }) {
  const [preview, setPreview] = useState(""); const [name, setName] = useState(file.name || "pasted-evidence.png"); const [redact, setRedact] = useState(false); const canvasRef = useRef<HTMLCanvasElement>(null); const imageRef = useRef<HTMLImageElement>(null); const [marked, setMarked] = useState(false);
  useEffect(() => { if (!file.size) { setPreview(""); return; } const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url); }, [file]);
  function onMark(event: React.MouseEvent<HTMLCanvasElement>) { const canvas = canvasRef.current; const image = imageRef.current; if (!canvas || !image) return; const rect = image.getBoundingClientRect(); const ctx = canvas.getContext("2d"); if (!ctx) return; canvas.width = image.naturalWidth; canvas.height = image.naturalHeight; ctx.drawImage(image, 0, 0); setMarked(true); const scaleX = image.naturalWidth / rect.width; const scaleY = image.naturalHeight / rect.height; const x = Math.max(0, (event.clientX - rect.left) * scaleX); const y = Math.max(0, (event.clientY - rect.top) * scaleY); ctx.fillStyle = redact ? "#161c1c" : "#c7efdf"; ctx.strokeStyle = "#161c1c"; ctx.lineWidth = Math.max(4, image.naturalWidth / 180); ctx.fillRect(x - ctx.lineWidth * 4, y - ctx.lineWidth * 2, ctx.lineWidth * 8, ctx.lineWidth * 4); ctx.strokeRect(x - ctx.lineWidth * 4, y - ctx.lineWidth * 2, ctx.lineWidth * 8, ctx.lineWidth * 4); canvas.toBlob((blob) => { if (blob) setPreview(URL.createObjectURL(blob)); }, "image/png"); }
  async function save() { const finalFile = marked && canvasRef.current?.toBlob ? await new Promise<File>((resolve) => canvasRef.current?.toBlob((blob) => resolve(new File([blob ?? file], name, { type: "image/png" })), "image/png")) : file; onSave(finalFile); }
  return <ModalShell title="Save shift evidence" description="Mark a screenshot or cover a detail before saving it to private storage." onClose={onClose} className="evidence-modal"><div className="evidence-tools"><Button variant={redact ? "secondary" : "outline"} size="sm" onClick={() => setRedact(!redact)}><span className={`redact-swatch${redact ? " redact-active" : ""}`} />{redact ? "Redact marks" : "Highlight marks"}</Button><span>Click the image to mark a spot</span></div><div className="evidence-preview">{preview ? <><img ref={imageRef} src={preview} alt="Screenshot to save" onClick={onMark} /><canvas ref={canvasRef} hidden /></> : <div className="evidence-empty"><ImagePlus size={22} />Choose a screenshot from this device to save it.</div>}</div><label className="field-label" htmlFor="evidence-name">File name</label><Input id="evidence-name" value={name} onChange={(event) => setName(event.target.value)} /><div className="modal-actions"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={() => void save()} disabled={busy || !file.size || !name.trim()}><Upload size={15} /> Save privately</Button></div></ModalShell>;
}

function AttachmentDialog({ attachment, busy, onClose, onSaveNote, onDelete }: { attachment: Attachment; busy: boolean; onClose: () => void; onSaveNote: (note: string) => void; onDelete: () => void }) {
  const [note, setNote] = useState(attachment.note);
  return <ModalShell title={attachment.file_name} description="Private shift evidence. Signed previews expire; reopen the record to load a fresh one." onClose={onClose} className="attachment-modal">{attachment.previewUrl ? <div className="attachment-preview"><img src={attachment.previewUrl} alt={attachment.file_name} /></div> : <div className="attachment-unavailable"><FileImage size={23} /><span>Preview unavailable. Reload the page to request another private link.</span></div>}<label className="field-label" htmlFor="attachment-note">Note</label><Textarea id="attachment-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="What should this screenshot remind you of?" /><div className="modal-actions"><Button variant="ghost" onClick={onDelete} disabled={busy}><Trash2 size={14} /> Remove</Button><span /><Button variant="outline" onClick={onClose}>Close</Button><Button onClick={() => onSaveNote(note)} disabled={busy || note === attachment.note}>Save note</Button></div></ModalShell>;
}