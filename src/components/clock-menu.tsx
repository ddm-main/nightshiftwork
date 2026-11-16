import { useEffect, useState } from "react";
import { Clock3 } from "lucide-react";
import { zoneAbbr, timeLeftUntil } from "@/components/ui-kit";
import { formatClock, istGapHours, type ShiftState } from "@/lib/night-shift";
import type { Project } from "@/lib/tracker-types";

const dayText = (date: Date, timeZone: string) => new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", month: "short", day: "numeric" }).format(date);

export function ClockMenu({ now, clientTz, clientId, projects, onClient, shiftState, shiftStart, shiftEnd, nextShift, gapChange }: {
  now: Date; clientTz: string; clientId: string; projects: Project[]; onClient: (id: string) => void;
  shiftState: ShiftState; shiftStart: Date; shiftEnd: Date; nextShift: Date; gapChange: { inDays: number; from: number; to: number } | null;
}) {
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = hover || pinned;

  useEffect(() => {
    if (!pinned) return;
    const close = (event: MouseEvent) => { if (!(event.target as HTMLElement).closest(".clock-wrap")) setPinned(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [pinned]);

  const left = Math.max(0, Math.floor((shiftEnd.getTime() - now.getTime()) / 60_000));
  const status = shiftState === "active" ? `Live · ${Math.floor(left / 60)}h ${left % 60}m left` : shiftState === "after" ? "Handover window" : `Starts in ${timeLeftUntil(shiftStart, now)}`;

  return <div className="menu-wrap clock-wrap" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
    <button className={`clock-btn${shiftState === "active" ? " live" : ""}`} aria-label="Clock details" aria-expanded={open} onClick={() => setPinned(!pinned)}>
      <Clock3 size={15} /><span className="clock-time">{formatClock(now, "Asia/Kolkata")}</span><span className="clock-zone">IST</span>
    </button>
    {open ? <div className="popover clock-pop" role="dialog" aria-label="Clock details">
      <div className="clock-rows">
        <div className="clock-row"><span className="zone-label">India</span><strong>{formatClock(now, "Asia/Kolkata")}</strong><small>IST · {dayText(now, "Asia/Kolkata")}</small></div>
        <div className="clock-row client"><span className="zone-label">Client</span><strong>{formatClock(now, clientTz)}</strong><small>{zoneAbbr(now, clientTz)} · {dayText(now, clientTz)}</small></div>
      </div>
      <label className="clock-field">Client<select aria-label="Active client" value={clientId} onChange={(event) => onClient(event.target.value)}><option value="">Default · New York</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.client_name || project.name} · {zoneAbbr(now, project.timezone)}</option>)}</select></label>
      <dl className="clock-facts">
        <div><dt>Gap</dt><dd>IST is {istGapHours(now, clientTz)}h ahead</dd></div>
        {gapChange ? <div className="warn"><dt>Time change</dt><dd>in {gapChange.inDays}d → {gapChange.to}h gap</dd></div> : null}
        <div><dt>Shift</dt><dd>5:30 PM – 3:30 AM IST</dd></div>
        <div><dt>Status</dt><dd className={shiftState === "active" ? "live" : ""}>{status}</dd></div>
        <div><dt>Next shift</dt><dd>{dayText(nextShift, "Asia/Kolkata")}</dd></div>
      </dl>
    </div> : null}
  </div>;
}
