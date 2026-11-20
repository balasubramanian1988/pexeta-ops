// Google Calendar via a service account with domain-wide delegation.
// The service account acts as each @pexeta.in user (the "subject") to create events in their calendar,
// so invites come from the organiser and Meet links are created on their account.
// Optional: if GOOGLE_SA_EMAIL / GOOGLE_SA_PRIVATE_KEY aren't set, every function is a no-op.
import "server-only";
import { createSign, randomUUID } from "node:crypto";

const SCOPE = "https://www.googleapis.com/auth/calendar.events";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
export const TIME_ZONE = "Asia/Kolkata";

export function calendarEnabled() {
  return Boolean(process.env.GOOGLE_SA_EMAIL && process.env.GOOGLE_SA_PRIVATE_KEY);
}

function privateKey() {
  // Vercel stores multi-line values as-is, but a key pasted with literal "\n" also works.
  return (process.env.GOOGLE_SA_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64url");

const tokens = new Map<string, { token: string; exp: number }>();

async function accessToken(subject: string): Promise<string> {
  const key = subject.toLowerCase();
  const cached = tokens.get(key);
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({ iss: process.env.GOOGLE_SA_EMAIL, scope: SCOPE, aud: TOKEN_URL, sub: key, iat: now, exp: now + 3600 })
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const assertion = `${header}.${claims}.${b64url(signer.sign(privateKey()))}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const json = (await res.json()) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!res.ok || !json.access_token) {
    throw new Error(
      `Google sign-in for ${key} failed: ${json.error ?? res.status} ${json.error_description ?? ""}`.trim() +
        " (check the service account key and domain-wide delegation for the calendar.events scope)"
    );
  }
  tokens.set(key, { token: json.access_token, exp: Date.now() + (json.expires_in ?? 3600) * 1000 });
  return json.access_token;
}

async function call<T>(subject: string, method: string, path: string, query: Record<string, string> = {}, body?: unknown): Promise<T | null> {
  const qs = new URLSearchParams(query).toString();
  const res = await fetch(`${API}${path}${qs ? `?${qs}` : ""}`, {
    method,
    headers: { Authorization: `Bearer ${await accessToken(subject)}`, "Content-Type": "application/json" },
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
  attendees?: { email: string; responseStatus?: string }[];
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
