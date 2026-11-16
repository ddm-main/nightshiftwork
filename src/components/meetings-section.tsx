import { useMemo, useState, type FormEvent } from "react";
import { CalendarDays, Download, ExternalLink, Link2, ListChecks, Mail, Plus, Search, Trash2, Video, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Empty, ModalShell, zoneAbbr } from "@/components/ui-kit";
import { extractActionItems } from "@/lib/actions";
import { composeMeta, normalizeLinks, parseMeta, type MeetingKind } from "@/lib/meta";
import { formatClock, getShiftDateKey, getShiftState, isoToIstDateTimeInput, istDateTimeInputToIso } from "@/lib/night-shift";
import { toast } from "sonner";
import type { Meeting, Project } from "@/lib/tracker-types";

const dayLabel = (key: string) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "short", day: "numeric" }).format(new Date(`${key}T12:00:00Z`));

function countdown(start: Date, end: Date | null, now: Date) {
  const mins = Math.round((start.getTime() - now.getTime()) / 60_000);
  if (end && now >= start && now <= end) return { text: "Live now", tone: "live" };
  if (mins < 0) return { text: "Ended", tone: "past" };
  if (mins < 60) return { text: `In ${Math.max(1, mins)}m`, tone: mins <= 30 ? "soon" : "later" };
  if (mins < 24 * 60) return { text: `In ${Math.floor(mins / 60)}h ${mins % 60}m`, tone: "later" };
  return { text: `In ${Math.floor(mins / 1440)}d ${Math.floor((mins % 1440) / 60)}h`, tone: "later" };
}

