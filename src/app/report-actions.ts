"use server";
// Reports and notification settings (VP / admin only).
import { revalidatePath } from "next/cache";
import { getMember, isManager } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Client, WeeklyReport } from "@/lib/types";
import type { ActionResult } from "./actions";
import { loadCtx } from "@/lib/notify/context";
import { sendDailyReport } from "@/lib/notify/daily";
import { runSlaReminders } from "@/lib/notify/reminders";
import { sendEmail } from "@/lib/notify/send";
import { generateWeeklyDrafts, renderClientReport, reportItems } from "@/lib/notify/weekly";

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

function parseEmails(raw: string) {
  const list = raw.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
  const bad = list.filter((x) => !EMAIL.test(x));
  return { list: [...new Set(list)], bad };
}

export async function saveWeeklyReport(_prev: ActionResult, fd: FormData): Promise<ActionResult & { sent?: boolean }> {
  const me = await getMember();
  if (!isManager(me.role)) return { ok: false, error: "Only the VP or an admin can work on seller reports." };
  const db = createAdminClient();
  const id = String(fd.get("report_id") ?? "");
  const intent = String(fd.get("intent") ?? "save");
  const { data: report } = await db.from("weekly_reports").select("*").eq("id", id).single();
  if (!report) return { ok: false, error: "Report not found." };
  const r = report as WeeklyReport;

  const all = fd.getAll("all_ids").map(String);
  const kept = new Set(fd.getAll("include").map(String));
  const excluded = all.filter((x) => !kept.has(x));
  const summary = String(fd.get("summary") ?? "").trim();
  const contactName = String(fd.get("contact_name") ?? "").trim();
  const { list: emails, bad } = parseEmails(String(fd.get("recipients") ?? ""));
  if (bad.length) return { ok: false, error: `Check these email addresses: ${bad.join(", ")}` };

  const now = new Date().toISOString();
  await db.from("weekly_reports").update({ summary, excluded_task_ids: excluded, updated_at: now }).eq("id", id);
  await db.from("clients").update({ contact_emails: emails, contact_name: contactName }).eq("id", r.client_id);

  if (intent === "send") {
    if (!emails.length) return { ok: false, error: "Add at least one seller email address before sending." };
    const [{ data: client }, ctx] = await Promise.all([db.from("clients").select("*").eq("id", r.client_id).single(), loadCtx()]);
    const items = await reportItems(r.client_id, r.week_start, r.week_end);
    const out = renderClientReport({
      client: client as Client,
      report: { ...r, summary, excluded_task_ids: excluded },
      items,
      marketName: ctx.marketName,
      signature: me.full_name,
    });
    if (!out.included.length && !summary) return { ok: false, error: "The report is empty. Keep at least one task or add a note." };
    const cc = [...new Set([me.email, ...ctx.vps.map((v) => v.email)])];
    const ok = await sendEmail({ to: emails, cc, replyTo: me.email, subject: out.subject, html: out.html });
    if (!ok) return { ok: false, error: "The email couldn't be sent. Check the email settings (RESEND_API_KEY) and try again." };
    await db.from("weekly_reports").update({ status: "sent", sent_at: now, sent_by: me.id, sent_to: emails }).eq("id", id);
  }
  revalidatePath("/reports");
  revalidatePath(`/reports/${id}`);
  return { ok: true, sent: intent === "send" };
}

export async function runJobNow(_prev: ActionResult, fd: FormData): Promise<ActionResult & { message?: string }> {
  const me = await getMember();
  if (!isManager(me.role)) return { ok: false, error: "Only the VP or an admin can run this." };
  const job = String(fd.get("job"));
  try {
    if (job === "daily") {
      const r = await sendDailyReport({ force: true });
      if ("skipped" in r) return { ok: false, error: r.skipped };
      return r.sent ? { ok: true, message: `Daily report sent to ${r.to.join(", ")}.` } : { ok: false, error: "Not sent. Check RESEND_API_KEY and that a VP is on the team list." };
    }
    if (job === "weekly") {
      const r = await generateWeeklyDrafts();
      revalidatePath("/reports");
      return { ok: true, message: `${r.clients} report${r.clients === 1 ? "" : "s"} ready for ${r.weekStart} – ${r.weekEnd} (${r.created} new).` };
    }
    if (job === "reminders") {
      const r = await runSlaReminders();
      if ("skipped" in r) return { ok: false, error: r.skipped };
      return { ok: true, message: `Reminders checked: ${r.emails} email${r.emails === 1 ? "" : "s"} sent.` };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
  return { ok: false, error: "Unknown job." };
}

export async function saveNotifySettings(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const me = await getMember();
  if (!isManager(me.role)) return { ok: false, error: "Only the VP or an admin can change this." };
  const { error } = await createAdminClient()
    .from("settings")
    .update({
      daily_report_enabled: fd.get("daily_report_enabled") === "on",
      reminders_enabled: fd.get("reminders_enabled") === "on",
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}

export async function saveClientContacts(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const me = await getMember();
  if (!isManager(me.role)) return { ok: false, error: "Only the VP or an admin can change this." };
  const { list, bad } = parseEmails(String(fd.get("recipients") ?? ""));
  if (bad.length) return { ok: false, error: `Check: ${bad.join(", ")}` };
  const { error } = await createAdminClient()
    .from("clients")
    .update({ contact_emails: list, contact_name: String(fd.get("contact_name") ?? "").trim() })
    .eq("id", String(fd.get("client_id")));
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}
