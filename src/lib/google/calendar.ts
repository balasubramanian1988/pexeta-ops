// Google Calendar via a service account with domain-wide delegation.
// The service account acts as each @pexeta.in user (the "subject") to create events in their calendar,
// so invites come from the organiser and Meet links are created on their account.
// Optional: if GOOGLE_SA_EMAIL / GOOGLE_SA_PRIVATE_KEY aren't set, every function is a no-op.
import "server-only";
import { randomUUID } from "node:crypto";
import { accessToken, googleConfigured, SCOPES } from "./auth";

const API = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
export const TIME_ZONE = "Asia/Kolkata";

export function calendarEnabled() {
  return googleConfigured();
}

async function call<T>(subject: string, method: string, path: string, query: Record<string, string> = {}, body?: unknown): Promise<T | null> {
  const qs = new URLSearchParams(query).toString();
  const res = await fetch(`${API}${path}${qs ? `?${qs}` : ""}`, {
    method,
    headers: { Authorization: `Bearer ${await accessToken(subject, SCOPES.calendar)}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (method === "DELETE" && (res.status === 404 || res.status === 410)) return null; // already gone
  if (!res.ok) throw new Error(`Google Calendar ${method} ${path || "/"} failed: ${res.status} ${await res.text()}`);
  if (res.status === 204) return null;
  return (await res.json()) as T;
}

type GEvent = {
  id: string;
  summary?: string;
  htmlLink?: string;
  hangoutLink?: string;
  status?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: { email: string; self?: boolean; responseStatus?: string }[];
  eventType?: string;
  transparency?: string;
  extendedProperties?: { private?: Record<string, string> };
};

export type EventInput = {
  summary: string;
  description?: string;
  /** Timed event: ISO timestamps. All-day event: YYYY-MM-DD (end is exclusive). */
  start: string;
  end: string;
  allDay?: boolean;
  attendees?: string[];
  meet?: boolean;
  /** Pop-up reminders, minutes before the start. */
  reminders?: number[];
  /** Show as free (don't block the calendar). */
  free?: boolean;
  /** Private tags, e.g. { opsTask: "<id>" }, so Ops can recognise its own events. */
  tags?: Record<string, string>;
};

function toBody(e: EventInput) {
  const when = (v: string) => (e.allDay ? { date: v } : { dateTime: v, timeZone: TIME_ZONE });
  return {
    summary: e.summary,
    description: e.description ?? "",
    start: when(e.start),
    end: when(e.end),
    attendees: e.attendees?.map((email) => ({ email })),
    reminders: e.reminders ? { useDefault: false, overrides: e.reminders.map((minutes) => ({ method: "popup", minutes })) } : undefined,
    transparency: e.free ? "transparent" : "opaque",
    extendedProperties: e.tags ? { private: e.tags } : undefined,
    conferenceData: e.meet ? { createRequest: { requestId: randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } } : undefined,
  };
}

export type CreatedEvent = { id: string; htmlLink: string; meetUrl: string };

/** Creates an event in `owner`'s calendar. Attendees get Google's invite email. */
export async function createEvent(owner: string, e: EventInput): Promise<CreatedEvent> {
  const ev = await call<GEvent>(owner, "POST", "", { conferenceDataVersion: "1", sendUpdates: e.attendees?.length ? "all" : "none" }, toBody(e));
  return { id: ev!.id, htmlLink: ev!.htmlLink ?? "", meetUrl: ev!.hangoutLink ?? "" };
}

/** Updates the fields given (keeps the existing Meet link). */
export async function updateEvent(owner: string, id: string, e: EventInput) {
  const body = toBody({ ...e, meet: false });
  delete (body as { conferenceData?: unknown }).conferenceData;
  await call<GEvent>(owner, "PATCH", `/${encodeURIComponent(id)}`, { sendUpdates: e.attendees?.length ? "all" : "none" }, body);
}

/** Deletes an event; attendees are told it's cancelled. Missing events are ignored. */
export async function deleteEvent(owner: string, id: string, notify = true) {
  await call(owner, "DELETE", `/${encodeURIComponent(id)}`, { sendUpdates: notify ? "all" : "none" });
}

export type CalendarItem = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  meetUrl: string;
  htmlLink: string;
  opsTaskId?: string;
};

/** Events in `owner`'s primary calendar between two ISO timestamps, in start order. */
export async function listEvents(owner: string, timeMin: string, timeMax: string): Promise<CalendarItem[]> {
  const res = await call<{ items?: GEvent[] }>(owner, "GET", "", {
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "50",
  });
  return (res?.items ?? [])
    .filter((e) => e.status !== "cancelled")
    .map((e) => ({
      id: e.id,
      title: e.summary || "(No title)",
      start: e.start?.dateTime ?? e.start?.date ?? "",
      end: e.end?.dateTime ?? e.end?.date ?? "",
      allDay: !e.start?.dateTime,
      meetUrl: e.hangoutLink ?? "",
      htmlLink: e.htmlLink ?? "",
      opsTaskId: e.extendedProperties?.private?.opsTask,
    }));
}

export type Availability =
  | { state: "away"; until: string; title: string }
  | { state: "busy"; until: string; title: string; next?: { start: string; title: string } }
  | { state: "free"; next?: { start: string; title: string } }
  | { state: "unknown" };

/** Is this person free right now? Reads their own calendar for the rest of today (IST). */
export async function availability(email: string): Promise<Availability> {
  try {
    const now = new Date();
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(now);
    const endOfDay = new Date(`${today}T23:59:59+05:30`);
    const res = await call<{ items?: GEvent[] }>(email, "GET", "", {
      timeMin: now.toISOString(),
      timeMax: endOfDay.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "20",
    });
    const items = (res?.items ?? []).filter((e) => {
      if (e.status === "cancelled" || e.transparency === "transparent") return false;
      if (!e.start?.dateTime && e.eventType !== "outOfOffice") return false; // all-day events (e.g. task deadlines) don't make you busy
      const me = e.attendees?.find((a) => a.self);
      return !(me && me.responseStatus === "declined");
    });
    const nowMs = now.getTime();
    const startMs = (e: GEvent) => new Date(e.start?.dateTime ?? `${e.start?.date}T00:00:00+05:30`).getTime();
    const endIso = (e: GEvent) => e.end?.dateTime ?? `${e.end?.date}T00:00:00+05:30`;
    const current = items.find((e) => startMs(e) <= nowMs && new Date(endIso(e)).getTime() > nowMs);
    const upcoming = items.find((e) => startMs(e) > nowMs);
    const next = upcoming ? { start: upcoming.start?.dateTime ?? "", title: upcoming.summary ?? "Busy" } : undefined;
    if (current?.eventType === "outOfOffice") return { state: "away", until: endIso(current), title: current.summary ?? "Out of office" };
    if (current) return { state: "busy", until: endIso(current), title: current.summary ?? "Busy", next };
    return { state: "free", next };
  } catch (err) {
    console.error(`[pexeta-ops] availability for ${email} failed:`, err);
    return { state: "unknown" };
  }
}