export function MeetingsSection({ meetings, projects, now, tz, onOpen, onAdd, onImport, onTasks, outlookConnected, outlookSyncing, onOutlook }: {
  meetings: Meeting[]; projects: Project[]; now: Date; tz: string; outlookConnected: boolean; outlookSyncing: boolean; onOutlook: () => void;
  onOpen: (meeting: Meeting) => void; onAdd: () => void; onImport: (file: File) => void; onTasks: (meeting: Meeting) => void;
}) {
  const [tab, setTab] = useState<"upcoming" | "past" | "all">("upcoming");
  const [query, setQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState<"all" | MeetingKind>("all");
  const kindOf = (meeting: Meeting): MeetingKind => parseMeta(meeting.agenda).meta.kind ?? (meeting.project_id ? "external" : "internal");

  const upcoming = meetings.filter((meeting) => new Date(meeting.ends_at ?? meeting.starts_at) >= now);
  const past = meetings.filter((meeting) => new Date(meeting.ends_at ?? meeting.starts_at) < now);
  const weekAhead = upcoming.filter((meeting) => new Date(meeting.starts_at).getTime() - now.getTime() <= 7 * 86_400_000).length;
  const withActions = meetings.reduce((sum, meeting) => sum + meeting.action_items.length, 0);
  const missingNotes = past.filter((meeting) => !meeting.notes.trim()).length;

  const visible = useMemo(() => {
    const base = tab === "upcoming" ? upcoming : tab === "past" ? past : meetings;
    return base
      .filter((meeting) => projectFilter === "all" || meeting.project_id === projectFilter)
      .filter((meeting) => kindFilter === "all" || kindOf(meeting) === kindFilter)
      .filter((meeting) => `${meeting.title} ${meeting.client_name} ${meeting.notes} ${meeting.agenda}`.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => tab === "past" ? b.starts_at.localeCompare(a.starts_at) : a.starts_at.localeCompare(b.starts_at));
  }, [tab, meetings, query, projectFilter, kindFilter, now]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = new Map<string, Meeting[]>();
  for (const meeting of visible) {
    const key = getShiftDateKey(new Date(meeting.starts_at)); // group by the night shift a meeting belongs to, not the calendar day
    groups.set(key, [...(groups.get(key) ?? []), meeting]);
  }

  return <div className="content-wrap meetings">
    <div className="page-head">
      <div className="page-title"><h1>Meetings</h1><span className="chip">{upcoming.length} upcoming</span></div>
      <div className="page-actions">
        <Button variant="outline" size="sm" onClick={onOutlook} disabled={outlookSyncing}><Mail size={14} /> {outlookConnected ? (outlookSyncing ? "Syncing…" : "Sync Outlook") : "Connect Outlook"}</Button>
        <label className="icon-btn wide" title="Import a .ics calendar file"><Download size={14} /> Import .ics<input type="file" accept=".ics,text/calendar" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) onImport(file); event.target.value = ""; }} /></label>
        <Button className="primary-action" size="sm" onClick={onAdd}><Plus size={14} /> Meeting</Button>
      </div>
    </div>
    <div className="stat-row stat-row-4">
      <div className="stat-tile"><span className="stat-label">Upcoming</span><strong className="stat-value tone-cyan">{upcoming.length}</strong><small>{weekAhead} in the next 7 days</small></div>
      <div className="stat-tile"><span className="stat-label">Past</span><strong className="stat-value">{past.length}</strong><small>{missingNotes} without notes</small></div>
      <div className="stat-tile"><span className="stat-label">Action items</span><strong className="stat-value tone-green">{withActions}</strong><small>captured from meetings</small></div>
      <div className="stat-tile"><span className="stat-label">Internal · External</span><strong className="stat-value">{upcoming.filter((meeting) => kindOf(meeting) === "internal").length}<em> · {upcoming.filter((meeting) => kindOf(meeting) === "external").length}</em></strong><small>upcoming · client time {formatClock(now, tz)} {zoneAbbr(now, tz)}</small></div>
    </div>
    <div className="toolbar">
      <div className="segmented" role="tablist">{(["upcoming", "past", "all"] as const).map((value) => <button key={value} role="tab" aria-selected={tab === value} onClick={() => setTab(value)}>{value}</button>)}</div>
      <div className="segmented" role="tablist" aria-label="Meeting type">{(["all", "internal", "external"] as const).map((value) => <button key={value} role="tab" aria-selected={kindFilter === value} onClick={() => setKindFilter(value)}>{value}</button>)}</div>
      <div className="search-field"><Search size={15} /><Input aria-label="Search meetings" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, client or notes" /></div>
      <select aria-label="Filter by project" value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}><option value="all">All projects</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
    </div>
    <div className="agenda">
      {groups.size ? [...groups.entries()].map(([key, list]) => <section className="agenda-day" key={key}>
        <header className="agenda-head"><h2>{dayLabel(key)} <small>shift</small></h2><span className="count-badge">{list.length}</span></header>
        <div className="agenda-list">{list.map((meeting) => {
          const start = new Date(meeting.starts_at); const end = meeting.ends_at ? new Date(meeting.ends_at) : null;
          const status = countdown(start, end, now);
          const minutes = end && end > start ? Math.round((end.getTime() - start.getTime()) / 60_000) : null;
          const project = projects.find((item) => item.id === meeting.project_id);
          const zone = project?.timezone ?? tz;
          return <article className="agenda-item" key={meeting.id} role="button" tabIndex={0} onClick={() => onOpen(meeting)} onKeyDown={(event) => { if (event.key === "Enter") onOpen(meeting); }}>
            <div className="agenda-time"><strong>{formatClock(start, zone)}</strong><small>{zoneAbbr(start, zone)} · {formatClock(start, "Asia/Kolkata")} IST</small></div>
            <div className="agenda-body"><strong>{meeting.title}</strong><span>{[project?.name, meeting.client_name, minutes ? `${minutes} min` : null, getShiftState(start) === "active" ? null : "outside shift hours"].filter(Boolean).join(" · ") || "No client set"}</span>{meeting.action_items.length ? <small className="agenda-actions"><ListChecks size={12} /> {meeting.action_items.length} action item{meeting.action_items.length === 1 ? "" : "s"}</small> : null}</div>
            <span className={`chip kind ${kindOf(meeting)}`}>{kindOf(meeting)}</span>
            {parseMeta(meeting.agenda).meta.links[0] ? <a className="join-link" href={parseMeta(meeting.agenda).meta.links[0]} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}><Video size={13} /> Join</a> : null}
            <span className={`chip when ${status.tone}`}>{status.text}</span>
            {meeting.action_items.length ? <Button variant="outline" size="sm" onClick={(event) => { event.stopPropagation(); onTasks(meeting); }}>→ Tasks</Button> : null}
          </article>;
        })}</div>
      </section>) : <Empty icon={<CalendarDays size={20} />} text={meetings.length ? "No meetings match these filters" : "No meetings yet — add one or import a calendar file"} action={<Button variant="outline" size="sm" onClick={onAdd}><Plus size={14} /> Add meeting</Button>} />}
    </div>
  </div>;
}

