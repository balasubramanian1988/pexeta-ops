// Weekly seller reports: drafted every Monday for the previous Monday–Sunday, one per client account.
// The VP reviews each draft (adds a note, removes tasks), then sends it to the seller's contacts.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOpen } from "@/lib/tasks";
import type { Activity, Client, Task, WeeklyReport } from "@/lib/types";
import { loadCtx, type Ctx } from "./context";
import { addDays, istDate, istStart, mondayOf, shortDate } from "./dates";
import { APP_URL, button, esc, layout, sendEmail } from "./send";

export type ReportItem = { task: Task; section: "done" | "progress" | "blocked" | "next"; when: string };

/** The tasks that belong in a client's report for a week (before the VP's exclusions). */
export async function reportItems(clientId: string, weekStart: string, weekEnd: string): Promise<ReportItem[]> {
  const db = createAdminClient();
  const from = istStart(weekStart);
  const to = istStart(addDays(weekEnd, 1));
  const { data: tdata } = await db.from("tasks").select("*").eq("client_id", clientId).limit(2000);
  const tasks = (tdata ?? []) as Task[];
  const ids = tasks.map((t) => t.id);
  const { data: adata } = ids.length
    ? await db.from("task_activity").select("task_id, created_at").in("task_id", ids).gte("created_at", from).lt("created_at", to)
    : { data: [] };
  const touched = new Set(((adata ?? []) as Pick<Activity, "task_id">[]).map((a) => a.task_id));
  const [fromMs, toMs] = [Date.parse(from), Date.parse(to)];
  const inWeek = (ts: string | null) => !!ts && Date.parse(ts) >= fromMs && Date.parse(ts) < toMs;
  const nextEnd = addDays(weekEnd, 7);

  const items: ReportItem[] = [];
  for (const t of tasks) {
    const done = t.status === "completed" || t.status === "closed";
    if (done && (inWeek(t.completed_at) || inWeek(t.closed_at))) {
      items.push({ task: t, section: "done", when: istDate((t.completed_at ?? t.closed_at)!) });
    } else if (t.status === "blocked") {
      items.push({ task: t, section: "blocked", when: t.due_date });
    } else if (isOpen(t) && (touched.has(t.id) || t.due_date <= weekEnd)) {
      items.push({ task: t, section: "progress", when: t.due_date });
    } else if (isOpen(t) && t.due_date > weekEnd && t.due_date <= nextEnd) {
      items.push({ task: t, section: "next", when: t.due_date });
    }
  }
  return items.sort((a, b) => a.when.localeCompare(b.when));
}

const SECTION: Record<ReportItem["section"], { title: string; empty: string }> = {
  done: { title: "Completed this week", empty: "" },
  progress: { title: "In progress", empty: "" },
  blocked: { title: "Waiting on inputs", empty: "" },
  next: { title: "Planned for next week", empty: "" },
};

