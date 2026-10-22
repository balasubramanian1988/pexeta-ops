"use client";

import { useActionState, useEffect, useRef } from "react";
import { taskAction, type ActionResult, type TaskAction } from "@/app/actions";

export default function ActionForm({
  taskId,
  action,
  label,
  variant = "outline",
  children,
  className = "",
}: {
  taskId: string;
  action: TaskAction;
  label: string;
  variant?: "primary" | "dark" | "outline" | "danger";
  children?: React.ReactNode;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(taskAction, { ok: false });
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  const btn =
    variant === "primary" ? "btn-primary" : variant === "dark" ? "btn-dark" : variant === "danger" ? "bg-red-600 text-white hover:bg-red-700" : "btn-outline";
  return (
    <form ref={ref} action={formAction} className={`space-y-2 ${className}`}>
      <input type="hidden" name="task_id" value={taskId} />
      <input type="hidden" name="action" value={action} />
      {children}
      <button className={`btn ${btn} w-full`} disabled={pending}>
        {pending ? "Saving…" : label}
      </button>
      {state.error && <p className="text-xs text-red-700">{state.error}</p>}
    </form>
  );
}
