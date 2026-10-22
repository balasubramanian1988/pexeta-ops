// Task rules shared by pages and server actions: labels, colours, overdue / acknowledgement logic.
import type { Priority, Settings, Status, Task } from "./types";

export const STATUS_LABEL: Record<Status, string> = {
  assigned: "Assigned",
  acknowledged: "Acknowledged",
  in_progress: "In progress",
  blocked: "Blocked",
  completed: "Awaiting VP closure",
  closed: "Closed",
  reopened: "Reopened",
};

export const STATUS_STYLE: Record<Status, string> = {
  assigned: "bg-slate-100 text-slate-700 ring-slate-300",
  acknowledged: "bg-sky-50 text-sky-800 ring-sky-200",
  in_progress: "bg-blue-50 text-blue-800 ring-blue-200",
  blocked: "bg-red-50 text-red-800 ring-red-200",
  completed: "bg-amber-50 text-amber-900 ring-amber-300",
  closed: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  reopened: "bg-violet-50 text-violet-800 ring-violet-200",
};

export const PRIORITY_LABEL: Record<Priority, string> = { low: "Low", medium: "Medium", high: "High", urgent: "Urgent" };
export const PRIORITY_STYLE: Record<Priority, string> = {
  low: "text-slate-500",
  medium: "text-blue-700",
  high: "text-orange-600",
  urgent: "text-red-600 font-semibold",
};
export const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export const OPEN_STATUSES: Status[] = ["assigned", "acknowledged", "in_progress", "blocked", "reopened"];
export const ACTIVE_STATUSES: Status[] = [...OPEN_STATUSES, "completed"];

/** Today's date in India, as YYYY-MM-DD. */
export function todayIST(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isOpen(t: Task) {
  return OPEN_STATUSES.includes(t.status);
}

/** Overdue: still open, and today is past due date + grace days. */
export function isOverdue(t: Task, s: Settings, today = todayIST()) {
  return isOpen(t) && today > addDays(t.due_date, s.overdue_grace_days);
}

/** Due date has passed (even within the grace period). */
export function isPastDue(t: Task, today = todayIST()) {
  return isOpen(t) && today > t.due_date;
}

export function needsAck(t: Task) {
  return t.status === "assigned" || t.status === "reopened";
}

/** Unacknowledged beyond the acknowledgement window. */
export function isAckLate(t: Task, s: Settings, now = Date.now()) {
  return needsAck(t) && now - new Date(t.assigned_at).getTime() > s.ack_window_hours * 3600 * 1000;
}

export function daysUntil(date: string, today = todayIST()) {
  return Math.round((new Date(date + "T00:00:00Z").getTime() - new Date(today + "T00:00:00Z").getTime()) / 86400000);
}

export function dueLabel(t: Task, today = todayIST()) {
  const d = daysUntil(t.due_date, today);
  if (!isOpen(t)) return formatDate(t.due_date);
  if (d === 0) return "Due today";
  if (d === 1) return "Due tomorrow";
  if (d > 1) return `Due in ${d} days`;
  return d === -1 ? "1 day late" : `${-d} days late`;
}

export function formatDate(d: string) {
  return new Date(d.length === 10 ? d + "T00:00:00" : d).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

export function formatDateTime(d: string) {
  return new Date(d).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

export function taskRef(t: Pick<Task, "ref">) {
  return `PX-${t.ref}`;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export const ACTIVITY_LABEL: Record<string, string> = {
  created: "Created and assigned",
  acknowledged: "Acknowledged",
  started: "Started work",
  progress: "Updated progress",
  blocked: "Marked blocked",
  unblocked: "Unblocked",
  completed: "Submitted for VP closure",
  closed: "Verified and closed",
  reopened: "Reopened",
  reassigned: "Reassigned",
  due_changed: "Changed due date",
  comment: "Commented",
  edited: "Edited details",
};

/** Timestamp (ms) for N days ago. */
export function msAgo(days: number) {
  return Date.now() - days * 86400000;
}
