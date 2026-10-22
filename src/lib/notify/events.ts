// Who hears about what. Called after each task action (in the background, so actions stay fast).
// Rules: nobody is told about their own action; inactive members are skipped.
import "server-only";
import { formatDate, PRIORITY_LABEL, STATUS_LABEL, taskRef } from "@/lib/tasks";
import type { Member, Task } from "@/lib/types";
import { loadCtx, loadTaskById, type Ctx } from "./context";
import { APP_URL, button, esc, kv, layout, note, sendChat, sendEmail } from "./send";

export type TaskEvent =
  | "created"
  | "reassigned"
  | "acknowledged"
  | "started"
  | "blocked"
  | "unblocked"
  | "completed"
  | "closed"
  | "reopened"
  | "due_changed"
  | "comment";

type Opts = { actorId: string; note?: string; previousAssigneeId?: string };

function taskUrl(t: Task) {
  return `${APP_URL}/tasks/${t.id}`;
}

function details(t: Task, ctx: Ctx) {
  const rows: [string, string][] = [
    ["Task", `${esc(taskRef(t))} · ${esc(t.title)}`],
    ["Owner", esc(ctx.byId[t.assignee_id]?.full_name ?? "—")],
  ];
  if (t.client_id) rows.push(["Client", esc(ctx.clientName[t.client_id] ?? "—")]);
  if (t.marketplace_id) rows.push(["Marketplace", esc(ctx.marketName[t.marketplace_id] ?? "—")]);
  rows.push(["Priority", esc(PRIORITY_LABEL[t.priority])]);
  rows.push(["Due", esc(formatDate(t.due_date))]);
  rows.push(["Status", esc(STATUS_LABEL[t.status])]);
  return kv(rows);
}

function chatLine(t: Task, ctx: Ctx, headline: string, extra?: string) {
  const client = t.client_id ? ` · ${ctx.clientName[t.client_id] ?? ""}` : "";
  return `${headline}\n<${taskUrl(t)}|${taskRef(t)} · ${t.title}>${client} · Owner: ${ctx.byId[t.assignee_id]?.full_name ?? "—"}${
    extra ? `\n> ${extra.replace(/\n/g, " ")}` : ""
  }`;
}

/** Active recipients, minus the person who acted, de-duplicated. */
function people(ctx: Ctx, actorId: string, ...groups: (Member | undefined | Member[])[]) {
  const out = new Map<string, Member>();
  for (const g of groups.flat()) if (g && g.active && g.id !== actorId) out.set(g.id, g);
  return [...out.values()];
}

async function mail(to: Member[], cc: Member[], subject: string, title: string, intro: string, t: Task, ctx: Ctx, extra = "") {
  if (to.length === 0 && cc.length === 0) return;
  const primary = to.length ? to : cc;
  const copy = to.length ? cc : [];
  await sendEmail({
    to: primary.map((m) => m.email),
    cc: copy.map((m) => m.email),
    subject,
    html: layout({
      title,
      preheader: intro,
      body: `<p style="margin:0 0 8px">${intro}</p>${extra}${details(t, ctx)}<p style="margin:18px 0 0">${button(taskUrl(t), "Open task")}</p>`,
    }),
  });
}

