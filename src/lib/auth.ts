// Resolves the signed-in Google user to a Pexeta team member (or redirects).
import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "./supabase/server";
import { createAdminClient } from "./supabase/admin";
import type { Member, Role } from "./types";

export const getMember = cache(async (): Promise<Member> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email;
  if (!email) redirect("/login");

  // Look up the allowlist with the admin client so an unlisted user gets a clear message.
  const admin = createAdminClient();
  const { data: member, error } = await admin
    .from("team_members")
    .select("id, email, full_name, role, active")
    .ilike("email", email)
    .maybeSingle();
  if (error) console.error("[pexeta-ops] team_members lookup failed:", error.message, "— check SUPABASE_SERVICE_ROLE_KEY and that supabase/schema.sql has been run.");
  else if (!member) console.error(`[pexeta-ops] ${email} is not in team_members.`);
  else if (!member.active) console.error(`[pexeta-ops] ${email} is deactivated in team_members.`);
  if (!member || !member.active) redirect("/not-authorised");
  return member as Member;
});

export function isManager(role: Role) {
  return role === "vp" || role === "admin";
}

/** VP, admins and team leads can create and assign tasks. Closure stays with the roles in Settings. */
export function canAssign(role: Role) {
  return isManager(role) || role === "lead";
}

/** Reassign, change due date and edit: managers on any task, team leads on tasks they assigned. */
export function canManageTask(member: { id: string; role: Role }, task: { created_by: string }) {
  return isManager(member.role) || (member.role === "lead" && task.created_by === member.id);
}
