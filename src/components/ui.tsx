// Small presentational pieces shared across pages.
import Link from "next/link";
import { PRIORITY_LABEL, PRIORITY_STYLE, STATUS_LABEL, STATUS_STYLE, dueLabel, initials, isOverdue, isPastDue, taskRef } from "@/lib/tasks";
import type { Priority, Settings, Status, Task } from "@/lib/types";

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${STATUS_STYLE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function PriorityTag({ priority }: { priority: Priority }) {
  return <span className={`text-xs ${PRIORITY_STYLE[priority]}`}>{PRIORITY_LABEL[priority]}</span>;
}

export function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  return (
    <span
      title={name}
      className="inline-flex flex-shrink-0 items-center justify-center rounded-full bg-navy-2 font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials(name || "?")}
    </span>
  );
}

export function DueText({ task, settings }: { task: Task; settings: Settings }) {
  const overdue = isOverdue(task, settings);
  const late = isPastDue(task);
  return (
    <span className={`tabular whitespace-nowrap text-xs ${overdue ? "font-semibold text-red-600" : late ? "text-orange-600" : "text-muted"}`}>
      {dueLabel(task)}
    </span>
  );
}

export function PageHeader({ eyebrow, title, sub, action }: { eyebrow: string; title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1 className="mt-1 text-2xl font-bold text-navy">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function TaskLine({
  task,
  settings,
  memberName,
  clientName,
  marketName,
  showAssignee = true,
}: {
  task: Task;
  settings: Settings;
  memberName: Record<string, string>;
  clientName: Record<string, string>;
  marketName: Record<string, string>;
  showAssignee?: boolean;
}) {
  const ctx = [task.client_id && clientName[task.client_id], task.marketplace_id && marketName[task.marketplace_id]].filter(Boolean).join(" · ");
  return (
    <Link href={`/tasks/${task.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-ice">
      {showAssignee && <Avatar name={memberName[task.assignee_id] ?? "?"} />}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="tabular text-xs text-faint">{taskRef(task)}</span>
          <span className="truncate text-sm font-medium text-ink">{task.title}</span>
        </div>
        <div className="mt-0.5 truncate text-xs text-muted">
          {ctx || "No client"} {showAssignee && <>· {memberName[task.assignee_id] ?? "Unassigned"}</>}
          {task.status === "blocked" && task.blocked_reason && <span className="text-red-700"> · {task.blocked_reason}</span>}
        </div>
      </div>
      <div className="hidden flex-col items-end gap-1 sm:flex">
        <StatusBadge status={task.status} />
        <DueText task={task} settings={settings} />
      </div>
    </Link>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-8 text-center text-sm text-muted">{children}</div>;
}
