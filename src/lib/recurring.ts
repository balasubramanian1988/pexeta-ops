// Recurring tasks: each morning, create today's task for every rule that's due today.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncTaskCalendar } from "@/lib/calendar-sync";
import { notifyTaskEvent } from "@/lib/notify/events";
import { addDays, istDate } from "@/lib/notify/dates";

export type Frequency = "daily" | "weekly" | "monthly";

export type RecurringRule = {
  id: string;
  title: string;
  description: string;
  client_id: string | null;
  marketplace_id: string | null;
  assignee_id: string;
  created_by: string;
  priority: "low" | "medium" | "high" | "urgent";
  frequency: Frequency;
  weekday: number | null;
  month_day: number | null;
  due_in_days: number;
  client_visible: boolean;
  client_title: string;
  active: boolean;
  last_created_on: string | null;
  created_at: string;
};

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** ISO weekday of a YYYY-MM-DD date: 1 = Monday … 7 = Sunday. */
function isoWeekday(date: string) {
  const d = new Date(date + "T00:00:00Z").getUTCDay();
  return d === 0 ? 7 : d;
}

/** Does this rule create a task on `date`? Daily rules skip Sundays. */
export function runsOn(r: Pick<RecurringRule, "frequency" | "weekday" | "month_day">, date: string) {
  if (r.frequency === "daily") return isoWeekday(date) !== 7;
  if (r.frequency === "weekly") return isoWeekday(date) === (r.weekday ?? 1);
  return Number(date.slice(8, 10)) === (r.month_day ?? 1);
}

/** The next date (from `from`, inclusive) this rule will create a task. */
export function nextRun(r: Pick<RecurringRule, "frequency" | "weekday" | "month_day">, from: string) {
  for (let i = 0; i < 62; i++) {
    const d = addDays(from, i);
    if (runsOn(r, d)) return d;
  }
  return from;
}

export function scheduleLabel(r: Pick<RecurringRule, "frequency" | "weekday" | "month_day">) {
  if (r.frequency === "daily") return "Every day (Mon–Sat)";
  if (r.frequency === "weekly") return `Every ${WEEKDAYS[(r.weekday ?? 1) - 1]}`;
  const d = r.month_day ?? 1;
  const suffix = d === 1 || d === 21 ? "st" : d === 2 || d === 22 ? "nd" : d === 3 || d === 23 ? "rd" : "th";
  return `Monthly on the ${d}${suffix}`;
}

/** Creates one task from a rule for `date`. Returns the new task id. */
export async function createFromRule(r: RecurringRule, date: string): Promise<string | null> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("tasks")
    .insert({
      title: r.title,
      description: r.description,
      client_id: r.client_id,
      marketplace_id: r.marketplace_id,
      assignee_id: r.assignee_id,
      created_by: r.created_by,
      priority: r.priority,
      due_date: addDays(date, r.due_in_days),
      client_visible: r.client_visible,
      client_title: r.client_title,
      recurring_id: r.id,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error(`[pexeta-ops] recurring task "${r.title}" failed:`, error?.message);
    return null;
  }
  await db.from("task_activity").insert({ task_id: data.id, actor_id: r.created_by, event: "created", detail: `Recurring: ${scheduleLabel(r)}` });
  await db.from("recurring_tasks").update({ last_created_on: date }).eq("id", r.id);
  await notifyTaskEvent(data.id, "created", { actorId: r.created_by });
  await syncTaskCalendar(data.id);
  return data.id;
}

export async function runRecurring(): Promise<{ date: string; created: number; rules: number }> {
  const today = istDate();
  const { data, error } = await createAdminClient().from("recurring_tasks").select("*").eq("active", true);
  if (error) throw new Error(error.message);
  const rules = (data ?? []) as RecurringRule[];
  let created = 0;
  for (const r of rules) {
    if (r.last_created_on === today || !runsOn(r, today)) continue;
    if (await createFromRule(r, today)) created++;
  }
  return { date: today, created, rules: rules.length };
}
