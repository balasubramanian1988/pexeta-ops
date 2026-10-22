// SLA reminders, run hourly 9 am–7 pm IST. Each reminder is sent once (notification_log),
// and each owner gets one email per run listing everything that needs attention.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAckLate, isPastDue, OPEN_STATUSES, taskRef } from "@/lib/tasks";
import type { Member, Task } from "@/lib/types";
import { claimKey, loadCtx } from "./context";
import { addDays, istDate, shortDate } from "./dates";
import { APP_URL, button, esc, layout, sendChat, sendEmail } from "./send";

type Kind = "ack" | "overdue" | "due0" | "due1";
const HEAD: Record<Kind, string> = {
  ack: "Not yet acknowledged",
  overdue: "Past due date",
  due0: "Due today",
  due1: "Due tomorrow",
};
const ORDER: Kind[] = ["overdue", "ack", "due0", "due1"];

export async function runSlaReminders() {
  const ctx = await loadCtx();
  if (ctx.settings.reminders_enabled === false) return { skipped: "reminders disabled" };
  const { data } = await createAdminClient().from("tasks").select("*").in("status", OPEN_STATUSES).limit(5000);
  const tasks = (data ?? []) as Task[];
  const today = istDate();
  const tomorrow = addDays(today, 1);

  const perOwner = new Map<string, { owner: Member; items: { kind: Kind; t: Task }[] }>();
  const newlyOverdue: Task[] = [];

  for (const t of tasks) {
    const owner = ctx.byId[t.assignee_id];
    if (!owner?.active) continue;
    const found: [Kind, string][] = [];
    if (isAckLate(t, ctx.settings)) found.push(["ack", `ack:${t.id}:${t.assigned_at}`]);
    if (isPastDue(t, today)) found.push(["overdue", `overdue:${t.id}:${t.due_date}`]);
    else if (t.due_date === today) found.push(["due0", `due0:${t.id}:${t.due_date}`]);
    else if (t.due_date === tomorrow) found.push(["due1", `due1:${t.id}:${t.due_date}`]);

    for (const [kind, key] of found) {
      if (!(await claimKey(key, t.id))) continue;
      const entry = perOwner.get(owner.id) ?? { owner, items: [] };
      entry.items.push({ kind, t });
      perOwner.set(owner.id, entry);
      if (kind === "overdue") newlyOverdue.push(t);
    }
  }

  let emails = 0;
  for (const { owner, items } of perOwner.values()) {
    const escalate = items.some((i) => i.kind === "ack" || i.kind === "overdue");
    const sections = ORDER.filter((k) => items.some((i) => i.kind === k))
      .map((k) => {
        const rows = items
          .filter((i) => i.kind === k)
          .map(({ t }) => {
            const client = t.client_id ? ` · ${esc(ctx.clientName[t.client_id] ?? "")}` : "";
            return `<li style="margin:4px 0"><a href="${APP_URL}/tasks/${t.id}" style="color:#1d6fb8;font-weight:600">${esc(taskRef(t))} · ${esc(t.title)}</a><span style="color:#4b5a6b">${client} · due ${esc(shortDate(t.due_date))}</span></li>`;
          })
          .join("");
        const color = k === "overdue" || k === "ack" ? "#991b1b" : "#0b2a4a";
        return `<h3 style="margin:18px 0 6px;font-size:14px;color:${color}">${HEAD[k]}</h3><ul style="margin:0;padding-left:18px">${rows}</ul>`;
      })
      .join("");
    const count = items.length;
    const ok = await sendEmail({
      to: [owner.email],
      cc: escalate ? ctx.vps.filter((v) => v.id !== owner.id).map((v) => v.email) : [],
      subject: `Reminder: ${count} task${count > 1 ? "s" : ""} need${count > 1 ? "" : "s"} your attention`,
      html: layout({
        title: `${count} task${count > 1 ? "s" : ""} need${count > 1 ? "" : "s"} attention`,
        preheader: items.map((i) => HEAD[i.kind]).join(", "),
        body: `<p style="margin:0">Hi ${esc(owner.full_name.split(" ")[0])}, here's what needs your attention in Pexeta Ops.${
          escalate ? " The VP is copied on overdue and unacknowledged items." : ""
        }</p>${sections}<p style="margin:20px 0 0">${button(`${APP_URL}/my-work`, "Open My work")}</p>`,
      }),
    });
    if (ok) emails++;
  }

  if (newlyOverdue.length) {
    const lines = newlyOverdue
      .slice(0, 15)
      .map((t) => `• <${APP_URL}/tasks/${t.id}|${taskRef(t)} · ${t.title}> · ${ctx.byId[t.assignee_id]?.full_name ?? ""} · was due ${shortDate(t.due_date)}`)
      .join("\n");
    await sendChat(`⏰ *${newlyOverdue.length} task${newlyOverdue.length > 1 ? "s" : ""} went past due*\n${lines}`);
  }

  return { owners: perOwner.size, emails, overdue: newlyOverdue.length };
}
