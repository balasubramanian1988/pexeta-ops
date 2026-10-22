"use client";

import { useActionState } from "react";
import { createTask, type ActionResult } from "@/app/actions";
import type { Client, Marketplace, Member } from "@/lib/types";

export default function NewTaskForm({ team, clients, marketplaces, today }: { team: Member[]; clients: Client[]; marketplaces: Marketplace[]; today: string }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(createTask, { ok: false });
  return (
    <form action={action} className="card grid max-w-3xl gap-4 p-6 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="label" htmlFor="title">Title</label>
        <input id="title" name="title" required className="field" placeholder="Fix suppressed listings for the cotton bedsheet range" />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="description">Description</label>
        <textarea id="description" name="description" rows={4} className="field" placeholder="What done looks like, links, ASINs, notes" />
      </div>
      <div>
        <label className="label" htmlFor="assignee_id">Owner</label>
        <select id="assignee_id" name="assignee_id" required defaultValue="" className="field">
          <option value="" disabled>Choose a team member</option>
          {team.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="priority">Priority</label>
        <select id="priority" name="priority" defaultValue="medium" className="field">
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>
      <div>
        <label className="label" htmlFor="client_id">Client account</label>
        <select id="client_id" name="client_id" defaultValue="" className="field">
          <option value="">Internal / no client</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="marketplace_id">Marketplace</label>
        <select id="marketplace_id" name="marketplace_id" defaultValue="" className="field">
          <option value="">Not marketplace-specific</option>
          {marketplaces.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="due_date">Due date</label>
        <input id="due_date" name="due_date" type="date" required min={today} className="field" />
      </div>
      <div>
        <label className="label" htmlFor="dependency">Depends on (optional)</label>
        <input id="dependency" name="dependency" className="field" placeholder="Client to share new images" />
      </div>
      {state.error && <p className="text-sm text-red-700 sm:col-span-2">{state.error}</p>}
      <div className="sm:col-span-2">
        <button className="btn btn-primary" disabled={pending}>{pending ? "Assigning…" : "Create and assign"}</button>
      </div>
    </form>
  );
}
