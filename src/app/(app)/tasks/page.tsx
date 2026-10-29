import type { Metadata } from "next";
import Link from "next/link";
import { canAssign, getMember } from "@/lib/auth";
import { getLookups, getSettings, getTasks } from "@/lib/data";
import { OPEN_STATUSES, PRIORITY_LABEL, STATUS_LABEL, isAckLate, isOverdue, taskRef } from "@/lib/tasks";
import { Avatar, DueText, Empty, PageHeader, PriorityTag, StatusBadge } from "@/components/ui";
import type { Priority, Status } from "@/lib/types";

export const metadata: Metadata = { title: "Task register" };

type SP = { q?: string; assignee?: string; market?: string; client?: string; status?: string; priority?: string; from?: string; to?: string; flag?: string };

export default async function TasksPage({ searchParams }: { searchParams: Promise<SP> }) {
  const [me, all, settings, lookups, sp] = await Promise.all([getMember(), getTasks(), getSettings(), getLookups(), searchParams]);
  const manager = canAssign(me.role);

  const q = (sp.q ?? "").toLowerCase();
  const tasks = all.filter((t) => {
    if (q && !`${taskRef(t)} ${t.title} ${t.description}`.toLowerCase().includes(q)) return false;
    if (sp.assignee && t.assignee_id !== sp.assignee) return false;
    if (sp.market && t.marketplace_id !== sp.market) return false;
    if (sp.client && t.client_id !== sp.client) return false;
    if (sp.status === "open" && !OPEN_STATUSES.includes(t.status)) return false;
    if (sp.status && sp.status !== "open" && t.status !== sp.status) return false;
    if (sp.priority && t.priority !== sp.priority) return false;
    if (sp.from && t.due_date < sp.from) return false;
    if (sp.to && t.due_date > sp.to) return false;
    if (sp.flag === "overdue" && !isOverdue(t, settings)) return false;
    if (sp.flag === "unacknowledged" && !isAckLate(t, settings)) return false;
    return true;
  });
  const filtered = Object.values(sp).some(Boolean);

  return (
    <>
      <PageHeader
        eyebrow="Register"
        title="Task register"
        sub={`${tasks.length} of ${all.length} tasks`}
        action={manager ? <Link href="/tasks/new" className="btn btn-primary">New task</Link> : undefined}
      />

      <form className="card mb-5 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4" method="get">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="q">Search</label>
          <input id="q" name="q" defaultValue={sp.q} placeholder="Title, description or PX number" className="field" />
        </div>
        {manager && (
          <div>
            <label className="label" htmlFor="assignee">Assignee</label>
            <select id="assignee" name="assignee" defaultValue={sp.assignee ?? ""} className="field">
              <option value="">Everyone</option>
              {lookups.team.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="label" htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={sp.status ?? ""} className="field">
            <option value="">Any status</option>
            <option value="open">All open</option>
            {(Object.keys(STATUS_LABEL) as Status[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="market">Marketplace</label>
          <select id="market" name="market" defaultValue={sp.market ?? ""} className="field">
            <option value="">All marketplaces</option>
            {lookups.marketplaces.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="client">Client account</label>
          <select id="client" name="client" defaultValue={sp.client ?? ""} className="field">
            <option value="">All clients</option>
            {lookups.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="priority">Priority</label>
          <select id="priority" name="priority" defaultValue={sp.priority ?? ""} className="field">
            <option value="">Any priority</option>
            {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="from">Due from</label>
          <input id="from" type="date" name="from" defaultValue={sp.from} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="to">Due to</label>
          <input id="to" type="date" name="to" defaultValue={sp.to} className="field" />
        </div>
        {sp.flag && <input type="hidden" name="flag" value={sp.flag} />}
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
          <button className="btn btn-dark">Apply filters</button>
          {filtered && <Link href="/tasks" className="btn btn-outline">Clear</Link>}
          {sp.flag && <span className="text-xs text-muted">Showing {sp.flag === "overdue" ? "overdue" : "unacknowledged"} tasks only.</span>}
        </div>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-line bg-ice text-xs text-muted">
            <tr>
              <th className="px-4 py-3 font-semibold">Task</th>
              <th className="px-4 py-3 font-semibold">Owner</th>
              <th className="px-4 py-3 font-semibold">Client · Marketplace</th>
              <th className="px-4 py-3 font-semibold">Priority</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Due</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {tasks.map((t) => (
              <tr key={t.id} className="hover:bg-ice">
                <td className="max-w-xs px-4 py-3">
                  <Link href={`/tasks/${t.id}`} className="block">
                    <span className="tabular text-xs text-faint">{taskRef(t)}</span>
                    <span className="block truncate font-medium text-ink hover:text-brand">{t.title}</span>
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Avatar name={lookups.memberName[t.assignee_id] ?? "?"} size={24} />
                    <span className="truncate">{lookups.memberName[t.assignee_id] ?? "—"}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-muted">
                  {(t.client_id && lookups.clientName[t.client_id]) || "—"} · {(t.marketplace_id && lookups.marketName[t.marketplace_id]) || "—"}
                </td>
                <td className="px-4 py-3"><PriorityTag priority={t.priority} /></td>
                <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                <td className="px-4 py-3"><DueText task={t} settings={settings} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {tasks.length === 0 && <Empty>No tasks match these filters.</Empty>}
      </div>
    </>
  );
}
