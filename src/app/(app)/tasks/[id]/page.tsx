import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { canManageTask, getMember } from "@/lib/auth";
import { getActivity, getLookups, getSettings, getTask } from "@/lib/data";
import { activityText, formatDate, formatDateTime, isAckLate, isOverdue, needsAck, taskRef } from "@/lib/tasks";
import { Avatar, DueText, PriorityTag, StatusBadge } from "@/components/ui";
import ActionForm from "./ActionForm";

export const metadata: Metadata = { title: "Task" };

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [me, task, settings, lookups] = await Promise.all([getMember(), getTask(id), getSettings(), getLookups()]);
  if (!task) notFound();
  const activity = await getActivity(task.id);

  const manager = canManageTask(me, task);
  const isOwner = task.assignee_id === me.id;
  const canClose = settings.closure_roles.includes(me.role);
  const s = task.status;

  const details: [string, React.ReactNode][] = [
    ["Owner", <span key="o" className="flex items-center gap-2"><Avatar name={lookups.memberName[task.assignee_id] ?? "?"} size={22} />{lookups.memberName[task.assignee_id] ?? "—"}</span>],
    ["Client account", (task.client_id && lookups.clientName[task.client_id]) || "—"],
    ["Marketplace", (task.marketplace_id && lookups.marketName[task.marketplace_id]) || "—"],
    ["Priority", <PriorityTag key="p" priority={task.priority} />],
    ["Due", <span key="d">{formatDate(task.due_date)} · <DueText task={task} settings={settings} /></span>],
    ["Progress", `${task.progress}%`],
    ["Assigned by", lookups.memberName[task.created_by] ?? "—"],
    ["Created", formatDateTime(task.created_at)],
  ];

  return (
    <>
      <Link href="/tasks" className="text-sm font-medium text-brand hover:underline">← Task register</Link>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="tabular text-xs text-faint">{taskRef(task)}</div>
          <h1 className="mt-1 text-2xl font-bold text-navy">{task.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={s} />
            {isOverdue(task, settings) && <span className="rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-semibold text-white">Overdue</span>}
            {isAckLate(task, settings) && <span className="rounded-full bg-orange-500 px-2.5 py-0.5 text-xs font-semibold text-white">Not acknowledged in {settings.ack_window_hours}h</span>}
          </div>
        </div>
      </div>

      {s === "blocked" && task.blocked_reason && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <b>Blocked:</b> {task.blocked_reason}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="card p-5">
            <h2 className="eyebrow">Description</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink">{task.description || "No description."}</p>
            {task.dependency && (
              <p className="mt-4 text-sm text-muted"><b className="text-ink">Depends on:</b> {task.dependency}</p>
            )}
            <dl className="mt-5 grid gap-x-6 gap-y-3 border-t border-line pt-5 text-sm sm:grid-cols-2">
              {details.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 sm:block">
                  <dt className="text-xs text-muted">{k}</dt>
                  <dd className="mt-0.5 text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="card p-5">
            <h2 className="eyebrow">Activity timeline</h2>
            <ActionForm taskId={task.id} action="comment" label="Add comment" className="mt-4">
              <textarea name="note" rows={2} className="field" placeholder="Add an update or question" />
            </ActionForm>
            <ol className="mt-6">
              {activity.map((a) => (
                <li key={a.id} className="relative flex gap-3 border-l border-line pb-5 pl-5 last:pb-0">
                  <span className="absolute -left-[12px] top-0"><Avatar name={(a.actor_id && lookups.memberName[a.actor_id]) || "?"} size={24} /></span>
                  <div className="min-w-0 pl-2">
                    <div className="text-sm text-ink">
                      <b>{(a.actor_id && lookups.memberName[a.actor_id]) || "Someone"}</b>{" "}
                      <span className="text-muted">{activityText(a.event)}</span>
                    </div>
                    {a.detail && <p className="mt-1 whitespace-pre-wrap rounded-md bg-ice px-3 py-2 text-sm text-ink">{a.detail}</p>}
                    <div className="mt-1 text-xs text-faint">{formatDateTime(a.created_at)}</div>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="space-y-4">
          {isOwner && (
            <section className="card space-y-4 p-5">
              <h2 className="eyebrow">Your actions</h2>
              {needsAck(task) && <ActionForm taskId={task.id} action="acknowledge" label="Acknowledge" variant="dark" />}
              {["assigned", "acknowledged", "reopened"].includes(s) && <ActionForm taskId={task.id} action="start" label="Start work" variant="primary" />}
              {["acknowledged", "in_progress"].includes(s) && (
                <ActionForm taskId={task.id} action="progress" label="Update progress">
                  <label className="label" htmlFor="progress">Progress (%)</label>
                  <input id="progress" name="progress" type="number" min={0} max={100} step={5} defaultValue={task.progress} className="field" />
                  <input name="note" className="field" placeholder="What changed? (optional)" />
                </ActionForm>
              )}
              {["acknowledged", "in_progress", "assigned", "reopened"].includes(s) && (
                <ActionForm taskId={task.id} action="block" label="Mark blocked" variant="danger">
                  <input name="note" className="field" placeholder="Add the reason so the next move is clear" />
                </ActionForm>
              )}
              {s === "blocked" && (
                <ActionForm taskId={task.id} action="unblock" label="Unblock and resume" variant="dark">
                  <input name="note" className="field" placeholder="How was it resolved? (optional)" />
                </ActionForm>
              )}
              {["acknowledged", "in_progress"].includes(s) && (
                <ActionForm taskId={task.id} action="complete" label="Submit for VP closure" variant="primary">
                  <textarea name="note" rows={2} className="field" placeholder="What was done, with links or evidence" />
                </ActionForm>
              )}
              {s === "completed" && <p className="text-sm text-muted">Submitted. Waiting for the VP to verify and close.</p>}
              {s === "closed" && <p className="text-sm text-muted">This task is closed.</p>}
            </section>
          )}

          {canClose && (s === "completed" || s === "closed") && (
            <section className="card space-y-4 p-5">
              <h2 className="eyebrow">VP closure</h2>
              {s === "completed" && (
                <ActionForm taskId={task.id} action="close" label="Verify and close" variant="dark">
                  <input name="note" className="field" placeholder="Closing note (optional)" />
                </ActionForm>
              )}
              <ActionForm taskId={task.id} action="reopen" label="Reopen with feedback">
                <textarea name="note" rows={2} className="field" placeholder="What needs fixing?" />
              </ActionForm>
            </section>
          )}

          {manager && s !== "closed" && (
            <section className="card space-y-4 p-5">
              <h2 className="eyebrow">Manage</h2>
              <ActionForm taskId={task.id} action="reassign" label="Reassign">
                <select name="assignee_id" defaultValue="" className="field">
                  <option value="" disabled>Choose new owner</option>
                  {lookups.team.filter((m) => m.active && m.id !== task.assignee_id).map((m) => (
                    <option key={m.id} value={m.id}>{m.full_name}</option>
                  ))}
                </select>
                <input name="note" className="field" placeholder="Reason (optional)" />
              </ActionForm>
              <ActionForm taskId={task.id} action="due" label="Change due date">
                <input name="due_date" type="date" defaultValue={task.due_date} className="field" />
                <input name="note" className="field" placeholder="Reason (optional)" />
              </ActionForm>
              <details>
                <summary className="cursor-pointer text-sm font-semibold text-brand">Edit details</summary>
                <ActionForm taskId={task.id} action="edit" label="Save changes" className="mt-3">
                  <input name="title" defaultValue={task.title} className="field" />
                  <textarea name="description" rows={3} defaultValue={task.description} className="field" />
                  <select name="priority" defaultValue={task.priority} className="field">
                    <option value="urgent">Urgent</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                  <select name="client_id" defaultValue={task.client_id ?? ""} className="field">
                    <option value="">Internal / no client</option>
                    {lookups.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <select name="marketplace_id" defaultValue={task.marketplace_id ?? ""} className="field">
                    <option value="">Not marketplace-specific</option>
                    {lookups.marketplaces.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  <input name="dependency" defaultValue={task.dependency} className="field" placeholder="Depends on" />
                </ActionForm>
              </details>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
