// Read helpers. Everything here runs as the signed-in user, so row-level security applies.
import "server-only";
import { cache } from "react";
import { createClient } from "./supabase/server";
import type { Activity, Client, Marketplace, Member, Settings, Task } from "./types";

export const getSettings = cache(async (): Promise<Settings> => {
  const supabase = await createClient();
  const { data } = await supabase.from("settings").select("*").eq("id", 1).single();
  return (data ?? { overdue_grace_days: 1, ack_window_hours: 24, closure_roles: ["vp"], status_notes: {} }) as Settings;
});

export const getLookups = cache(async () => {
  const supabase = await createClient();
  const [team, clients, marketplaces] = await Promise.all([
    supabase.from("team_members").select("id, email, full_name, role, active").order("full_name"),
    supabase.from("clients").select("*").order("name"),
    supabase.from("marketplaces").select("id, name, active, sort_order").order("sort_order"),
  ]);
  const teamList = (team.data ?? []) as Member[];
  const clientList = (clients.data ?? []) as Client[];
  const marketList = (marketplaces.data ?? []) as Marketplace[];
  return {
    team: teamList,
    clients: clientList,
    marketplaces: marketList,
    memberName: Object.fromEntries(teamList.map((m) => [m.id, m.full_name])) as Record<string, string>,
    clientName: Object.fromEntries(clientList.map((c) => [c.id, c.name])) as Record<string, string>,
    marketName: Object.fromEntries(marketList.map((m) => [m.id, m.name])) as Record<string, string>,
  };
});

export const getTasks = cache(async (): Promise<Task[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("tasks").select("*").order("due_date", { ascending: true }).limit(2000);
  return (data ?? []) as Task[];
});

export async function getTask(id: string): Promise<Task | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("tasks").select("*").eq("id", id).maybeSingle();
  return (data as Task) ?? null;
}

export async function getActivity(taskId: string): Promise<Activity[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("task_activity").select("*").eq("task_id", taskId).order("created_at", { ascending: false });
  return (data ?? []) as Activity[];
}

export async function getRecentActivity(limit = 12): Promise<(Activity & { task_ref: number; task_title: string })[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("task_activity")
    .select("*, tasks(ref, title)")
    .order("created_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as (Activity & { tasks: { ref: number; title: string } | null })[]).map((a) => ({
    ...a,
    task_ref: a.tasks?.ref ?? 0,
    task_title: a.tasks?.title ?? "",
  }));
}
