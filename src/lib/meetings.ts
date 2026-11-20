// Reads for meetings and the "Upcoming" panel (as the signed-in user, so RLS applies).
import "server-only";
import { createClient } from "./supabase/server";
import { calendarEnabled, listEvents, type CalendarItem } from "./google/calendar";

export type Meeting = {
  id: string;
  kind: "meeting" | "reminder";
  title: string;
  description: string;
  start_at: string;
  end_at: string;
  organizer_id: string;
  attendee_emails: string[];
  task_id: string | null;
  client_id: string | null;
  meet_url: string;
  html_link: string;
  reminder_minutes: number;
  status: "scheduled" | "cancelled";
};

export async function getMeetings(fromIso: string, toIso: string): Promise<Meeting[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("meetings")
    .select("*")
    .eq("status", "scheduled")
    .gte("end_at", fromIso)
    .lte("start_at", toIso)
    .order("start_at")
    .limit(200);
  return (data ?? []) as Meeting[];
}

/** Today's and tomorrow's events from the person's own Google Calendar (all sources, not just Ops). */
export async function getCalendarAgenda(email: string, days = 2): Promise<CalendarItem[] | null> {
  if (!calendarEnabled()) return null;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const start = new Date(`${today}T00:00:00+05:30`);
  const end = new Date(start.getTime() + days * 86400000);
  try {
    return await listEvents(email, start.toISOString(), end.toISOString());
  } catch (e) {
    console.error("[pexeta-ops] calendar agenda failed:", e);
    return null;
  }
}

export function timeRange(startIso: string, endIso: string) {
  const opts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" };
  return `${new Date(startIso).toLocaleTimeString("en-IN", opts)} – ${new Date(endIso).toLocaleTimeString("en-IN", opts)}`;
}

export function dayLabel(iso: string) {
  const fmt = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
  const day = fmt(new Date(iso));
  const today = fmt(new Date());
  const tomorrow = fmt(new Date(Date.now() + 86400000));
  if (day === today) return "Today";
  if (day === tomorrow) return "Tomorrow";
  return new Date(iso).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}

export type UpcomingItem = { id: string; title: string; start: string; end: string; meetUrl: string };

/** Next meetings for the "Upcoming" panel: the person's Google Calendar if connected, otherwise meetings scheduled in Ops. */
export async function getUpcoming(email: string): Promise<UpcomingItem[]> {
  const now = Date.now();
  const agenda = await getCalendarAgenda(email, 2);
  if (agenda) {
    return agenda
      .filter((e) => !e.allDay && new Date(e.end).getTime() > now)
      .map((e) => ({ id: e.id, title: e.title, start: e.start, end: e.end, meetUrl: e.meetUrl }));
  }
  const list = await getMeetings(new Date(now).toISOString(), new Date(now + 2 * 86400000).toISOString());
  return list.map((m) => ({ id: m.id, title: m.title, start: m.start_at, end: m.end_at, meetUrl: m.meet_url }));
}
