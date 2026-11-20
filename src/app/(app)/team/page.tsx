import type { Metadata } from "next";
import { getMember } from "@/lib/auth";
import { getLookups, getTasks } from "@/lib/data";
import { availability, calendarEnabled, type Availability } from "@/lib/google/calendar";
import { chatEnabled } from "@/lib/google/chat";
import { OPEN_STATUSES } from "@/lib/tasks";
import { Avatar, PageHeader } from "@/components/ui";
import ContactButtons from "@/components/ContactButtons";

export const metadata: Metadata = { title: "Team" };
export const dynamic = "force-dynamic";

const ROLE = { vp: "Vice President", admin: "Admin", lead: "Team lead", member: "Team member" } as const;

function clock(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

function Status({ a }: { a: Availability }) {
  if (a.state === "unknown") return <span className="text-xs text-faint">Calendar not available</span>;
  const dot = (c: string) => <span className={`inline-block h-2 w-2 rounded-full ${c}`} />;
  if (a.state === "away")
    return <span className="flex items-center gap-1.5 text-xs text-muted">{dot("bg-slate-400")} Out of office</span>;
  if (a.state === "busy")
    return (
      <span className="flex items-center gap-1.5 text-xs text-red-700">
        {dot("bg-red-500")} In a meeting until {clock(a.until)}
      </span>
    );
  return (
    <span className="flex items-center gap-1.5 text-xs text-emerald-700">
      {dot("bg-emerald-500")} Free{a.next ? ` · next at ${clock(a.next.start)}` : " for the rest of the day"}
    </span>
  );
}

export default async function TeamPage() {
  const [me, lookups, tasks] = await Promise.all([getMember(), getLookups(), getTasks()]);
  const team = lookups.team.filter((m) => m.active);
  const cal = calendarEnabled();
  const chat = chatEnabled();
  const statuses = cal ? await Promise.all(team.map((m) => availability(m.email))) : team.map(() => ({ state: "unknown" }) as Availability);
  const openCount = (id: string) => tasks.filter((t) => t.assignee_id === id && OPEN_STATUSES.includes(t.status)).length;

  return (
    <>
      <PageHeader
        eyebrow="Team"
        title="Who's free"
        sub="Live from each person's Google Calendar. Message opens a Google Chat conversation; Call starts a Meet and sends them the invite."
      />
      <div className="card divide-y divide-line">
        {team.map((m, i) => (
          <div key={m.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Avatar name={m.full_name} size={36} />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-ink">
                  {m.full_name} {m.id === me.id && <span className="text-xs font-normal text-faint">(you)</span>}
                </div>
                <div className="text-xs text-muted">
                  {ROLE[m.role]}
                  {m.id === me.id || openCount(m.id) === 0 ? "" : ` · ${openCount(m.id)} open task${openCount(m.id) === 1 ? "" : "s"}`}
                </div>
                <div className="mt-1">{cal ? <Status a={statuses[i]!} /> : <span className="text-xs text-faint">Connect Google Calendar to see availability</span>}</div>
              </div>
            </div>
            {m.id !== me.id && <ContactButtons memberId={m.id} email={m.email} chat={chat} calendar={cal} />}
          </div>
        ))}
      </div>
      {!chat && (
        <p className="mt-4 text-xs text-muted">
          Message currently opens an email. Once Google Chat is connected (README, Release 2), it opens a Chat conversation instead.
        </p>
      )}
    </>
  );
}
