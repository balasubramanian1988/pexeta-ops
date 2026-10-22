import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { toggleActive } from "@/app/actions";
import { getMember, isManager } from "@/lib/auth";
import { getLookups, getSettings } from "@/lib/data";
import { STATUS_LABEL } from "@/lib/tasks";
import { Avatar, PageHeader } from "@/components/ui";
import { ListAddForm, MemberForm, RulesForm } from "./Forms";
import type { Status } from "@/lib/types";

export const metadata: Metadata = { title: "Settings" };

const STATUS_MEANING: Record<Status, string> = {
  assigned: "Created and given to an owner. Waiting for acknowledgement.",
  acknowledged: "The owner has seen it and accepted it.",
  in_progress: "Work has started. Progress updates go here.",
  blocked: "Can't move forward. A reason is always required.",
  completed: "The owner says it's done. Waiting for VP verification.",
  closed: "Verified and closed by the VP. Final state.",
  reopened: "Sent back with feedback. Needs acknowledgement again.",
};

function Toggle({ table, id, active, disabled }: { table: string; id: string; active: boolean; disabled?: boolean }) {
  return (
    <form action={toggleActive}>
      <input type="hidden" name="table" value={table} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="active" value={String(!active)} />
      <button disabled={disabled} className={`text-xs font-semibold ${active ? "text-muted hover:text-red-600" : "text-brand hover:underline"} disabled:opacity-40`}>
        {active ? "Deactivate" : "Reactivate"}
      </button>
    </form>
  );
}

export default async function SettingsPage() {
  const me = await getMember();
  if (!isManager(me.role)) redirect("/dashboard");
  const [settings, lookups] = await Promise.all([getSettings(), getLookups()]);
  const ROLE = { vp: "VP", admin: "Admin", member: "Member" } as const;

  return (
    <>
      <PageHeader eyebrow="Operating rules" title="Settings" sub="The rules the tracker enforces, and the lists it uses." />

      <div className="space-y-6">
        <section className="card p-5">
          <h2 className="text-base font-bold text-navy">Operating rules</h2>
          <p className="mb-4 mt-1 text-xs text-muted">These drive the Overdue and Not acknowledged flags on the dashboard.</p>
          <RulesForm settings={settings} />
        </section>

        <section className="card p-5">
          <h2 className="text-base font-bold text-navy">Team</h2>
          <p className="mb-4 mt-1 text-xs text-muted">Only people listed here can sign in. Use the Google account they sign in with.</p>
          <MemberForm />
          <div className="mt-5 divide-y divide-line border-t border-line">
            {lookups.team.map((m) => (
              <div key={m.id} className="flex items-center gap-3 py-3">
                <Avatar name={m.full_name} />
                <div className="min-w-0 flex-1">
                  <div className={`text-sm font-medium ${m.active ? "text-ink" : "text-faint line-through"}`}>{m.full_name}</div>
                  <div className="truncate text-xs text-muted">{m.email}</div>
                </div>
                <span className="rounded-full bg-ice-dim px-2.5 py-0.5 text-xs font-semibold text-muted">{ROLE[m.role]}</span>
                <Toggle table="team_members" id={m.id} active={m.active} disabled={m.id === me.id} />
              </div>
            ))}
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="card p-5">
            <h2 className="mb-4 text-base font-bold text-navy">Client accounts</h2>
            <ListAddForm table="clients" placeholder="Client or brand name" />
            <div className="mt-4 divide-y divide-line border-t border-line">
              {lookups.clients.length === 0 && <p className="py-3 text-sm text-muted">No clients yet.</p>}
              {lookups.clients.map((c) => (
                <div key={c.id} className="flex items-center justify-between py-2.5">
                  <span className={`text-sm ${c.active ? "text-ink" : "text-faint line-through"}`}>{c.name}</span>
                  <Toggle table="clients" id={c.id} active={c.active} />
                </div>
              ))}
            </div>
          </section>

          <section className="card p-5">
            <h2 className="mb-4 text-base font-bold text-navy">Marketplaces</h2>
            <ListAddForm table="marketplaces" placeholder="Marketplace name" />
            <div className="mt-4 divide-y divide-line border-t border-line">
              {lookups.marketplaces.map((m) => (
                <div key={m.id} className="flex items-center justify-between py-2.5">
                  <span className={`text-sm ${m.active ? "text-ink" : "text-faint line-through"}`}>{m.name}</span>
                  <Toggle table="marketplaces" id={m.id} active={m.active} />
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="card p-5">
          <h2 className="text-base font-bold text-navy">Status definitions</h2>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
              <div key={s} className="rounded-lg bg-ice px-4 py-3">
                <dt className="text-sm font-semibold text-navy">{STATUS_LABEL[s]}</dt>
                <dd className="mt-1 text-xs text-muted">{STATUS_MEANING[s]}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-muted">
            Flow: Assigned → Acknowledged → In progress → (Blocked) → Awaiting VP closure → Closed. The VP can reopen completed or closed work with feedback.
          </p>
        </section>
      </div>
    </>
  );
}
