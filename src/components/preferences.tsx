import { Button } from "@/components/ui/button";
import { ModalShell } from "@/components/ui-kit";
import { DEFAULT_PREFS, type Prefs } from "@/lib/prefs";
import type { Project } from "@/lib/tracker-types";

export function PreferencesDialog({ prefs, onChange, projects, clientId, onClient, onClose }: {
  prefs: Prefs; onChange: (prefs: Prefs) => void; projects: Project[]; clientId: string; onClient: (id: string) => void; onClose: () => void;
}) {
  const set = <K extends keyof Prefs>(key: K, value: Prefs[K]) => onChange({ ...prefs, [key]: value });
  return <ModalShell title="Preferences" onClose={onClose} className="prefs">
    <div className="prefs-body">
      <section className="pref-group">
        <h3>Clock</h3>
        <div className="pref-row"><span>Time format</span><div className="segmented small"><button aria-selected={prefs.hour12} onClick={() => set("hour12", true)}>12-hour</button><button aria-selected={!prefs.hour12} onClick={() => set("hour12", false)}>24-hour</button></div></div>
        <label className="pref-row"><span>Show seconds</span><input type="checkbox" checked={prefs.seconds} onChange={(event) => set("seconds", event.target.checked)} /></label>
        <label className="pref-row"><span>Default client time zone</span><select value={clientId} onChange={(event) => onClient(event.target.value)}><option value="">New York (default)</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.client_name || project.name} · {project.timezone.replace("_", " ")}</option>)}</select></label>
      </section>
      <section className="pref-group">
        <h3>Timers</h3>
        <label className="pref-row"><span>Remind me when a timer runs longer than</span><select value={prefs.timerReminderMin} onChange={(event) => set("timerReminderMin", Number(event.target.value))}>{[0, 30, 45, 60, 90, 120].map((minutes) => <option key={minutes} value={minutes}>{minutes ? `${minutes} min` : "Never"}</option>)}</select></label>
        <label className="pref-row"><span>Pause other timers when I start a new one</span><input type="checkbox" checked={prefs.singleTimer} onChange={(event) => set("singleTimer", event.target.checked)} /></label>
      </section>
      <section className="pref-group">
        <h3>Shift</h3>
        <label className="pref-row"><span>Show the wrap-up prompt</span><select value={prefs.wrapLeadMin} onChange={(event) => set("wrapLeadMin", Number(event.target.value))}>{[10, 15, 20, 30].map((minutes) => <option key={minutes} value={minutes}>{minutes} min before 3:30 AM</option>)}</select></label>
        <p className="field-helper">The shift window is fixed at 5:30 PM – 3:30 AM IST. Clocks follow this device.</p>
      </section>
      <div className="modal-actions split"><Button variant="ghost" onClick={() => onChange(DEFAULT_PREFS)}>Reset to defaults</Button><Button onClick={onClose}>Done</Button></div>
    </div>
  </ModalShell>;
}
