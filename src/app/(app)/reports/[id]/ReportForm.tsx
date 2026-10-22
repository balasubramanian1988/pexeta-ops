"use client";

import { useActionState } from "react";
import { saveWeeklyReport } from "@/app/report-actions";
import type { Client, WeeklyReport } from "@/lib/types";

type Item = { id: string; ref: string; title: string; section: "done" | "progress" | "blocked" | "next"; owner: string; note: string };

const SECTIONS: { key: Item["section"]; title: string; hint?: string }[] = [
  { key: "done", title: "Completed this week" },
  { key: "progress", title: "In progress" },
  { key: "blocked", title: "Waiting on inputs", hint: "The blocked reason is shown to the seller. Untick anything internal." },
  { key: "next", title: "Planned for next week" },
];

export function ReportForm({ report, client, items }: { report: WeeklyReport; client: Client; items: Item[] }) {
  const [state, action, pending] = useActionState(saveWeeklyReport, { ok: false });
  const excluded = new Set(report.excluded_task_ids);
  return (
    <form action={action} className="card space-y-5 p-5">
      <input type="hidden" name="report_id" value={report.id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="recipients">Send to (seller emails)</label>
          <input id="recipients" name="recipients" defaultValue={(client.contact_emails ?? []).join(", ")} placeholder="owner@brand.com, ops@brand.com" className="field" />
          <p className="mt-1 text-xs text-muted">Separate with commas. Saved to the account for future weeks. You and the VP are copied, and replies come to you.</p>
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="contact_name">Greeting name (optional)</label>
          <input id="contact_name" name="contact_name" defaultValue={client.contact_name ?? ""} placeholder={`e.g. Mr. Kumar · leave blank for "${client.name} team"`} className="field" />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="summary">Note to the seller (shown at the top)</label>
        <textarea id="summary" name="summary" rows={4} defaultValue={report.summary} placeholder="Highlights, results, anything you need from them this week." className="field" />
      </div>

      <div>
        <div className="label">Tasks in this report</div>
        {items.length === 0 && <p className="text-sm text-muted">No tasks for this account this week.</p>}
        {SECTIONS.map(({ key, title, hint }) => {
          const list = items.filter((i) => i.section === key);
          if (!list.length) return null;
          return (
            <fieldset key={key} className="mt-3">
              <legend className="text-xs font-bold uppercase tracking-wide text-navy">{title}</legend>
              {hint && <p className="text-xs text-amber-dark">{hint}</p>}
              <div className="mt-1 divide-y divide-line rounded-lg border border-line">
                {list.map((i) => (
                  <label key={i.id} className="flex cursor-pointer items-start gap-3 px-3 py-2 hover:bg-ice">
                    <input type="hidden" name="all_ids" value={i.id} />
                    <input type="checkbox" name="include" value={i.id} defaultChecked={!excluded.has(i.id)} className="mt-1" />
                    <span className="min-w-0">
                      <span className="block text-sm text-ink">{i.title}</span>
                      <span className="block text-xs text-muted">{i.ref} · {i.owner}{i.note ? ` · ${i.note}` : ""}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <button name="intent" value="save" className="btn btn-outline" disabled={pending}>Save and refresh preview</button>
        <button name="intent" value="send" className="btn btn-primary" disabled={pending}>
          {pending ? "Working…" : report.status === "sent" ? "Send again to seller" : "Send to seller"}
        </button>
        {state.error && <p className="text-xs text-red-700">{state.error}</p>}
        {state.ok && <p className="text-xs text-emerald-700">{"sent" in state && state.sent ? "Sent to the seller." : "Saved."}</p>}
      </div>
    </form>
  );
}
