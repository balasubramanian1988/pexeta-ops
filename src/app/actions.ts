"use server";
// All writes happen here. Each action re-checks the signed-in member's role and the task's state,
// then writes with the service-role client and records an activity entry.
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { getMember, isManager } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Member, Priority, Role, Settings, Status, Task } from "@/lib/types";
import { notifyTaskEvent, type TaskEvent } from "@/lib/notify/events";

/** Send notifications after the response, so a slow mail server never slows or fails an action. */
function notify(taskId: string, event: TaskEvent, actorId: string, note = "", previousAssigneeId?: string) {
  after(() => notifyTaskEvent(taskId, event, { actorId, note, previousAssigneeId }));
}

export type ActionResult = { ok: boolean; error?: string };

const PRIORITIES: Priority[] = ["low", "medium", "high", "urgent"];

function str(fd: FormData, key: string) {
  return String(fd.get(key) ?? "").trim();
}

async function loadTask(id: string): Promise<Task> {
  const { data } = await createAdminClient().from("tasks").select("*").eq("id", id).single();
  if (!data) throw new Error("Task not found");
  return data as Task;
}

async function loadSettings(): Promise<Settings> {
  const { data } = await createAdminClient().from("settings").select("*").eq("id", 1).single();
  return data as Settings;
}

async function log(taskId: string, actor: Member, event: string, detail = "") {
  await createAdminClient().from("task_activity").insert({ task_id: taskId, actor_id: actor.id, event, detail });
}

async function update(taskId: string, patch: Partial<Task>) {
  const { error } = await createAdminClient()
    .from("tasks")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", taskId);
  if (error) throw new Error(error.message);
}

function refresh(taskId?: string) {
  revalidatePath("/dashboard");
  revalidatePath("/my-work");
  revalidatePath("/tasks");
  if (taskId) revalidatePath(`/tasks/${taskId}`);
}

function canClose(role: Role, s: Settings) {
  return s.closure_roles.includes(role);
}

