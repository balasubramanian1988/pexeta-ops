import type { Metadata } from "next";
import { getMember } from "@/lib/auth";
import { getLookups, getSettings, getTasks } from "@/lib/data";
import { PRIORITY_RANK, daysUntil, isOverdue, needsAck, todayIST } from "@/lib/tasks";
import { Empty, PageHeader, TaskLine } from "@/components/ui";
import type { Task } from "@/lib/types";

export const metadata: Metadata = { title: "My work" };

export default async function MyWorkPage({ searchParams }: { searchParams: Promise<{ market?: string }> }) {
  const [me, all, settings, lookups, sp] = await Promise.all([getMember(), getTasks(), getSettings(), getLookups(), searchParams]);
  const today = todayIST();
  let mine = all.filter((t) => t.assignee_id === me.id && t.status !== "closed");
  if (sp.market) mine = mine.filter((t) => t.marketplace_id === sp.market);

  const byPriority = (a: Task, b: Task) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.due_date.localeCompare(b.due_date);
  const used = new Set<string>();
  const take = (pred: (t: Task) => boolean) => {
    const list = mine.filter((t) => !used.has(t.id) && pred(t)).sort(byPriority);
    list.forEach((t) => used.add(t.id));
    return list;
  };

  const groups = [
    { title: "Needs your acknowledgement", hint: "New or reopened tasks. Acknowledge so the VP knows you've seen them.", items: take(needsAck) },
    { title: "Overdue", hint: "Past the due date. Update progress or flag a blocker.", items: take((t) => isOverdue(t, settings)) },
    { title: "Blocked", hint: "Waiting on something. Keep the reason current.", items: take((t) => t.status === "blocked") },
    { title: "Due this week", hint: "", items: take((t) => t.status !== "completed" && daysUntil(t.due_date, today) <= 7) },
    { title: "Later", hint: "", items: take((t) => t.status !== "completed") },
    { title: "Submitted, awaiting VP closure", hint: "Nothing to do unless the VP reopens it.", items: take((t) => t.status === "completed") },
  ];

  const markets = lookups.marketplaces.filter((m) => all.some((t) => t.assignee_id === me.id && t.marketplace_id === m.id));

  return (
    <>
      <PageHeader eyebrow="My workspace" title="My work" sub={`${mine.length} active task${mine.length === 1 ? "" : "s"} assigned to you.`} />
      {markets.length > 1 && (
        <div className="mb-5 flex flex-wrap gap-2">
          <a href="/my-work" className={`rounded-full px-3 py-1 text-xs font-semibold ${!sp.market ? "bg-navy text-white" : "bg-white text-muted ring-1 ring-line"}`}>All marketplaces</a>
          {markets.map((m) => (
            <a key={m.id} href={`/my-work?market=${m.id}`} className={`rounded-full px-3 py-1 text-xs font-semibold ${sp.market === m.id ? "bg-navy text-white" : "bg-white text-muted ring-1 ring-line"}`}>
              {m.name}
            </a>
          ))}
        </div>
      )}
      <div className="space-y-5">
        {groups.map((g) =>
          g.items.length === 0 ? null : (
            <section key={g.title} className="card">
              <div className="border-b border-line px-4 py-3">
                <h2 className="text-sm font-bold text-navy">
                  {g.title} <span className="tabular ml-1 text-muted">{g.items.length}</span>
                </h2>
                {g.hint && <p className="text-xs text-muted">{g.hint}</p>}
              </div>
              <div className="divide-y divide-line">
                {g.items.map((t) => (
                  <TaskLine key={t.id} task={t} settings={settings} {...lookups} showAssignee={false} />
                ))}
              </div>
            </section>
          )
        )}
        {mine.length === 0 && (
          <div className="card">
            <Empty>You&apos;re all clear. No active tasks assigned to you.</Empty>
          </div>
        )}
      </div>
    </>
  );
}
