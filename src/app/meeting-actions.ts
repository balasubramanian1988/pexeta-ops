"use server";
// Meetings and reminders scheduled from Ops. The event is created in the organiser's Google Calendar
// (Google sends the invites); Ops keeps a record so it can show, link and cancel it.
import { revalidatePath } from "next/cache";
import { getMember, isManager } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { calendarEnabled, createEvent, deleteEvent } from "@/lib/google/calendar";
import { APP_URL } from "@/lib/notify/send";
import type { ActionResult } from "./actions";

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
const NOT_CONNECTED =
  "Google Calendar isn't connected yet. Add GOOGLE_SA_EMAIL and GOOGLE_SA_PRIVATE_KEY in Vercel (see the README), then redeploy.";

function str(fd: FormData, key: string) {
  return String(fd.get(key) ?? "").trim();
}

export async function scheduleMeeting(_prev: ActionResult, fd: FormData): Promise<ActionResult & { meetUrl?: string }> {
  const me = await getMember();
  if (!calendarEnabled()) return { ok: false, error: NOT_CONNECTED };

  const kind = str(fd, "kind") === "reminder" ? "reminder" : "meeting";
  const title = str(fd, "title");
  const date = str(fd, "date");
  const time = str(fd, "time");
  const duration = Math.max(5, Math.min(480, Number(fd.get("duration") ?? 30) || 30));
  const reminder = Math.max(0, Math.min(1440, Number(fd.get("reminder_minutes") ?? 10) || 0));
  const taskId = str(fd, "task_id") || null;
  const clientId = str(fd, "client_id") || null;
  const description = str(fd, "description");

  if (!title) return { ok: false, error: "Add a title." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return { ok: false, error: "Choose a date and time." };
  const start = new Date(`${date}T${time}:00+05:30`);
  if (start.getTime() < Date.now() - 5 * 60_000) return { ok: false, error: "That time has already passed." };
  const end = new Date(start.getTime() + (kind === "reminder" ? 15 : duration) * 60_000);

  let attendees: string[] = [];
  if (kind === "meeting") {
    const db = createAdminClient();
    const ids = fd.getAll("attendee_ids").map(String).filter(Boolean);
    const { data: team } = ids.length ? await db.from("team_members").select("email").in("id", ids).eq("active", true) : { data: [] };
    const external = str(fd, "external_emails").split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
    const bad = external.filter((x) => !EMAIL.test(x));
    if (bad.length) return { ok: false, error: `Check these email addresses: ${bad.join(", ")}` };
    attendees = [...new Set([...(team ?? []).map((m) => String(m.email).toLowerCase()), ...external])].filter((e) => e !== me.email.toLowerCase());
    if (attendees.length === 0) return { ok: false, error: "Add at least one person to invite, or choose Reminder." };
  }

  let taskLine = "";
  if (taskId) {
    const { data: t } = await createAdminClient().from("tasks").select("ref, title").eq("id", taskId).maybeSingle();
    if (t) taskLine = `\n\nRelated task: PX-${t.ref} · ${t.title}\n${APP_URL}/tasks/${taskId}`;
  }

  let ev;
  try {
    ev = await createEvent(me.email, {
      summary: title,
      description: `${description}${taskLine}\n\nScheduled from Pexeta Ops by ${me.full_name}.`.trim(),
      start: start.toISOString(),
      end: end.toISOString(),
      attendees,
      meet: kind === "meeting" && fd.get("add_meet") === "on",
      reminders: reminder > 0 ? [reminder] : [],
      tags: taskId ? { opsMeeting: "1", opsTaskRef: taskId } : { opsMeeting: "1" },
    });
  } catch (e) {
    console.error("[pexeta-ops] schedule meeting failed:", e);
    return { ok: false, error: "Google Calendar didn't accept the event. Check that domain-wide delegation is set up for the calendar.events scope." };
  }

  const db = createAdminClient();
  const { error } = await db.from("meetings").insert({
    kind,
    title,
    description,
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    organizer_id: me.id,
    attendee_emails: attendees,
    task_id: taskId,
    client_id: clientId,
    meet_url: ev.meetUrl,
    google_event_id: ev.id,
    html_link: ev.htmlLink,
    reminder_minutes: reminder,
  });
  if (error) console.error("[pexeta-ops] meetings insert failed (run supabase/006_release1.sql):", error.message);

  if (taskId) {
    const when = start.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
    await db.from("task_activity").insert({
      task_id: taskId,
      actor_id: me.id,
      event: kind === "meeting" ? "meeting_scheduled" : "reminder_set",
      detail: `${title} · ${when}${ev.meetUrl ? ` · ${ev.meetUrl}` : ""}`,
    });
    revalidatePath(`/tasks/${taskId}`);
  }
  revalidatePath("/meetings");
  revalidatePath("/my-work");
  return { ok: true, meetUrl: ev.meetUrl };
}

export async function cancelMeeting(fd: FormData) {
  const me = await getMember();
  const id = str(fd, "id");
  const db = createAdminClient();
  const { data: m } = await db.from("meetings").select("id, organizer_id, google_event_id, status").eq("id", id).maybeSingle();
  if (!m || m.status === "cancelled") return;
  if (m.organizer_id !== me.id && !isManager(me.role)) return;
  const { data: organizer } = await db.from("team_members").select("email").eq("id", m.organizer_id).maybeSingle();
  if (m.google_event_id && organizer?.email && calendarEnabled()) {
    try {
      await deleteEvent(String(organizer.email), m.google_event_id, true);
    } catch (e) {
      console.error("[pexeta-ops] cancel meeting failed:", e);
    }
  }
  await db.from("meetings").update({ status: "cancelled" }).eq("id", id);
  revalidatePath("/meetings");
  revalidatePath("/my-work");
}
