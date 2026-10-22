// Server-only lookups for notifications and reports (service role; no user session needed).
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Client, Marketplace, Member, Settings, Task } from "@/lib/types";

export type Ctx = {
  team: Member[];
  byId: Record<string, Member>;
  clients: Client[];
  clientName: Record<string, string>;
  marketName: Record<string, string>;
  settings: Settings;
  vps: Member[];
  managers: Member[];
};

export async function loadCtx(): Promise<Ctx> {
  const db = createAdminClient();
  const [team, clients, markets, settings] = await Promise.all([
    db.from("team_members").select("id, email, full_name, role, active"),
    db.from("clients").select("*").order("name"),
    db.from("marketplaces").select("id, name, active, sort_order"),
    db.from("settings").select("*").eq("id", 1).single(),
  ]);
  const t = (team.data ?? []) as Member[];
  const c = (clients.data ?? []) as Client[];
  const m = (markets.data ?? []) as Marketplace[];
  const active = t.filter((x) => x.active);
  return {
    team: t,
    byId: Object.fromEntries(t.map((x) => [x.id, x])),
    clients: c,
    clientName: Object.fromEntries(c.map((x) => [x.id, x.name])),
    marketName: Object.fromEntries(m.map((x) => [x.id, x.name])),
    settings: (settings.data ?? { overdue_grace_days: 1, ack_window_hours: 24, closure_roles: ["vp"], status_notes: {} }) as Settings,
    vps: active.filter((x) => x.role === "vp"),
    managers: active.filter((x) => x.role === "vp" || x.role === "admin"),
  };
}

export async function loadTaskById(id: string): Promise<Task | null> {
  const { data } = await createAdminClient().from("tasks").select("*").eq("id", id).maybeSingle();
  return (data as Task) ?? null;
}

/** Records a reminder key; returns false if it was already sent (so each reminder goes once). */
export async function claimKey(key: string, taskId: string | null): Promise<boolean> {
  const { error } = await createAdminClient().from("notification_log").insert({ key, task_id: taskId });
  if (!error) return true;
  if (error.code !== "23505") console.error("[pexeta-ops] notification_log:", error.message);
  return false;
}
