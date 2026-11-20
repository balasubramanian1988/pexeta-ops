import type { Metadata } from "next";
import { getMember } from "@/lib/auth";
import { getLookups, getSettings, getTasks } from "@/lib/data";
import { PRIORITY_RANK, daysUntil, isOverdue, needsAck, todayIST } from "@/lib/tasks";
import { Empty, PageHeader, TaskLine } from "@/components/ui";
import type { Task } from "@/lib/types";
import Link from "next/link";
import { dayLabel, getUpcoming, timeRange } from "@/lib/meetings";

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
    { title: "Submitted, awaiting closure", hint: "Nothing to do unless it is reopened.", items: take((t) => t.status === "completed") },
  ];

  const upcoming = await getUpcoming(me.email);
  const upcomingToday = upcoming.filter((e) => dayLabel(e.start) === "Today").length;
  const active = mine.filter((t) => t.status !== "completed");
  const overdueList = active.filter((t) => t.due_date < today);
  const dueTodayList = active.filter((t) => t.due_date === today);
  const ackList = active.filter(needsAck);
  const blockedList = active.filter((t) => t.status === "blocked");
  const focus = [...overdueList, ...dueTodayList].sort(byPriority);
  const todayLong = new Date(today + "T00:00:00Z").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

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
        <section className="card p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-bold text-navy">Today</h2>
            <span className="text-xs text-muted">{todayLong}</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {[
              { label: "Overdue", n: overdueList.length, tone: overdueList.length ? "text-red-600" : "text-navy" },
              { label: "Due today", n: dueTodayList.length, tone: "text-navy" },
              { label: "To acknowledge", n: ackList.length, tone: ackList.length ? "text-orange-600" : "text-navy" },
              { label: "Blocked", n: blockedList.length, tone: blockedList.length ? "text-red-600" : "text-navy" },
              { label: "Meetings", n: upcomingToday, tone: "text-navy" },
            ].map((c) => (
              <div key={c.label} className="rounded-lg bg-ice px-3 py-2">
                <div className={`tabular text-xl font-bold ${c.tone}`}>{c.n}</div>
                <div className="text-xs text-muted">{c.label}</div>
              </div>
            ))}
          </div>
          {focus.length > 0 ? (
            <div className="mt-3 divide-y divide-line rounded-lg border border-line">
              {focus.map((t) => (
                <TaskLine key={t.id} task={t} settings={settings} {...lookups} showAssignee={false} />
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">Nothing overdue or due today. Pick something from &quot;Due this week&quot; below.</p>
          )}
        </section>
        <section className="card">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-sm font-bold text-navy">Upcoming meetings <span className="tabular ml-1 text-muted">{upcoming.length}</span></h2>
            <Link href="/meetings" className="text-xs font-semibold text-brand hover:underline">Schedule</Link>
          </div>
          {upcoming.length === 0 ? (
            <Empty>No meetings today or tomorrow.</Empty>
          ) : (
            <div className="divide-y divide-line">
              {upcoming.map((e) => (
                <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-ink">{e.title}</div>
                    <div className="text-xs text-muted">{dayLabel(e.start)} · {timeRange(e.start, e.end)}</div>
                  </div>
                  {e.meetUrl && <a href={e.meetUrl} target="_blank" rel="noreferrer" className="btn btn-primary px-3 py-1.5 text-xs">Join Meet</a>}
                </div>
              ))}
            </div>
          )}
        </section>
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