export function MeetingDialog({ meeting, projects, tz, onClose, onSave, onDelete, onCreateTasks }: {
  meeting: Meeting; projects: Project[]; tz: string; onClose: () => void;
  onSave: (changes: Partial<Meeting>) => Promise<void>; onDelete: () => Promise<void>;
  onCreateTasks: (items: string[], projectId: string | null) => Promise<void>;
}) {
  const [title, setTitle] = useState(meeting.title);
  const [projectId, setProjectId] = useState(meeting.project_id ?? "");
  const [client, setClient] = useState(meeting.client_name);
  const [starts, setStarts] = useState(isoToIstDateTimeInput(meeting.starts_at));
  const [ends, setEnds] = useState(meeting.ends_at ? isoToIstDateTimeInput(meeting.ends_at) : "");
  const parsedAgenda = parseMeta(meeting.agenda);
  const [agendaBody, setAgendaBody] = useState(parsedAgenda.body);
  const [kind, setKind] = useState<MeetingKind>(parsedAgenda.meta.kind ?? (meeting.project_id ? "external" : "internal"));
  const [linksText, setLinksText] = useState(parsedAgenda.meta.links.join("\n"));
  const [dossier, setDossier] = useState(meeting.dossier);
  const [notes, setNotes] = useState(meeting.notes);
  const [actions, setActions] = useState(meeting.action_items.join("\n"));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const items = actions.split("\n").map((item) => item.trim()).filter(Boolean);
  const start = new Date(meeting.starts_at);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !starts) return;
    if (ends && istDateTimeInputToIso(ends) <= istDateTimeInputToIso(starts)) { toast.error("The meeting must end after it starts."); return; }
    await onSave({ title: title.trim(), project_id: projectId || null, client_name: client.trim(), starts_at: istDateTimeInputToIso(starts), ends_at: ends ? istDateTimeInputToIso(ends) : null, agenda: composeMeta(agendaBody, { kind, links: normalizeLinks(linksText) }), dossier, notes, action_items: items });
    onClose();
  };

  return <ModalShell title="Meeting" onClose={onClose}>
    <div className="meeting-meta"><span>{formatClock(start, tz)} {zoneAbbr(start, tz)}</span><span>{formatClock(start, "Asia/Kolkata")} IST</span></div>
    <form className="modal-form" onSubmit={submit}>
      <label className="field-label" htmlFor="m-title">Title</label>
      <Input id="m-title" required value={title} onChange={(event) => setTitle(event.target.value)} />
      <div className="form-split">
        <label className="field-label" htmlFor="m-project">Project<select id="m-project" value={projectId} onChange={(event) => { setProjectId(event.target.value); const project = projects.find((item) => item.id === event.target.value); if (project && !client) setClient(project.client_name); }}><option value="">No project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
        <label className="field-label" htmlFor="m-client">Client<Input id="m-client" value={client} onChange={(event) => setClient(event.target.value)} /></label>
      </div>
      <div className="form-split">
        <label className="field-label" htmlFor="m-start">Starts · IST<Input id="m-start" type="datetime-local" required value={starts} onChange={(event) => setStarts(event.target.value)} /></label>
        <label className="field-label" htmlFor="m-end">Ends · IST<Input id="m-end" type="datetime-local" value={ends} onChange={(event) => setEnds(event.target.value)} /></label>
      </div>
      <div className="form-split">
        <label className="field-label" htmlFor="m-kind">Type<select id="m-kind" value={kind} onChange={(event) => setKind(event.target.value as MeetingKind)}><option value="internal">Internal (team)</option><option value="external">External (client)</option></select></label>
        <label className="field-label" htmlFor="m-links">Links (join, docs, tickets)<Textarea id="m-links" className="td-links" value={linksText} onChange={(event) => setLinksText(event.target.value)} placeholder="https://…" /></label>
      </div>
      {normalizeLinks(linksText).length ? <div className="link-chips">{normalizeLinks(linksText).map((link) => <a key={link} href={link} target="_blank" rel="noreferrer"><Link2 size={12} /> {link.replace(/^https?:\/\//, "").slice(0, 40)} <ExternalLink size={11} /></a>)}</div> : null}
      <label className="field-label" htmlFor="m-agenda">Agenda</label>
      <Textarea id="m-agenda" value={agendaBody} onChange={(event) => setAgendaBody(event.target.value)} placeholder="Topics to cover" />
      <label className="field-label" htmlFor="m-dossier">Context</label>
      <Textarea id="m-dossier" value={dossier} onChange={(event) => setDossier(event.target.value)} placeholder="Client context or questions" />
      <label className="field-label" htmlFor="m-notes">What happened (notes, decisions)</label>
      <Textarea id="m-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Paste notes or an email — bullets and “Action:” lines become action items" />
      <div className="field-row"><label className="field-label" htmlFor="m-actions">Action items ({items.length})</label><Button type="button" variant="ghost" size="sm" onClick={() => setActions([...new Set([...items, ...extractActionItems(notes)])].join("\n"))}><WandSparkles size={13} /> Extract from notes</Button></div>
      <Textarea id="m-actions" value={actions} onChange={(event) => setActions(event.target.value)} placeholder="One per line" />
      <div className="modal-actions split">
        {confirmDelete
          ? <span className="confirm-row">Delete this meeting?<Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>No</Button><Button type="button" size="sm" className="danger" onClick={() => void onDelete().then(onClose)}>Yes, delete</Button></span>
          : <Button type="button" variant="ghost" className="danger-ghost" onClick={() => setConfirmDelete(true)}><Trash2 size={14} /> Delete</Button>}
        <span className="modal-actions-right">
          <Button type="button" variant="outline" disabled={!items.length} onClick={() => void onCreateTasks(items, projectId || null)}><ListChecks size={14} /> Add {items.length || ""} to tonight</Button>
          <Button type="submit">Save</Button>
        </span>
      </div>
    </form>
  </ModalShell>;
}