// ---------------- Create ----------------
export async function createTask(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const me = await getMember();
  if (!isManager(me.role)) return { ok: false, error: "Only the VP or an admin can create and assign tasks." };

  const title = str(fd, "title");
  const assignee_id = str(fd, "assignee_id");
  const due_date = str(fd, "due_date");
  const priority = str(fd, "priority") as Priority;
  if (!title) return { ok: false, error: "Add a title so the task is clear." };
  if (!assignee_id) return { ok: false, error: "Choose who owns this task." };
  if (!due_date) return { ok: false, error: "Add a due date. Every active task needs one." };
  if (!PRIORITIES.includes(priority)) return { ok: false, error: "Choose a priority." };

  const { data, error } = await createAdminClient()
    .from("tasks")
    .insert({
      title,
      description: str(fd, "description"),
      client_id: str(fd, "client_id") || null,
      marketplace_id: str(fd, "marketplace_id") || null,
      assignee_id,
      created_by: me.id,
      priority,
      due_date,
      dependency: str(fd, "dependency"),
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not create the task." };

  await log(data.id, me, "created", "");
  notify(data.id, "created", me.id);
  refresh(data.id);
  redirect(`/tasks/${data.id}`);
}

// ---------------- Lifecycle (single entry point) ----------------
export type TaskAction =
  | "acknowledge"
  | "start"
  | "progress"
  | "block"
  | "unblock"
  | "complete"
  | "close"
  | "reopen"
  | "comment"
  | "reassign"
  | "due"
  | "edit";

export async function taskAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const me = await getMember();
  const id = str(fd, "task_id");
  const action = str(fd, "action") as TaskAction;
  const note = str(fd, "note");
  let task: Task;
  try {
    task = await loadTask(id);
  } catch {
    return { ok: false, error: "Task not found." };
  }

  const s = await loadSettings();
  const manager = isManager(me.role);
  const isAssignee = task.assignee_id === me.id;
  const visible = manager || isAssignee || task.created_by === me.id;
  if (!visible) return { ok: false, error: "You don't have access to this task." };

  const now = new Date().toISOString();
  const status = task.status;
  const deny = (msg: string): ActionResult => ({ ok: false, error: msg });

  try {
    switch (action) {
      case "acknowledge": {
        if (!isAssignee) return deny("Only the task owner can acknowledge it.");
        if (status !== "assigned" && status !== "reopened") return deny("This task has already been acknowledged.");
        await update(id, { status: "acknowledged", acknowledged_at: now });
        await log(id, me, "acknowledged", note);
        notify(id, "acknowledged", me.id, note);
        break;
      }
      case "start": {
        if (!isAssignee) return deny("Only the task owner can start it.");
        if (!["assigned", "acknowledged", "reopened"].includes(status)) return deny("This task can't be started from its current state.");
        await update(id, {
          status: "in_progress",
          acknowledged_at: task.acknowledged_at && status !== "reopened" ? task.acknowledged_at : now,
        });
        await log(id, me, "started", note);
        if (status === "assigned" || status === "reopened") notify(id, "started", me.id, note);
        break;
      }
      case "progress": {
        if (!isAssignee && !manager) return deny("Only the owner can update progress.");
        const pct = Math.max(0, Math.min(100, Number(fd.get("progress") ?? task.progress)));
        if (!["acknowledged", "in_progress"].includes(status)) return deny("Start the task before updating progress.");
        await update(id, { progress: pct, status: "in_progress" as Status });
        await log(id, me, "progress", `${pct}%${note ? ` · ${note}` : ""}`);
        break;
      }
      case "block": {
        if (!isAssignee && !manager) return deny("Only the owner can mark a task blocked.");
        if (!note) return deny("Add the reason so the next move is clear.");
        if (!["acknowledged", "in_progress", "reopened", "assigned"].includes(status)) return deny("This task can't be blocked from its current state.");
        await update(id, { status: "blocked", blocked_reason: note });
        await log(id, me, "blocked", note);
        notify(id, "blocked", me.id, note);
        break;
      }
      case "unblock": {
        if (!isAssignee && !manager) return deny("Only the owner can unblock the task.");
        if (status !== "blocked") return deny("This task isn't blocked.");
        await update(id, { status: "in_progress", blocked_reason: "" });
        await log(id, me, "unblocked", note);
        notify(id, "unblocked", me.id, note);
        break;
      }
      case "complete": {
        if (!isAssignee) return deny("Only the task owner can submit it for closure.");
        if (!["acknowledged", "in_progress"].includes(status)) return deny("Start the task before submitting it.");
        await update(id, { status: "completed", completed_at: now, progress: 100 });
        await log(id, me, "completed", note);
        notify(id, "completed", me.id, note);
        break;
      }
      case "close": {
        if (!canClose(me.role, s)) return deny("Only the VP can close tasks.");
        if (status !== "completed") return deny("Only tasks awaiting closure can be closed.");
        await update(id, { status: "closed", closed_at: now });
        await log(id, me, "closed", note);
        notify(id, "closed", me.id, note);
        break;
      }
      case "reopen": {
        if (!canClose(me.role, s)) return deny("Only the VP can reopen tasks.");
        if (status !== "completed" && status !== "closed") return deny("Only completed or closed tasks can be reopened.");
        if (!note) return deny("Add feedback so the owner knows what to fix.");
        await update(id, { status: "reopened", closed_at: null, completed_at: null, assigned_at: now, acknowledged_at: null });
        await log(id, me, "reopened", note);
        notify(id, "reopened", me.id, note);
        break;
      }
      case "comment": {
        if (!note) return deny("Write a comment first.");
        await log(id, me, "comment", note);
        notify(id, "comment", me.id, note);
        await update(id, {});
        break;
      }
      case "reassign": {
        if (!manager) return deny("Only the VP or an admin can reassign.");
        const to = str(fd, "assignee_id");
        if (!to || to === task.assignee_id) return deny("Choose a different team member.");
        const { data: target } = await createAdminClient().from("team_members").select("full_name").eq("id", to).single();
        await update(id, {
          assignee_id: to,
          assigned_at: now,
          acknowledged_at: null,
          status: status === "closed" ? status : ("assigned" as Status),
        });
        await log(id, me, "reassigned", `To ${target?.full_name ?? "team member"}${note ? ` · ${note}` : ""}`);
        notify(id, "reassigned", me.id, note, task.assignee_id);
        break;
      }
      case "due": {
        if (!manager) return deny("Only the VP or an admin can change the due date.");
        const due = str(fd, "due_date");
        if (!due) return deny("Choose the new due date.");
        await update(id, { due_date: due });
        await log(id, me, "due_changed", `${task.due_date} → ${due}${note ? ` · ${note}` : ""}`);
        notify(id, "due_changed", me.id, note);
        break;
      }
      case "edit": {
        if (!manager) return deny("Only the VP or an admin can edit task details.");
        const title = str(fd, "title");
        const priority = str(fd, "priority") as Priority;
        if (!title) return deny("The title can't be empty.");
        if (!PRIORITIES.includes(priority)) return deny("Choose a priority.");
        await update(id, {
          title,
          description: str(fd, "description"),
          priority,
          client_id: str(fd, "client_id") || null,
          marketplace_id: str(fd, "marketplace_id") || null,
          dependency: str(fd, "dependency"),
        });
        await log(id, me, "edited", "");
        break;
      }
      default:
        return deny("Unknown action.");
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }

  refresh(id);
  return { ok: true };
}

// ---------------- Settings (VP / admin) ----------------
export async function saveRules(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const me = await getMember();
  if (!isManager(me.role)) return { ok: false, error: "Only the VP or an admin can change operating rules." };
  const grace = Number(fd.get("overdue_grace_days"));
  const ack = Number(fd.get("ack_window_hours"));
  const closure = fd.getAll("closure_roles").map(String).filter((r) => ["vp", "admin"].includes(r));
  if (!Number.isFinite(grace) || grace < 0 || grace > 30) return { ok: false, error: "Overdue grace must be 0–30 days." };
  if (!Number.isFinite(ack) || ack < 1 || ack > 168) return { ok: false, error: "Acknowledgement window must be 1–168 hours." };
  if (closure.length === 0) return { ok: false, error: "At least one role must be allowed to close tasks." };
  const { error } = await createAdminClient()
    .from("settings")
    .update({ overdue_grace_days: grace, ack_window_hours: ack, closure_roles: closure, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function upsertMember(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const me = await getMember();
  if (!isManager(me.role)) return { ok: false, error: "Only the VP or an admin can manage the team." };
  const email = str(fd, "email").toLowerCase();
  const full_name = str(fd, "full_name");
  const role = str(fd, "role") as Role;
  if (!email.includes("@")) return { ok: false, error: "Enter the member's Google work email." };
  if (!full_name) return { ok: false, error: "Enter the member's name." };
  if (!["vp", "admin", "member"].includes(role)) return { ok: false, error: "Choose a role." };
  if (role === "vp" && me.role !== "vp" && me.role !== "admin") return { ok: false, error: "Not allowed." };
  const { error } = await createAdminClient()
    .from("team_members")
    .upsert({ email, full_name, role, active: true }, { onConflict: "email" });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}

export async function toggleActive(fd: FormData) {
  const me = await getMember();
  if (!isManager(me.role)) return;
  const table = str(fd, "table");
  const id = str(fd, "id");
  const active = str(fd, "active") === "true";
  if (!["team_members", "clients", "marketplaces"].includes(table)) return;
  if (table === "team_members" && id === me.id) return; // can't deactivate yourself
  await createAdminClient().from(table).update({ active }).eq("id", id);
  revalidatePath("/settings");
}

export async function addListItem(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const me = await getMember();
  if (!isManager(me.role)) return { ok: false, error: "Only the VP or an admin can edit these lists." };
  const table = str(fd, "table");
  const name = str(fd, "name");
  if (!["clients", "marketplaces"].includes(table)) return { ok: false, error: "Unknown list." };
  if (!name) return { ok: false, error: "Enter a name." };
  const { error } = await createAdminClient().from(table).insert({ name });
  if (error) return { ok: false, error: error.code === "23505" ? `${name} is already on the list.` : error.message };
  revalidatePath("/settings");
  return { ok: true };
}
