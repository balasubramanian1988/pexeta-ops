"use server";
// Quick contact: open a Google Chat DM with a teammate, or start an instant Meet call with them.
import { revalidatePath } from "next/cache";
import { getMember } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { calendarEnabled, createEvent } from "@/lib/google/calendar";
import { chatEnabled, directMessageUrl } from "@/lib/google/chat";

export type LinkResult = { ok: boolean; url?: string; error?: string };

async function target(fd: FormData) {
  const id = String(fd.get("member_id") ?? "");
  const { data } = await createAdminClient().from("team_members").select("id, email, full_name, active").eq("id", id).maybeSingle();
  return data && data.active ? (data as { id: string; email: string; full_name: string }) : null;
}

export async function openChat(_prev: LinkResult, fd: FormData): Promise<LinkResult> {
  const me = await getMember();
  if (!chatEnabled()) return { ok: false, error: "Google Chat isn't connected yet (see the README, Release 2)." };
  const person = await target(fd);
  if (!person) return { ok: false, error: "That team member isn't active." };
  if (person.id === me.id) return { ok: false, error: "That's you." };
  try {
    return { ok: true, url: await directMessageUrl(me.email, person.email) };
  } catch (e) {
    console.error("[pexeta-ops] open chat failed:", e);
    return { ok: false, error: "Google Chat didn't respond. Check that the Chat API is set up and the chat scopes are allowed." };
  }
}

export async function startCall(_prev: LinkResult, fd: FormData): Promise<LinkResult> {
  const me = await getMember();
  if (!calendarEnabled()) return { ok: false, error: "Google Calendar isn't connected yet." };
  const person = await target(fd);
  if (!person) return { ok: false, error: "That team member isn't active." };
  if (person.id === me.id) return { ok: false, error: "That's you." };
  const taskId = String(fd.get("task_id") ?? "") || null;
  const topic = String(fd.get("topic") ?? "").trim();

  const start = new Date();
  const end = new Date(start.getTime() + 30 * 60_000);
  const title = topic ? `Quick call: ${topic}` : `Quick call: ${me.full_name} / ${person.full_name}`;
  try {
    const ev = await createEvent(me.email, {
      summary: title,
      description: `Instant call started from Pexeta Ops by ${me.full_name}.`,
      start: start.toISOString(),
      end: end.toISOString(),
      attendees: [person.email.toLowerCase()],
      meet: true,
      reminders: [0],
      tags: { opsMeeting: "1" },
    });
    if (!ev.meetUrl) return { ok: false, error: "Google didn't return a Meet link." };
    const db = createAdminClient();
    await db.from("meetings").insert({
      kind: "meeting",
      title,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      organizer_id: me.id,
      attendee_emails: [person.email.toLowerCase()],
      task_id: taskId,
      meet_url: ev.meetUrl,
      google_event_id: ev.id,
      html_link: ev.htmlLink,
      reminder_minutes: 0,
    });
    if (taskId) {
      await db.from("task_activity").insert({ task_id: taskId, actor_id: me.id, event: "call_started", detail: `With ${person.full_name} · ${ev.meetUrl}` });
      revalidatePath(`/tasks/${taskId}`);
    }
    revalidatePath("/meetings");
    return { ok: true, url: ev.meetUrl };
  } catch (e) {
    console.error("[pexeta-ops] start call failed:", e);
    return { ok: false, error: "Couldn't create the Meet call." };
  }
}
