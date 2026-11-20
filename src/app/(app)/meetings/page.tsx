import type { Metadata } from "next";
import Link from "next/link";
import { getMember, isManager } from "@/lib/auth";
import { getLookups, getTasks } from "@/lib/data";
import { cancelMeeting } from "@/app/meeting-actions";
import { calendarEnabled } from "@/lib/google/calendar";
import { dayLabel, getCalendarAgenda, getMeetings, timeRange } from "@/lib/meetings";
import { OPEN_STATUSES, taskRef, todayIST } from "@/lib/tasks";
import { Empty, PageHeader } from "@/components/ui";
import MeetingForm from "./MeetingForm";

export const metadata: Metadata = { title: "Meetings" };

export default async function MeetingsPage({ searchParams }: { searchParams: Promise<{ task?: string; client?: string; with?: string }> }) {
  const [me, lookups, tasks, sp] = await Promise.all([getMember(), getLookups(), getTasks(), searchParams]);
  const connected = calendarEnabled();
  const now = new Date();
  const [meetings, agenda] = await Promise.all([
    getMeetings(now.toISOString(), new Date(now.getTime() + 30 * 86400000).toISOString()),
    getCalendarAgenda(me.email, 2),
  ]);

  const open = tasks.filter((t) => OPEN_STATUSES.includes(t.status));
  const prefTask = sp.task ? tasks.find((t) => t.id === sp.task) : undefined;
  const taskOptions = open.map((t) => ({ id: t.id, label: `${taskRef(t)} · ${t.title}` }));
  const attendeeIds = [
    ...(sp.with ? [sp.with] : []),
    ...(prefTask ? [prefTask.assignee_id, prefTask.created_by] : []),
  ];

  return (
    <>
      <PageHeader
        eyebrow="Calendar"
        title="Meetings and reminders"
        sub="Schedule a call with a Meet link, or set yourself a reminder. Everything lands in Google Calendar and invites go out from your account."
      />

      {!connected && (
        <div className="mb-6 rounded-lg border border-amber/40 bg-amber/10 px-4 py-3 text-sm text-navy">
          Google Calendar isn&apos;t connected yet. Once the admin adds the service-account key (see the README), scheduling will work here.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <MeetingForm
            team={lookups.team.filter((m) => m.active)}
            clients={lookups.clients.filter((c) => c.active)}
            tasks={taskOptions}
            today={todayIST()}
            meId={me.id}
            defaults={{ taskId: prefTask?.id, clientId: sp.client ?? prefTask?.client_id ?? undefined, title: prefTask ? `${taskRef(prefTask)}: ${prefTask.title}` : undefined, attendeeIds }}
          />
        </div>

        <div className="space-y-5 lg:col-span-2">
          {agenda && (
            <section className="card">
              <div className="border-b border-line px-4 py-3">
                <h2 className="text-sm font-bold text-navy">Your Google Calendar: today and tomorrow</h2>
              </div>
              <div className="divide-y divide-line">
                {agenda.filter((e) => !e.allDay).map((e) => (
                  <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-ink">{e.title}</div>
                      <div className="text-xs text-muted">{dayLabel(e.start)} · {timeRange(e.start, e.end)}</div>
                    </div>
                    {e.meetUrl && <a href={e.meetUrl} target="_blank" rel="noreferrer" className="btn btn-primary px-3 py-1.5 text-xs">Join Meet</a>}
                  </div>
                ))}
                {agenda.filter((e) => !e.allDay).length === 0 && <Empty>No meetings today or tomorrow.</Empty>}
              </div>
            </section>
          )}

          <section className="card">
            <div className="border-b border-line px-4 py-3">
              <h2 className="text-sm font-bold text-navy">Scheduled from Ops <span className="tabular ml-1 text-muted">{meetings.length}</span></h2>
              <p className="text-xs text-muted">Next 30 days</p>
            </div>
            <div className="divide-y divide-line">
              {meetings.map((m) => {
                const organizer = lookups.memberName[m.organizer_id] ?? "—";
                const task = m.task_id ? tasks.find((t) => t.id === m.task_id) : undefined;
                return (
                  <div key={m.id} className="px-4 py-3">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-ink">{m.kind === "reminder" ? "⏰ " : ""}{m.title}</div>
                        <div className="text-xs text-muted">
                          {dayLabel(m.start_at)} · {timeRange(m.start_at, m.end_at)} · {organizer}
                          {m.attendee_emails.length > 0 && <> · {m.attendee_emails.length} guest{m.attendee_emails.length === 1 ? "" : "s"}</>}
                        </div>
                        {task && <Link href={`/tasks/${task.id}`} className="text-xs text-brand hover:underline">{taskRef(task)} · {task.title}</Link>}
                      </div>
                      {m.meet_url && <a href={m.meet_url} target="_blank" rel="noreferrer" className="btn btn-primary px-3 py-1.5 text-xs">Join</a>}
                    </div>
                    {(m.organizer_id === me.id || isManager(me.role)) && (
                      <form action={cancelMeeting} className="mt-1">
                        <input type="hidden" name="id" value={m.id} />
                        <button className="text-xs text-red-700 hover:underline">Cancel{m.kind === "meeting" ? " and notify guests" : ""}</button>
                      </form>
                    )}
                  </div>
                );
              })}
              {meetings.length === 0 && <Empty>Nothing scheduled from Ops yet.</Empty>}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
