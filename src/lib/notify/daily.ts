// Daily VP report (9 am IST): yesterday account-wise and member-wise, today's position, and month to date.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAckLate, isOpen, isOverdue, taskRef } from "@/lib/tasks";
import type { Activity, Task } from "@/lib/types";
import { loadCtx } from "./context";
import { addDays, istDate, istStart, longDate, monthName } from "./dates";
import { APP_URL, button, esc, layout, sendEmail, table } from "./send";

const NO_CLIENT = "__none__";
const pct = (a: number, b: number) => (b === 0 ? "–" : `${Math.round((a / b) * 100)}%`);
const dash = (n: number) => (n === 0 ? `<span style="color:#9aa6b2">0</span>` : String(n));
const red = (n: number) => (n === 0 ? dash(0) : `<b style="color:#b91c1c">${n}</b>`);

/** Was the work submitted on or before its due date? */
function onTime(t: Task) {
  const done = t.completed_at ?? t.closed_at;
  return !!done && istDate(done) <= t.due_date;
}

export async function buildDailyReport(forDate?: string) {
  const ctx = await loadCtx();
  const db = createAdminClient();
  const today = istDate();
  const day = forDate ?? addDays(today, -1); // the day being reported
  const monthStart = day.slice(0, 8) + "01";
  const [tasksRes, actRes] = await Promise.all([
    db.from("tasks").select("*").limit(10000),
    db
      .from("task_activity")
      .select("*")
      .gte("created_at", istStart(monthStart))
      .lt("created_at", istStart(addDays(day, 1)))
      .limit(20000),
  ]);
  const tasks = (tasksRes.data ?? []) as Task[];
  const byTask = Object.fromEntries(tasks.map((t) => [t.id, t]));
  const acts = (actRes.data ?? []) as Activity[];
  const dayStart = Date.parse(istStart(day));
  const dayActs = acts.filter((a) => Date.parse(a.created_at) >= dayStart);
  const s = ctx.settings;
  const inDay = (ts: string | null) => !!ts && istDate(ts) === day;
  const inMonth = (ts: string | null) => !!ts && istDate(ts) >= monthStart && istDate(ts) <= day;
  const clientKey = (t?: Task) => t?.client_id ?? NO_CLIENT;
  const clientLabel = (k: string) => (k === NO_CLIENT ? "Internal / no client" : ctx.clientName[k] ?? "Unknown");

  // ---------- Snapshot now ----------
  const open = tasks.filter(isOpen);
  const snap = {
    open: open.length,
    overdue: open.filter((t) => isOverdue(t, s, today)).length,
    blocked: open.filter((t) => t.status === "blocked").length,
    awaiting: tasks.filter((t) => t.status === "completed").length,
    ackLate: open.filter((t) => isAckLate(t, s)).length,
  };

  // ---------- Yesterday ----------
  const yCreated = tasks.filter((t) => inDay(t.created_at));
  const ySubmitted = dayActs.filter((a) => a.event === "completed");
  const yClosed = dayActs.filter((a) => a.event === "closed");
  const yBlocked = dayActs.filter((a) => a.event === "blocked");
  const yReopened = dayActs.filter((a) => a.event === "reopened");

  // ---------- Month to date ----------
  const mCreated = tasks.filter((t) => inMonth(t.created_at));
  const mClosedTasks = tasks.filter((t) => t.status === "closed" && inMonth(t.closed_at));
  const mReopens = acts.filter((a) => a.event === "reopened");
  const mOnTime = mClosedTasks.filter(onTime).length;

  // ---------- Account-wise ----------
  const accountKeys = new Set<string>();
  open.forEach((t) => accountKeys.add(clientKey(t)));
  dayActs.forEach((a) => accountKeys.add(clientKey(byTask[a.task_id])));
  mClosedTasks.forEach((t) => accountKeys.add(clientKey(t)));
  const accRows = [...accountKeys]
    .map((k) => {
      const mine = (t?: Task) => clientKey(t) === k;
      const updates = dayActs.filter((a) => mine(byTask[a.task_id])).length;
      const closedY = yClosed.filter((a) => mine(byTask[a.task_id])).length;
      const openK = open.filter((t) => mine(t));
      const closedM = mClosedTasks.filter((t) => mine(t));
      return {
        label: clientLabel(k),
        updates,
        cells: [
          esc(clientLabel(k)),
          dash(updates),
          dash(closedY),
          dash(openK.length),
          red(openK.filter((t) => isOverdue(t, s, today)).length),
          red(openK.filter((t) => t.status === "blocked").length),
          dash(closedM.length),
          pct(closedM.filter(onTime).length, closedM.length),
        ] as string[],
      };
    })
    .sort((a, b) => b.updates - a.updates || a.label.localeCompare(b.label));

  // ---------- Member-wise ----------
  const members = ctx.team.filter((m) => m.active);
  const memRows = members
    .map((m) => {
      const own = (t?: Task) => t?.assignee_id === m.id;
      const updates = dayActs.filter((a) => a.actor_id === m.id).length;
      const openM = open.filter((t) => own(t));
      const closedM = mClosedTasks.filter((t) => own(t));
      const reopensM = mReopens.filter((a) => own(byTask[a.task_id])).length;
      return {
        show: updates > 0 || openM.length > 0 || closedM.length > 0,
        updates,
        name: m.full_name,
        cells: [
          esc(m.full_name),
          dash(updates),
          dash(ySubmitted.filter((a) => a.actor_id === m.id).length),
          dash(openM.length),
          red(openM.filter((t) => isOverdue(t, s, today)).length),
          red(openM.filter((t) => isAckLate(t, s)).length),
          dash(closedM.length),
          pct(closedM.filter(onTime).length, closedM.length),
          dash(reopensM),
        ] as string[],
      };
    })
    .filter((r) => r.show)
    .sort((a, b) => b.updates - a.updates || a.name.localeCompare(b.name));

  // ---------- Highlights ----------
  const line = (a: Activity, extra = "") => {
    const t = byTask[a.task_id];
    if (!t) return "";
    const who = ctx.byId[t.assignee_id]?.full_name ?? "";
    const client = t.client_id ? ` · ${esc(ctx.clientName[t.client_id] ?? "")}` : "";
    return `<li style="margin:4px 0"><a href="${APP_URL}/tasks/${t.id}" style="color:#1d6fb8">${esc(taskRef(t))} · ${esc(t.title)}</a><span style="color:#4b5a6b">${client} · ${esc(who)}</span>${
      extra ? `<div style="color:#991b1b;font-size:13px">${esc(extra)}</div>` : ""
    }</li>`;
  };
  const list = (title: string, items: string[]) =>
    items.length ? `<h3 style="margin:16px 0 4px;font-size:14px;color:#0b2a4a">${title}</h3><ul style="margin:0;padding-left:18px">${items.join("")}</ul>` : "";
  const overdueList = open
    .filter((t) => isOverdue(t, s, today))
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .slice(0, 15)
    .map((t) => `<li style="margin:4px 0"><a href="${APP_URL}/tasks/${t.id}" style="color:#1d6fb8">${esc(taskRef(t))} · ${esc(t.title)}</a><span style="color:#4b5a6b"> · ${esc(ctx.byId[t.assignee_id]?.full_name ?? "")} · due ${esc(t.due_date)}</span></li>`);

  const tile = (label: string, value: number | string, alert = false) =>
    `<td style="padding:10px 12px;border:1px solid #dce3ec;text-align:center;width:20%"><div style="font-size:22px;font-weight:800;color:${alert ? "#b91c1c" : "#0b2a4a"}">${value}</div><div style="font-size:11px;color:#4b5a6b;text-transform:uppercase;letter-spacing:.5px">${label}</div></td>`;

  const body = `
<p style="margin:0 0 6px">Good morning. Here's how ${esc(longDate(day))} went, where things stand this morning, and ${esc(monthName(day))} to date.</p>

<h2 style="font-size:16px;color:#0b2a4a;margin:20px 0 8px">Yesterday at a glance</h2>
<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse"><tr>
${tile("Updates", dayActs.length)}${tile("New tasks", yCreated.length)}${tile("Submitted", ySubmitted.length)}${tile("Closed", yClosed.length)}${tile("Reopened", yReopened.length, yReopened.length > 0)}
</tr></table>

<h2 style="font-size:16px;color:#0b2a4a;margin:22px 0 8px">Position this morning</h2>
<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse"><tr>
${tile("Open", snap.open)}${tile("Overdue", snap.overdue, snap.overdue > 0)}${tile("Blocked", snap.blocked, snap.blocked > 0)}${tile("Awaiting closure", snap.awaiting, snap.awaiting > 0)}${tile("Not acknowledged", snap.ackLate, snap.ackLate > 0)}
</tr></table>

<h2 style="font-size:16px;color:#0b2a4a;margin:22px 0 4px">Account-wise</h2>
<p style="margin:0 0 4px;font-size:12px;color:#4b5a6b">Yesterday's updates and closures · open work now · ${esc(monthName(day))} closures and on-time rate</p>
${accRows.length ? table(["Account", "Updates", "Closed", "Open", "Overdue", "Blocked", "Closed MTD", "On time"], accRows.map((r) => r.cells)) : `<p style="color:#4b5a6b">No account activity.</p>`}

<h2 style="font-size:16px;color:#0b2a4a;margin:22px 0 4px">Team member-wise</h2>
<p style="margin:0 0 4px;font-size:12px;color:#4b5a6b">Updates each person made yesterday and tasks they submitted · their open work now · ${esc(monthName(day))} closures, on-time rate and reopens</p>
${memRows.length ? table(["Team member", "Updates", "Submitted", "Open", "Overdue", "Not ack.", "Closed MTD", "On time", "Reopens"], memRows.map((r) => r.cells)) : `<p style="color:#4b5a6b">No team activity.</p>`}

<h2 style="font-size:16px;color:#0b2a4a;margin:22px 0 8px">${esc(monthName(day))} to date</h2>
${table(
  ["Measure", "Value"],
  [
    ["Tasks created", mCreated.length],
    ["Tasks closed", mClosedTasks.length],
    ["Closed on time (submitted by due date)", `${mOnTime} of ${mClosedTasks.length} · ${pct(mOnTime, mClosedTasks.length)}`],
    ["Reopened after submission", mReopens.length],
  ]
)}

${list("Closed yesterday", yClosed.map((a) => line(a)))}
${list("Blocked yesterday", yBlocked.map((a) => line(a, a.detail)))}
${list("Reopened yesterday", yReopened.map((a) => line(a, a.detail)))}
${list(`Overdue now${snap.overdue > 15 ? " (oldest 15)" : ""}`, overdueList)}

<p style="margin:22px 0 0">${button(`${APP_URL}/dashboard`, "Open VP dashboard")}</p>`;

  return {
    day,
    subject: `Daily ops report · ${longDate(day)} · ${snap.overdue} overdue, ${snap.awaiting} awaiting closure`,
    html: layout({ title: `Daily ops report · ${longDate(day)}`, preheader: `${dayActs.length} updates, ${yClosed.length} closed yesterday. ${snap.overdue} overdue now.`, body }),
    ctx,
  };
}

export async function sendDailyReport(opts: { force?: boolean } = {}) {
  const r = await buildDailyReport();
  if (r.ctx.settings.daily_report_enabled === false && !opts.force) return { skipped: "daily report disabled" };
  const to = r.ctx.vps.map((m) => m.email);
  const cc = r.ctx.managers.filter((m) => m.role === "admin").map((m) => m.email);
  const sent = await sendEmail({ to: to.length ? to : cc, cc: to.length ? cc : [], subject: r.subject, html: r.html });
  return { sent, day: r.day, to: to.length ? to : cc };
}
