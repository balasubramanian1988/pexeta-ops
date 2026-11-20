"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createRecurring } from "@/app/recurring-actions";
import type { ActionResult } from "@/app/actions";
import type { Client, Marketplace, Member } from "@/lib/types";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function RecurringForm({ team, clients, marketplaces }: { team: Member[]; clients: Client[]; marketplaces: Marketplace[] }) {
  const [state, action, pending] = useActionState<ActionResult & { message?: string }, FormData>(createRecurring, { ok: false });
  const [freq, setFreq] = useState<"daily" | "weekly" | "monthly">("weekly");
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={action} className="card grid gap-4 p-5 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="label" htmlFor="r-title">Title</label>
        <input id="r-title" name="title" required className="field" placeholder="Weekly ads review and bid changes" />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="r-desc">Description / checklist</label>
        <textarea id="r-desc" name="description" rows={3} className="field" placeholder="What done looks like each time" />
      </div>
      <div>
        <label className="label" htmlFor="r-owner">Owner</label>
        <select id="r-owner" name="assignee_id" required defaultValue="" className="field">
          <option value="" disabled>Choose a team member</option>
          {team.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="r-pri">Priority</label>
        <select id="r-pri" name="priority" defaultValue="medium" className="field">
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>
      <div>
        <label className="label" htmlFor="r-freq">Repeats</label>
        <select id="r-freq" name="frequency" value={freq} onChange={(e) => setFreq(e.target.value as typeof freq)} className="field">
          <option value="daily">Every day (Mon–Sat)</option>
          <option value="weekly">Every week</option>
          <option value="monthly">Every month</option>
        </select>
      </div>
      <div>
        {freq === "weekly" && (
          <>
            <label className="label" htmlFor="r-wd">On</label>
            <select id="r-wd" name="weekday" defaultValue="1" className="field">
              {WEEKDAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
            </select>
          </>
        )}
        {freq === "monthly" && (
          <>
            <label className="label" htmlFor="r-md">On day</label>
            <select id="r-md" name="month_day" defaultValue="1" className="field">
              {Array.from({ length: 28 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
            </select>
          </>
        )}
      </div>
      <div>
        <label className="label" htmlFor="r-due">Due</label>
        <select id="r-due" name="due_in_days" defaultValue="0" className="field">
          <option value="0">Same day</option>
          <option value="1">Next day</option>
          <option value="2">In 2 days</option>
          <option value="3">In 3 days</option>
          <option value="5">In 5 days</option>
          <option value="7">In a week</option>
        </select>
      </div>
      <div>
        <label className="label" htmlFor="r-client">Client account</label>
        <select id="r-client" name="client_id" defaultValue="" className="field">
          <option value="">Internal / no client</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="r-mkt">Marketplace</label>
        <select id="r-mkt" name="marketplace_id" defaultValue="" className="field">
          <option value="">Not marketplace-specific</option>
          {marketplaces.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>
      <div className="space-y-2 sm:col-span-2">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="client_visible" /> Show these tasks to the client</label>
        <input name="client_title" className="field" placeholder="Client-facing title (blank = task title)" />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="create_today" defaultChecked /> If it falls on today, create today&apos;s task now</label>
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Save recurring task"}</button>
        {state.error && <p className="text-sm text-red-700">{state.error}</p>}
        {state.ok && state.message && <p className="text-sm text-emerald-700">{state.message}</p>}
      </div>
    </form>
  );
}
