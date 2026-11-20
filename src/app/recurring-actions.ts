"use server";
// Recurring task rules. VP, admins and team leads can create them; leads manage only their own.
import { revalidatePath } from "next/cache";
import { canAssign, getMember, isManager } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { istDate } from "@/lib/notify/dates";
import { createFromRule, runsOn, type Frequency, type RecurringRule } from "@/lib/recurring";
import type { ActionResult } from "./actions";

function str(fd: FormData, key: string) {
  return String(fd.get(key) ?? "").trim();
}

export async function createRecurring(_prev: ActionResult, fd: FormData): Promise<ActionResult & { message?: string }> {
  const me = await getMember();
  if (!canAssign(me.role)) return { ok: false, error: "Only the VP, an admin or a team lead can set up recurring tasks." };

  const title = str(fd, "title");
  const assignee_id = str(fd, "assignee_id");
  const priority = str(fd, "priority");
  const frequency = str(fd, "frequency") as Frequency;
  const weekday = Number(fd.get("weekday") ?? 1);
  const month_day = Number(fd.get("month_day") ?? 1);
  const due_in_days = Number(fd.get("due_in_days") ?? 0);

  if (!title) return { ok: false, error: "Add a title." };
  if (!assignee_id) return { ok: false, error: "Choose who owns it." };
  if (!["low", "medium", "high", "urgent"].includes(priority)) return { ok: false, error: "Choose a priority." };
  if (!["daily", "weekly", "monthly"].includes(frequency)) return { ok: false, error: "Choose how often it repeats." };
  if (frequency === "weekly" && !(weekday >= 1 && weekday <= 7)) return { ok: false, error: "Choose a day of the week." };
  if (frequency === "monthly" && !(month_day >= 1 && month_day <= 28)) return { ok: false, error: "Choose a day between 1 and 28." };
  if (!(due_in_days >= 0 && due_in_days <= 30)) return { ok: false, error: "Due within 0–30 days." };

  const { data, error } = await createAdminClient()
    .from("recurring_tasks")
    .insert({
      title,
      description: str(fd, "description"),
      client_id: str(fd, "client_id") || null,
      marketplace_id: str(fd, "marketplace_id") || null,
      assignee_id,
      created_by: me.id,
      priority,
      frequency,
      weekday: frequency === "weekly" ? weekday : null,
      month_day: frequency === "monthly" ? month_day : null,
      due_in_days,
      client_visible: fd.get("client_visible") === "on",
      client_title: str(fd, "client_title"),
    })
    .select("*")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not save. Has supabase/006_release1.sql been run?" };

  // If it's due today and today's run has already happened, create today's task now.
  let message = "Saved. The next task will be created automatically.";
  const today = istDate();
  if (fd.get("create_today") === "on" && runsOn(data as RecurringRule, today)) {
    const id = await createFromRule(data as RecurringRule, today);
    if (id) message = "Saved, and today's task has been created.";
  }
  revalidatePath("/recurring");
  revalidatePath("/tasks");
  return { ok: true, message };
}

async function ownRule(id: string) {
  const me = await getMember();
  const { data } = await createAdminClient().from("recurring_tasks").select("id, created_by").eq("id", id).maybeSingle();
  if (!data) return null;
  if (!isManager(me.role) && !(me.role === "lead" && data.created_by === me.id)) return null;
  return data;
}

export async function toggleRecurring(fd: FormData) {
  const id = str(fd, "id");
  if (!(await ownRule(id))) return;
  await createAdminClient().from("recurring_tasks").update({ active: str(fd, "active") === "true" }).eq("id", id);
  revalidatePath("/recurring");
}

export async function deleteRecurring(fd: FormData) {
  const id = str(fd, "id");
  if (!(await ownRule(id))) return;
  // Tasks already created stay; they just lose the link to the rule.
  await createAdminClient().from("recurring_tasks").delete().eq("id", id);
  revalidatePath("/recurring");
}
