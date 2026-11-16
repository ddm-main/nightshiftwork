import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PlanBucket, TaskPriority, TaskStatus } from "@/lib/tracker-types";

export const BUCKET_OPTIONS: { id: PlanBucket; label: string }[] = [
  { id: "tonight", label: "Tonight" },
  { id: "tomorrow", label: "Tomorrow" },
  { id: "next_7_days", label: "Next 7 days" },
  { id: "next_30_days", label: "Next 30 days" },
  { id: "backlog", label: "Backlog" },
];

export const BUCKET_COPY: Record<PlanBucket, string> = {
  tonight: "Tonight", tomorrow: "Tomorrow", next_7_days: "Next 7 days", next_30_days: "Next 30 days", backlog: "Backlog",
};

export const PRIORITY_LABEL: Record<TaskPriority, string> = { high: "High", normal: "Medium", low: "Low" };
export const STATUS_LABEL: Record<TaskStatus, string> = { queued: "Queued", in_progress: "Running", done: "Done", blocked: "Blocked" };
export const BRAND_MARKS = ["project-tone-0", "project-tone-1", "project-tone-2", "project-tone-3"];

export const TIMEZONES = [
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Toronto",
  "Europe/London", "Europe/Berlin", "Europe/Paris", "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore", "Asia/Tokyo", "Australia/Sydney",
];

export function relativeDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  return `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function shortDuration(totalSeconds: number) {
  if (totalSeconds < 60) return totalSeconds > 0 ? "<1m" : "0m";
  if (totalSeconds < 3600) return `${Math.round(totalSeconds / 60)}m`;
  return `${(totalSeconds / 3600).toFixed(1)}h`;
}

export function timeLeftUntil(target: Date, now: Date) {
  const seconds = Math.max(0, Math.floor((target.getTime() - now.getTime()) / 1000));
  return `${String(Math.floor(seconds / 3600)).padStart(2, "0")}h ${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")}m`;
}

export function zoneAbbr(date: Date, timeZone: string) {
  if (timeZone === "Asia/Kolkata") return "IST";
  return new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" }).formatToParts(date).find((part) => part.type === "timeZoneName")?.value ?? timeZone;
}

export function PriorityChip({ priority }: { priority: TaskPriority }) {
  return <span className={`priority-chip p-${priority}`}>{priority === "high" ? "HIGH" : priority === "low" ? "LOW" : "MEDIUM"}</span>;
}

export function ModalShell({ title, onClose, children, className = "" }: { title: string; description?: string; onClose: () => void; children: ReactNode; className?: string }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className={`modal-panel ${className}`} role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-heading"><div><h2 id="modal-title">{title}</h2></div><Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}><X size={17} /></Button></div>{children}</section></div>;
}

export function Empty({ icon, text, action }: { icon: ReactNode; text: string; action?: ReactNode }) {
  return <div className="empty-block">{icon}<span>{text}</span>{action}</div>;
}
