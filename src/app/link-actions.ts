"use server";
// Links attached to a task (Drive files, Sheets, Docs, Seller Central pages…). Anyone who can see the task can add one.
import { revalidatePath } from "next/cache";
import { getMember, isManager } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "./actions";

async function canSee(taskId: string, memberId: string, manager: boolean) {
  if (manager) return true;
  const db = createAdminClient();
  const { data: t } = await db.from("tasks").select("assignee_id, created_by").eq("id", taskId).maybeSingle();
  if (!t) return false;
  if (t.assignee_id === memberId || t.created_by === memberId) return true;
  const { data: w } = await db.from("task_watchers").select("task_id").eq("task_id", taskId).eq("member_id", memberId).maybeSingle();
  return Boolean(w);
}

export async function addTaskLink(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const me = await getMember();
  const taskId = String(fd.get("task_id") ?? "");
  let url = String(fd.get("url") ?? "").trim();
  const label = String(fd.get("label") ?? "").trim();
  if (!url) return { ok: false, error: "Paste the link." };
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    new URL(url);
  } catch {
    return { ok: false, error: "That doesn't look like a link." };
  }
  if (!(await canSee(taskId, me.id, isManager(me.role)))) return { ok: false, error: "You don't have access to this task." };
  const db = createAdminClient();
  const { error } = await db.from("task_links").insert({ task_id: taskId, url, label, added_by: me.id });
  if (error) return { ok: false, error: error.message.includes("task_links") ? "Run supabase/008_release2.sql first." : error.message };
  await db.from("task_activity").insert({ task_id: taskId, actor_id: me.id, event: "link_added", detail: label ? `${label} · ${url}` : url });
  revalidatePath(`/tasks/${taskId}`);
  return { ok: true };
}

export async function removeTaskLink(fd: FormData) {
  const me = await getMember();
  const id = String(fd.get("id") ?? "");
  const db = createAdminClient();
  const { data: link } = await db.from("task_links").select("id, task_id, added_by").eq("id", id).maybeSingle();
  if (!link) return;
  if (link.added_by !== me.id && !isManager(me.role)) return;
  await db.from("task_links").delete().eq("id", id);
  revalidatePath(`/tasks/${link.task_id}`);
}
