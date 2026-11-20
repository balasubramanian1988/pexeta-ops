import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { canAssign, getMember, isManager } from "@/lib/auth";
import { getLookups } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { deleteRecurring, toggleRecurring } from "@/app/recurring-actions";
import { nextRun, scheduleLabel, type RecurringRule } from "@/lib/recurring";
import { formatDate, PRIORITY_LABEL, todayIST } from "@/lib/tasks";
import { Avatar, Empty, PageHeader } from "@/components/ui";
import RecurringForm from "./RecurringForm";

export const metadata: Metadata = { title: "Recurring tasks" };

export default async function RecurringPage() {
  const me = await getMember();
  if (!canAssign(me.role)) redirect("/my-work");
  const supabase = await createClient();
  const [lookups, { data }] = await Promise.all([getLookups(), supabase.from("recurring_tasks").select("*").order("created_at", { ascending: false })]);
  const rules = (data ?? []) as RecurringRule[];
  const today = todayIST();

  return (
    <>
      <PageHeader
        eyebrow="Assign work"
        title="Recurring tasks"
        sub="Routine work that repeats: a fresh task is created and assigned automatically at 8:30 am on each scheduled day."
      />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <RecurringForm
            team={lookups.team.filter((m) => m.active)}
            clients={lookups.clients.filter((c) => c.active)}
            marketplaces={lookups.marketplaces.filter((m) => m.active)}
          />
        </div>
        <section className="card lg:col-span-3">
          <div className="border-b border-line px-4 py-3">
            <h2 className="text-sm font-bold text-navy">Schedules <span className="tabular ml-1 text-muted">{rules.length}</span></h2>
          </div>
          <div className="divide-y divide-line">
            {rules.map((r) => {
              const canEdit = isManager(me.role) || r.created_by === me.id;
              const ctx = [r.client_id && lookups.clientName[r.client_id], r.marketplace_id && lookups.marketName[r.marketplace_id]].filter(Boolean).join(" · ");
              return (
                <div key={r.id} className={`flex items-start gap-3 px-4 py-3 ${r.active ? "" : "opacity-60"}`}>
                  <Avatar name={lookups.memberName[r.assignee_id] ?? "?"} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-ink">{r.title}</div>
                    <div className="text-xs text-muted">
                      {scheduleLabel(r)} · {PRIORITY_LABEL[r.priority]} · {lookups.memberName[r.assignee_id] ?? "—"}
                      {ctx && <> · {ctx}</>}
                    </div>
                    <div className="text-xs text-faint">
                      {r.active ? <>Next: {formatDate(nextRun(r, r.last_created_on === today ? addOne(today) : today))}</> : "Paused"}
                      {r.last_created_on && <> · Last created {formatDate(r.last_created_on)}</>}
                    </div>
                  </div>
                  {canEdit && (
                    <div className="flex flex-col items-end gap-1">
                      <form action={toggleRecurring}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="active" value={String(!r.active)} />
                        <button className="text-xs font-semibold text-brand hover:underline">{r.active ? "Pause" : "Resume"}</button>
                      </form>
                      <form action={deleteRecurring}>
                        <input type="hidden" name="id" value={r.id} />
                        <button className="text-xs text-red-700 hover:underline">Delete</button>
                      </form>
                    </div>
                  )}
                </div>
              );
            })}
            {rules.length === 0 && <Empty>No recurring tasks yet. Add routine work like weekly ad reviews or monthly reconciliations.</Empty>}
          </div>
        </section>
      </div>
    </>
  );
}

function addOne(date: string) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
