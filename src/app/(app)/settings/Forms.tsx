"use client";

import { useActionState, useEffect, useRef } from "react";
import { addListItem, saveRules, upsertMember, type ActionResult } from "@/app/actions";
import type { Settings } from "@/lib/types";

function Msg({ state, okText }: { state: ActionResult; okText: string }) {
  if (state.error) return <p className="text-xs text-red-700">{state.error}</p>;
  if (state.ok) return <p className="text-xs text-emerald-700">{okText}</p>;
  return null;
}

export function RulesForm({ settings }: { settings: Settings }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(saveRules, { ok: false });
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-3">
      <div>
        <label className="label" htmlFor="overdue_grace_days">Overdue after due date (days)</label>
        <input id="overdue_grace_days" name="overdue_grace_days" type="number" min={0} max={30} defaultValue={settings.overdue_grace_days} className="field" />
      </div>
      <div>
        <label className="label" htmlFor="ack_window_hours">Acknowledge within (hours)</label>
        <input id="ack_window_hours" name="ack_window_hours" type="number" min={1} max={168} defaultValue={settings.ack_window_hours} className="field" />
      </div>
      <fieldset>
        <legend className="label">Who can close and reopen</legend>
        <label className="mr-4 inline-flex items-center gap-2 text-sm">
          <input type="checkbox" name="closure_roles" value="vp" defaultChecked={settings.closure_roles.includes("vp")} /> VP
        </label>
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" name="closure_roles" value="admin" defaultChecked={settings.closure_roles.includes("admin")} /> Admins
        </label>
      </fieldset>
      <div className="flex items-center gap-3 sm:col-span-3">
        <button className="btn btn-dark" disabled={pending}>{pending ? "Saving…" : "Save rules"}</button>
        <Msg state={state} okText="Rules saved." />
      </div>
    </form>
  );
}

export function MemberForm() {
  const [state, action, pending] = useActionState<ActionResult, FormData>(upsertMember, { ok: false });
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="grid gap-3 sm:grid-cols-4">
      <input name="full_name" placeholder="Full name" className="field" />
      <input name="email" type="email" placeholder="Google work email" className="field sm:col-span-2" />
      <select name="role" defaultValue="member" className="field">
        <option value="member">Team member</option>
        <option value="admin">Admin</option>
        <option value="vp">VP</option>
      </select>
      <div className="flex items-center gap-3 sm:col-span-4">
        <button className="btn btn-dark" disabled={pending}>{pending ? "Saving…" : "Add or update member"}</button>
        <Msg state={state} okText="Saved. They can now sign in with Google." />
      </div>
    </form>
  );
}

export function ListAddForm({ table, placeholder }: { table: "clients" | "marketplaces"; placeholder: string }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(addListItem, { ok: false });
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="flex flex-col gap-2 sm:flex-row sm:items-start">
      <input type="hidden" name="table" value={table} />
      <input name="name" placeholder={placeholder} className="field" />
      <button className="btn btn-dark sm:w-28" disabled={pending}>{pending ? "Adding…" : "Add"}</button>
      <div className="sm:hidden"><Msg state={state} okText="Added." /></div>
      <div className="hidden sm:block">{state.error && <p className="text-xs text-red-700">{state.error}</p>}</div>
    </form>
  );
}
