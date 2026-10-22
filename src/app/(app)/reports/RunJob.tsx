"use client";

import { useActionState } from "react";
import { runJobNow } from "@/app/report-actions";

export function RunJobButton({ job, label, variant = "btn-outline" }: { job: "daily" | "weekly" | "reminders"; label: string; variant?: string }) {
  const [state, action, pending] = useActionState(runJobNow, { ok: false });
  return (
    <form action={action} className="flex flex-col items-start gap-1.5 sm:items-end">
      <input type="hidden" name="job" value={job} />
      <button className={`btn ${variant}`} disabled={pending}>{pending ? "Working…" : label}</button>
      {state.error && <p className="text-xs text-red-700">{state.error}</p>}
      {state.ok && state.message && <p className="text-xs text-emerald-700">{state.message}</p>}
    </form>
  );
}
