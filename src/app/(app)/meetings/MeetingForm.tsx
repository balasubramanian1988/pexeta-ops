"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { scheduleMeeting } from "@/app/meeting-actions";
import type { ActionResult } from "@/app/actions";
import type { Client, Member } from "@/lib/types";

type TaskOption = { id: string; label: string };

export default function MeetingForm({
  team,
  clients,
  tasks,
  today,
  meId,
  defaults,
}: {
  team: Member[];
  clients: Client[];
  tasks: TaskOption[];
  today: string;
  meId: string;
  defaults: { taskId?: string; clientId?: string; title?: string; attendeeIds?: string[] };
}) {
  const [state, action, pending] = useActionState<ActionResult & { meetUrl?: string }, FormData>(scheduleMeeting, { ok: false });
  const [kind, setKind] = useState<"meeting" | "reminder">("meeting");
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={action} className="card grid gap-4 p-5 sm:grid-cols-2">
      <div className="flex gap-2 sm:col-span-2">
        {(["meeting", "reminder"] as const).map((k) => (
          <label key={k} className={`cursor-pointer rounded-full px-3 py-1 text-xs font-semibold ${kind === k ? "bg-navy text-white" : "bg-white text-muted ring-1 ring-line"}`}>
            <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
            {k === "meeting" ? "Meeting" : "Reminder for me"}
          </label>
        ))}
      </div>

      <div className="sm:col-span-2">
        <label className="label" htmlFor="m-title">Title</label>
        <input id="m-title" name="title" required defaultValue={defaults.title ?? ""} className="field" placeholder={kind === "meeting" ? "Weekly ads review with Noscomp" : "Follow up on reimbursement claim"} />
      </div>
      <div>
        <label className="label" htmlFor="m-date">Date</label>
        <input id="m-date" name="date" type="date" required min={today} defaultValue={today} className="field" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="m-time">Time (IST)</label>
          <input id="m-time" name="time" type="time" required className="field" />
        </div>
        {kind === "meeting" && (
          <div>
            <label className="label" htmlFor="m-dur">Duration</label>
            <select id="m-dur" name="duration" defaultValue="30" className="field">
              {[15, 30, 45, 60, 90, 120].map((d) => <option key={d} value={d}>{d < 60 ? `${d} min` : `${d / 60} h`}</option>)}
            </select>
          </div>
        )}
      </div>

      {kind === "meeting" && (
        <>
          <fieldset className="sm:col-span-2">
            <legend className="label">Invite team members</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {team.filter((m) => m.id !== meId).map((m) => (
                <label key={m.id} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" name="attendee_ids" value={m.id} defaultChecked={defaults.attendeeIds?.includes(m.id)} /> {m.full_name}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="m-ext">Other guests (optional)</label>
            <input id="m-ext" name="external_emails" className="field" placeholder="Client or partner emails, comma separated" />
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="add_meet" defaultChecked /> Add a Google Meet link
          </label>
        </>
      )}

      <div>
        <label className="label" htmlFor="m-task">Related task (optional)</label>
        <select id="m-task" name="task_id" defaultValue={defaults.taskId ?? ""} className="field">
          <option value="">None</option>
          {tasks.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="m-client">Client (optional)</label>
        <select id="m-client" name="client_id" defaultValue={defaults.clientId ?? ""} className="field">
          <option value="">None</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="m-rem">Remind me</label>
        <select id="m-rem" name="reminder_minutes" defaultValue="10" className="field">
          <option value="0">No reminder</option>
          <option value="5">5 minutes before</option>
          <option value="10">10 minutes before</option>
          <option value="30">30 minutes before</option>
          <option value="60">1 hour before</option>
          <option value="1440">1 day before</option>
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="m-desc">Notes / agenda (optional)</label>
        <textarea id="m-desc" name="description" rows={2} className="field" />
      </div>

      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "Scheduling…" : kind === "meeting" ? "Schedule and send invites" : "Set reminder"}
        </button>
        {state.error && <p className="text-sm text-red-700">{state.error}</p>}
        {state.ok && (
          <p className="text-sm text-emerald-700">
            Done. It&apos;s in Google Calendar{state.meetUrl ? <>, Meet link: <a href={state.meetUrl} target="_blank" rel="noreferrer" className="underline">{state.meetUrl}</a></> : "."}
          </p>
        )}
      </div>
    </form>
  );
}
