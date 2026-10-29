import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { canAssign, getMember } from "@/lib/auth";
import { getLookups } from "@/lib/data";
import { todayIST } from "@/lib/tasks";
import { PageHeader } from "@/components/ui";
import NewTaskForm from "./NewTaskForm";

export const metadata: Metadata = { title: "New task" };

export default async function NewTaskPage() {
  const me = await getMember();
  if (!canAssign(me.role)) redirect("/my-work");
  const lookups = await getLookups();
  return (
    <>
      <PageHeader eyebrow="Assign work" title="New task" sub="Every task needs an owner, a priority and a due date." />
      <NewTaskForm
        team={lookups.team.filter((m) => m.active)}
        clients={lookups.clients.filter((c) => c.active)}
        marketplaces={lookups.marketplaces.filter((m) => m.active)}
        today={todayIST()}
      />
    </>
  );
}
