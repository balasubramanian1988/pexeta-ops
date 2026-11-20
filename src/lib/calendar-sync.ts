// Keeps each open task's due date as an all-day event in its owner's Google Calendar.
// Called in the background after task changes; safe to call repeatedly (it converges to the right state).
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { APP_URL } from "@/lib/notify/send";
import { OPEN_STATUSES, taskRef } from "@/lib/tasks";
import type { Task } from "@/lib/types";
import { calendarEnabled, createEvent, deleteEvent, updateEvent } from "./google/calendar";

type SyncTask = Task & { calendar_event_id?: string | null; calendar_owner_email?: string | null };

function nextDay(date: string) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export async function syncTaskCalendar(taskId: string) {
  if (!calendarEnabled()) return;
  const db = createAdminClient();
  try {
    const { data } = await db.from("tasks").select("*").eq("id", taskId).maybeSingle();
    const t = data as SyncTask | null;
    if (!t) return;
    const { data: owner } = await db.from("team_members").select("email, active").eq("id", t.assignee_id).maybeSingle();
    const ownerEmail = owner?.active ? String(owner.email).toLowerCase() : "";
    const wanted = OPEN_STATUSES.includes(t.status) && Boolean(ownerEmail);

    let eventId = t.calendar_event_id ?? null;
    let eventOwner = t.calendar_owner_email ?? null;

    // Remove the event if the task is done, or it now belongs to someone else.
    if (eventId && eventOwner && (!wanted || eventOwner !== ownerEmail)) {
      await deleteEvent(eventOwner, eventId, false);
      eventId = null;
      eventOwner = null;
    }

    if (wanted) {
      const input = {
        summary: `Due: ${taskRef(t)} · ${t.title}`,
        description: `Pexeta Ops task due today.\n${APP_URL}/tasks/${t.id}`,
        start: t.due_date,
        end: nextDay(t.due_date),
        allDay: true,
        free: true,
        reminders: [900], // 9:00 am the day before
        tags: { opsTask: t.id },
      };
      let updated = false;
      if (eventId) {
        try {
          await updateEvent(ownerEmail, eventId, input);
          updated = true;
        } catch {
          // The owner may have deleted it in Google Calendar; create a fresh one below.
        }
      }
      if (!updated) {
        const ev = await createEvent(ownerEmail, input);
        eventId = ev.id;
        eventOwner = ownerEmail;
      }
    }

    if (eventId !== (t.calendar_event_id ?? null) || eventOwner !== (t.calendar_owner_email ?? null)) {
      await db.from("tasks").update({ calendar_event_id: eventId, calendar_owner_email: eventOwner }).eq("id", t.id);
    }
  } catch (err) {
    console.error(`[pexeta-ops] calendar sync for task ${taskId} failed:`, err);
  }
}

/** Backfill: put every open task's due date in its owner's calendar (used once after connecting Calendar). */
export async function syncAllOpenTasks(): Promise<{ tasks: number }> {
  if (!calendarEnabled()) throw new Error("Google Calendar isn't connected yet (GOOGLE_SA_EMAIL / GOOGLE_SA_PRIVATE_KEY).");
  const { data } = await createAdminClient().from("tasks").select("id").in("status", OPEN_STATUSES).limit(1000);
  const ids = (data ?? []).map((t) => t.id as string);
  for (const id of ids) await syncTaskCalendar(id);
  return { tasks: ids.length };
}
