import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock, Hourglass, ListTodo, Octagon } from "lucide-react";
import { getMember, isManager } from "@/lib/auth";
import { getLookups, getRecentActivity, getSettings, getTasks } from "@/lib/data";
import { ACTIVITY_LABEL, PRIORITY_RANK, formatDateTime, isAckLate, isOpen, isOverdue, msAgo, todayIST } from "@/lib/tasks";
import { Avatar, Empty, PageHeader, TaskLine } from "@/components/ui";
import type { Task } from "@/lib/types";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const [me, tasks, settings, lookups, activity] = await Promise.all([
    getMember(),
    getTasks(),
    getSettings(),
    getLookups(),
    getRecentActivity(12),
  ]);
  const manager = isManager(me.role);
  const today = todayIST();
  const weekAgo = msAgo(7);

  const open = tasks.filter(isOpen);
  const overdue = open.filter((t) => isOverdue(t, settings));
  const blocked = tasks.filter((t) => t.status === "blocked");
  const ackLate = tasks.filter((t) => isAckLate(t, settings));
  const awaiting = tasks.filter((t) => t.status === "completed");
  const closedWeek = tasks.filter((t) => t.status === "closed" && t.closed_at && new Date(t.closed_at).getTime() > weekAgo);

  const metrics = [
    { label: "Open", value: open.length, icon: ListTodo, tone: "text-brand", href: "/tasks?status=open" },
    { label: "Overdue", value: overdue.length, icon: AlertTriangle, tone: "text-red-600", href: "/tasks?flag=overdue" },
    { label: "Blocked", value: blocked.length, icon: Octagon, tone: "text-red-600", href: "/tasks?status=blocked" },
    { label: "Not acknowledged", value: ackLate.length, icon: Clock, tone: "text-orange-600", href: "/tasks?flag=unacknowledged" },
    { label: "Awaiting closure", value: awaiting.length, icon: Hourglass, tone: "text-amber-dark", href: "/tasks?status=completed" },
    { label: "Closed this week", value: closedWeek.length, icon: CheckCircle2, tone: "text-emerald-600", href: "/tasks?status=closed" },
  ];

  // Attention queue: the things someone should act on today, most urgent first.
  const reason = (t: Task) =>
    isOverdue(t, settings) ? 0 : t.status === "blocked" ? 1 : isAckLate(t, settings) ? 2 : t.status === "completed" ? 3 : t.due_date <= today ? 4 : 9;
  const attention = tasks
    .filter((t) => reason(t) < 9)
    .sort((a, b) => reason(a) - reason(b) || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.due_date.localeCompare(b.due_date))
    .slice(0, 10);

  // Workload by member
  const workload = lookups.team
    .filter((m) => m.active)
    .map((m) => {
      const mine = tasks.filter((t) => t.assignee_id === m.id);
      return {
        member: m,
        open: mine.filter(isOpen).length,
        overdue: mine.filter((t) => isOverdue(t, settings)).length,
        blocked: mine.filter((t) => t.status === "blocked").length,
        awaiting: mine.filter((t) => t.status === "completed").length,
      };
    })
    .filter((w) => manager || w.member.id === me.id)
    .sort((a, b) => b.open - a.open);
  const maxOpen = Math.max(1, ...workload.map((w) => w.open));

  const firstName = me.full_name.split(" ")[0];

  return (
    <>
      <PageHeader
        eyebrow={manager ? "VP oversight" : "Overview"}
        title={`Good to see you, ${firstName}`}
        sub={manager ? "What needs attention across the team today." : "What needs your attention today."}
        action={manager ? <Link href="/tasks/new" className="btn btn-primary">New task</Link> : undefined}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {metrics.map(({ label, value, icon: Icon, tone, href }) => (
          <Link key={label} href={href} className="card p-4 transition-shadow hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted">{label}</span>
              <Icon size={16} className={tone} />
            </div>
            <div className={`tabular mt-2 text-3xl font-bold ${value > 0 && tone.includes("red") ? "text-red-600" : "text-navy"}`}>{value}</div>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <div className="border-b border-line px-4 py-3">
            <h2 className="text-base font-bold text-navy">Today&apos;s attention</h2>
            <p className="text-xs text-muted">Overdue, blocked, unacknowledged, awaiting closure and due today.</p>
          </div>
          <div className="divide-y divide-line">
            {attention.length === 0 ? (
              <Empty>Nothing needs attention right now.</Empty>
            ) : (
              attention.map((t) => (
                <TaskLine key={t.id} task={t} settings={settings} {...lookups} />
              ))
            )}
          </div>
        </section>

        <section className="card">
          <div className="border-b border-line px-4 py-3">
            <h2 className="text-base font-bold text-navy">Activity pulse</h2>
            <p className="text-xs text-muted">Latest updates across tasks.</p>
          </div>
          <ol className="px-4 py-3">
            {activity.length === 0 && <Empty>No activity yet.</Empty>}
            {activity.map((a) => (
              <li key={a.id} className="relative border-l border-line pb-4 pl-5 last:pb-0">
                <span className="absolute -left-[5px] top-1 h-2.5 w-2.5 rounded-full bg-amber" />
                <div className="text-xs text-faint">{formatDateTime(a.created_at)}</div>
                <div className="text-sm text-ink">
                  <span className="font-semibold">{(a.actor_id && lookups.memberName[a.actor_id]) || "Someone"}</span>{" "}
                  {(ACTIVITY_LABEL[a.event] ?? a.event).toLowerCase()}
                </div>
                <Link href={`/tasks/${a.task_id}`} className="block truncate text-xs text-brand hover:underline">
                  PX-{a.task_ref} · {a.task_title}
                </Link>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section className="card mt-6">
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-base font-bold text-navy">Workload by team member</h2>
        </div>
        <div className="divide-y divide-line">
          {workload.length === 0 && <Empty>Add team members in Settings.</Empty>}
          {workload.map((w) => (
            <Link key={w.member.id} href={`/tasks?assignee=${w.member.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-ice">
              <Avatar name={w.member.full_name} />
              <div className="w-40 truncate text-sm font-medium text-ink">{w.member.full_name}</div>
              <div className="hidden flex-1 sm:block">
                <div className="h-2 rounded-full bg-ice-dim">
                  <div className="h-2 rounded-full bg-brand" style={{ width: `${(w.open / maxOpen) * 100}%` }} />
                </div>
              </div>
              <div className="tabular flex gap-4 text-xs text-muted">
                <span><b className="text-ink">{w.open}</b> open</span>
                <span className={w.overdue ? "font-semibold text-red-600" : ""}>{w.overdue} overdue</span>
                <span className={w.blocked ? "font-semibold text-red-600" : ""}>{w.blocked} blocked</span>
                <span className="hidden md:inline">{w.awaiting} awaiting closure</span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
