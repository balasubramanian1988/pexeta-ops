import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getMember, isManager } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadCtx } from "@/lib/notify/context";
import { shortDate } from "@/lib/notify/dates";
import { renderClientReport, reportItems } from "@/lib/notify/weekly";
import { formatDateTime, taskRef } from "@/lib/tasks";
import { PageHeader } from "@/components/ui";
import type { Client, WeeklyReport } from "@/lib/types";
import { ReportForm } from "./ReportForm";

export const metadata: Metadata = { title: "Seller report" };

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getMember();
  if (!isManager(me.role)) redirect("/dashboard");
  const { id } = await params;
  const db = createAdminClient();
  const { data } = await db.from("weekly_reports").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const report = data as WeeklyReport;
  const [{ data: c }, ctx, items] = await Promise.all([
    db.from("clients").select("*").eq("id", report.client_id).single(),
    loadCtx(),
    reportItems(report.client_id, report.week_start, report.week_end),
  ]);
  const client = c as Client;
  const preview = renderClientReport({ client, report, items, marketName: ctx.marketName, signature: me.full_name });

  return (
    <>
      <Link href="/reports" className="text-sm text-brand hover:underline">← All seller reports</Link>
      <PageHeader
        eyebrow={`Week of ${shortDate(report.week_start)} – ${shortDate(report.week_end)}`}
        title={client.name}
        sub={
          report.status === "sent"
            ? `Sent ${report.sent_at ? formatDateTime(report.sent_at) : ""} to ${report.sent_to.join(", ")}. You can edit and send it again.`
            : "Draft. Check the tasks, add a note for the seller, then send."
        }
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <ReportForm
          report={report}
          client={client}
          items={items.map((i) => ({
            id: i.task.id,
            ref: taskRef(i.task),
            title: i.task.title,
            section: i.section,
            owner: ctx.byId[i.task.assignee_id]?.full_name ?? "",
            note: i.section === "blocked" ? i.task.blocked_reason : "",
          }))}
        />
        <section className="card overflow-hidden">
          <div className="border-b border-line bg-ice px-4 py-2.5 text-xs font-semibold text-muted">
            Preview · Subject: <span className="text-ink">{preview.subject}</span>
          </div>
          <iframe title="Email preview" srcDoc={preview.html} className="h-[900px] w-full bg-white" sandbox="" />
        </section>
      </div>
    </>
  );
}