export async function notifyTaskEvent(taskId: string, event: TaskEvent, opts: Opts) {
  try {
    const [t, ctx] = await Promise.all([loadTaskById(taskId), loadCtx()]);
    if (!t) return;
    const actor = ctx.byId[opts.actorId];
    const by = esc(actor?.full_name ?? "Someone");
    const owner = ctx.byId[t.assignee_id];
    const creator = ctx.byId[t.created_by];
    const ref = taskRef(t);
    const n = opts.note?.trim() ?? "";
    const noteBox = (tone: "info" | "warn" | "danger" = "info") => (n ? note(n, tone) : "");

    switch (event) {
      case "created": {
        const to = people(ctx, opts.actorId, owner);
        await mail(to, [], `New task ${ref}: ${t.title}`, "A new task has been assigned to you", `${by} assigned you a task. Please acknowledge it in Pexeta Ops.`, t, ctx, t.description ? note(t.description) : "");
        break;
      }
      case "reassigned": {
        const to = people(ctx, opts.actorId, owner);
        await mail(to, [], `Task ${ref} reassigned to you: ${t.title}`, "A task has been reassigned to you", `${by} reassigned this task to you. Please acknowledge it.`, t, ctx, noteBox());
        const prev = opts.previousAssigneeId ? ctx.byId[opts.previousAssigneeId] : undefined;
        const fyi = people(ctx, opts.actorId, prev);
        await mail(fyi, [], `Task ${ref} moved to ${owner?.full_name ?? "another owner"}`, "A task has moved off your list", `${by} reassigned this task to ${esc(owner?.full_name ?? "another team member")}. No action needed from you.`, t, ctx);
        break;
      }
      case "acknowledged": {
        const to = people(ctx, opts.actorId, creator);
        await mail(to, [], `${owner?.full_name ?? "Owner"} acknowledged ${ref}`, "Task acknowledged", `${by} has acknowledged the task.`, t, ctx, noteBox());
        break;
      }
      case "started": {
        // Starting straight from "assigned" counts as acknowledgement.
        const to = people(ctx, opts.actorId, creator);
        await mail(to, [], `${owner?.full_name ?? "Owner"} started ${ref}`, "Work has started", `${by} has acknowledged the task and started work.`, t, ctx, noteBox());
        break;
      }
      case "blocked": {
        const to = people(ctx, opts.actorId, ctx.vps, creator);
        await mail(to, [], `Blocked: ${ref} · ${t.title}`, "A task is blocked", `${by} marked this task blocked. It needs a decision or input to move.`, t, ctx, note(n || t.blocked_reason, "danger"));
        await sendChat(chatLine(t, ctx, `🔴 *Blocked* by ${actor?.full_name ?? "someone"}`, n || t.blocked_reason));
        break;
      }
      case "unblocked": {
        await sendChat(chatLine(t, ctx, `🟢 *Unblocked* by ${actor?.full_name ?? "someone"}`, n));
        const to = people(ctx, opts.actorId, owner, creator);
        await mail(to, [], `Unblocked: ${ref} · ${t.title}`, "A task is moving again", `${by} cleared the block on this task.`, t, ctx, noteBox());
        break;
      }
      case "completed": {
        const closers = ctx.team.filter((m) => m.active && ctx.settings.closure_roles.includes(m.role));
        const to = people(ctx, opts.actorId, closers);
        await mail(to, [], `Ready for closure: ${ref} · ${t.title}`, "A task is awaiting your closure", `${by} has submitted this task as done. Please verify and close it, or reopen it with feedback.`, t, ctx, noteBox());
        await sendChat(chatLine(t, ctx, `🟠 *Submitted for VP closure* by ${actor?.full_name ?? "someone"}`, n));
        break;
      }
      case "closed": {
        const to = people(ctx, opts.actorId, owner);
        await mail(to, [], `Closed: ${ref} · ${t.title}`, "Your task has been closed", `${by} verified and closed this task. Well done.`, t, ctx, noteBox());
        await sendChat(chatLine(t, ctx, `✅ *Closed* by ${actor?.full_name ?? "someone"}`));
        break;
      }
      case "reopened": {
        const to = people(ctx, opts.actorId, owner);
        await mail(to, [], `Reopened: ${ref} · ${t.title}`, "Your task has been reopened", `${by} reopened this task. Please read the feedback and acknowledge it.`, t, ctx, note(n, "warn"));
        await sendChat(chatLine(t, ctx, `↩️ *Reopened* by ${actor?.full_name ?? "someone"}`, n));
        break;
      }
      case "due_changed": {
        const to = people(ctx, opts.actorId, owner);
        await mail(to, [], `Due date changed: ${ref} now due ${formatDate(t.due_date)}`, "A due date has changed", `${by} changed the due date of this task to ${esc(formatDate(t.due_date))}.`, t, ctx, noteBox());
        break;
      }
      case "comment": {
        // The other side of the conversation: the owner, and whoever assigned it.
        const to = people(ctx, opts.actorId, owner, creator);
        await mail(to, [], `New comment on ${ref}: ${t.title}`, "New comment", `${by} commented:`, t, ctx, note(n));
        break;
      }
    }
  } catch (err) {
    console.error(`[pexeta-ops] notification "${event}" failed:`, err);
  }
}
