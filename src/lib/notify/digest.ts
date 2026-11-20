// Evening digest: one email per person with the day's routine task updates, grouped by task.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { taskRef } from "@/lib/tasks";
import type { Task } from "@/lib/types";
import { loadCtx } from "./context";
import { APP_URL, button, esc, layout, sendEmail } from "./send";

type Row = { id: string; recipient_id: string; task_id: string | null; actor_id: string | null; event: string; summary: string; note: string; created_at: string };

function time(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

export async function sendDigests(): Promise<{ people: number; updates: number; emails: number }> {
  const db = createAdminClient();
  const { data, error } = await db.from("notification_digest").select("*").is("sent_at", null).order("created_at").limit(5000);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Row[];
  if (rows.length === 0) return { people: 0, updates: 0, emails: 0 };

  const ctx = await loadCtx();
  const taskIds = [...new Set(rows.map((r) => r.task_id).filter(Boolean))] as string[];
  const { data: taskRows } = await db.from("tasks").select("id, ref, title, status").in("id", taskIds);
  const tasks = Object.fromEntries(((taskRows ?? []) as Pick<Task, "id" | "ref" | "title" | "status">[]).map((t) => [t.id, t]));

  const byPerson = new Map<string, Row[]>();
  for (const r of rows) byPerson.set(r.recipient_id, [...(byPerson.get(r.recipient_id) ?? []), r]);

  let emails = 0;
  for (const [personId, items] of byPerson) {
    const person = ctx.byId[personId];
    const ids = items.map((r) => r.id);
    if (!person?.active) {
      await db.from("notification_digest").update({ sent_at: new Date().toISOString() }).in("id", ids);
      continue;
    }
    const byTask = new Map<string, Row[]>();
    for (const r of items) byTask.set(r.task_id ?? "", [...(byTask.get(r.task_id ?? "") ?? []), r]);

    const sections = [...byTask.entries()]
      .map(([taskId, list]) => {
        const t = tasks[taskId];
        const heading = t
          ? `<a href="${APP_URL}/tasks/${t.id}" style="color:#0b2a4a;font-weight:700;text-decoration:none">${esc(taskRef(t))} · ${esc(t.title)}</a>`
          : "<b>Task</b>";
        const lines = list
          .map(
            (r) =>
              `<li style="margin:4px 0"><span style="color:#4b5a6b">${time(r.created_at)}</span> · ${esc(r.summary)}${
                r.note ? `<div style="margin:4px 0 0;padding:8px 10px;background:#eef2f7;border-radius:6px;white-space:pre-wrap">${esc(r.note)}</div>` : ""
              }</li>`
          )
          .join("");
        return `<div style="margin:0 0 16px;padding:0 0 12px;border-bottom:1px solid #dce3ec">${heading}<ul style="margin:6px 0 0;padding-left:18px">${lines}</ul></div>`;
      })
      .join("");

    const count = items.length;
    const sent = await sendEmail({
      to: [person.email],
      subject: `Your Pexeta Ops updates: ${count} update${count === 1 ? "" : "s"} on ${byTask.size} task${byTask.size === 1 ? "" : "s"}`,
      html: layout({
        title: "Today's task updates",
        preheader: `${count} update${count === 1 ? "" : "s"} from your team today`,
        body: `<p style="margin:0 0 16px">Hi ${esc(person.full_name.split(" ")[0] ?? "")}, here's what changed today on tasks you're involved in. Urgent items (new assignments, blocks, submissions, reopens and @mentions) were emailed to you as they happened.</p>${sections}<p style="margin:18px 0 0">${button(`${APP_URL}/my-work`, "Open My work")}</p>`,
      }),
    });
    if (sent) {
      emails++;
      await db.from("notification_digest").update({ sent_at: new Date().toISOString() }).in("id", ids);
    }
  }
  return { people: byPerson.size, updates: rows.length, emails };
}