export function renderClientReport(opts: {
  client: Client;
  report: Pick<WeeklyReport, "week_start" | "week_end" | "summary" | "excluded_task_ids">;
  items: ReportItem[];
  marketName: Record<string, string>;
  signature: string;
}) {
  const { client, report, items, marketName } = opts;
  const included = items.filter((i) => !report.excluded_task_ids.includes(i.task.id));
  const range = `${shortDate(report.week_start)} – ${shortDate(report.week_end)}`;
  const sections = (Object.keys(SECTION) as ReportItem["section"][])
    .map((key) => {
      const rows = included.filter((i) => i.section === key);
      if (!rows.length) return "";
      const lis = rows
        .map(({ task: t, when }) => {
          const mk = t.marketplace_id ? marketName[t.marketplace_id] : "";
          const meta =
            key === "done"
              ? `Completed ${shortDate(when)}`
              : key === "progress"
                ? `${t.progress ? `${t.progress}% done · ` : ""}target ${shortDate(t.due_date)}`
                : key === "next"
                  ? `Target ${shortDate(t.due_date)}`
                  : t.blocked_reason;
          return `<tr><td style="padding:8px 0;border-top:1px solid #eef2f7;vertical-align:top">
<div style="font-weight:600;color:#0b2a4a">${esc(t.title)}</div>
<div style="font-size:12px;color:#4b5a6b">${mk ? `${esc(mk)} · ` : ""}${esc(meta)}</div></td></tr>`;
        })
        .join("");
      const color = key === "blocked" ? "#8a4b08" : "#0b2a4a";
      return `<h3 style="margin:20px 0 4px;font-size:15px;color:${color}">${SECTION[key].title} <span style="color:#9aa6b2;font-weight:400">(${rows.length})</span></h3>
<table cellpadding="0" cellspacing="0" style="width:100%">${lis}</table>`;
    })
    .join("");

  const greet = client.contact_name ? `Dear ${esc(client.contact_name)},` : `Dear ${esc(client.name)} team,`;
  const summary = report.summary.trim()
    ? `<div style="margin:14px 0;padding:14px 16px;background:#eef2f7;border-left:4px solid #f2871e;border-radius:4px;white-space:pre-wrap">${esc(report.summary.trim())}</div>`
    : "";
  const body = `<p style="margin:0">${greet}</p>
<p style="margin:10px 0 0">Here is a summary of the work our team did on your account for the week of ${esc(range)}.</p>
${summary}
${sections || `<p style="color:#4b5a6b">No account activity to report this week.</p>`}
<p style="margin:24px 0 0">If you have questions on any item, just reply to this email.</p>
<p style="margin:12px 0 0">Regards,<br><b>${esc(opts.signature)}</b><br>Pexeta</p>`;

  return {
    subject: `${client.name} · Weekly account update · ${range}`,
    html: layout({ title: `Weekly account update · ${range}`, preheader: `${included.filter((i) => i.section === "done").length} tasks completed this week`, body, brand: "client" }),
    included,
  };
}

/** Creates draft reports for last week (Mon–Sun) for every active client with something to report. */
export async function generateWeeklyDrafts(opts: { notify?: boolean } = {}) {
  const ctx = await loadCtx();
  const db = createAdminClient();
  const weekStart = addDays(mondayOf(istDate()), -7);
  const weekEnd = addDays(weekStart, 6);
  let created = 0;
  const ready: string[] = [];
  for (const c of ctx.clients.filter((x) => x.active)) {
    const items = await reportItems(c.id, weekStart, weekEnd);
    if (!items.length) continue;
    const { data } = await db
      .from("weekly_reports")
      .upsert({ client_id: c.id, week_start: weekStart, week_end: weekEnd }, { onConflict: "client_id,week_start", ignoreDuplicates: true })
      .select("id");
    if (data?.length) created++;
    ready.push(c.name);
  }
  if (opts.notify !== false && ready.length) await notifyDraftsReady(ctx, weekStart, weekEnd, ready);
  return { weekStart, weekEnd, created, clients: ready.length };
}

async function notifyDraftsReady(ctx: Ctx, weekStart: string, weekEnd: string, clients: string[]) {
  const to = ctx.vps.map((m) => m.email);
  if (!to.length) return;
  const missing = ctx.clients.filter((c) => clients.includes(c.name) && !(c.contact_emails ?? []).length).map((c) => c.name);
  await sendEmail({
    to,
    subject: `${clients.length} weekly seller report${clients.length > 1 ? "s" : ""} ready for review · ${shortDate(weekStart)}–${shortDate(weekEnd)}`,
    html: layout({
      title: "Weekly seller reports are ready",
      body: `<p style="margin:0">Drafts for ${esc(shortDate(weekStart))} – ${esc(shortDate(weekEnd))} are ready. Review each one, add a note if you like, remove anything that shouldn't go out, then send.</p>
<ul style="padding-left:18px">${clients.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>
${missing.length ? `<p style="color:#8a4b08">No seller email saved yet for: ${missing.map(esc).join(", ")}. Add it on the report page before sending.</p>` : ""}
<p style="margin:18px 0 0">${button(`${APP_URL}/reports`, "Review reports")}</p>`,
    }),
  });
}
