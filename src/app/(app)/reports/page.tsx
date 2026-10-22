import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getMember, isManager } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/tasks";
import { shortDate } from "@/lib/notify/dates";
import { Empty, PageHeader } from "@/components/ui";
import type { WeeklyReport } from "@/lib/types";
import { RunJobButton } from "./RunJob";

export const metadata: Metadata = { title: "Seller reports" };

type Row = WeeklyReport & { clients: { name: string; contact_emails: string[] } | null };

export default async function ReportsPage() {
  const me = await getMember();
  if (!isManager(me.role)) redirect("/dashboard");
  const { data } = await createAdminClient()
    .from("weekly_reports")
    .select("*, clients(name, contact_emails)")
    .order("week_start", { ascending: false })
    .limit(300);
  const rows = (data ?? []) as Row[];
  const weeks = [...new Set(rows.map((r) => r.week_start))];

  return (
    <>
      <PageHeader
        eyebrow="Weekly"
        title="Seller reports"
        sub="Drafted every Monday at 9 am for the previous week. Review, edit and send each one to the seller."
        action={<RunJobButton job="weekly" label="Draft last week's reports now" />}
      />
      {rows.length === 0 && (
        <div className="card">
          <Empty>No reports yet. Drafts appear here every Monday, for each account that had work in the previous week.</Empty>
        </div>
      )}
      <div className="space-y-6">
        {weeks.map((w) => {
          const list = rows.filter((r) => r.week_start === w);
          const pending = list.filter((r) => r.status === "draft").length;
          return (
            <section key={w} className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-line bg-ice px-5 py-3">
                <h2 className="text-sm font-bold text-navy">
                  Week of {shortDate(w)} – {shortDate(list[0].week_end)}
                </h2>
                <span className="text-xs text-muted">{pending ? `${pending} to review` : "All sent"}</span>
              </div>
              <div className="divide-y divide-line">
                {list.map((r) => (
                  <Link key={r.id} href={`/reports/${r.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-ice">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-ink">{r.clients?.name ?? "Client"}</div>
                      <div className="truncate text-xs text-muted">
                        {r.status === "sent"
                          ? `Sent ${r.sent_at ? formatDateTime(r.sent_at) : ""} to ${r.sent_to.join(", ")}`
                          : r.clients?.contact_emails?.length
                            ? `To ${r.clients.contact_emails.join(", ")}`
                            : "No seller email saved yet"}
                      </div>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${
                        r.status === "sent" ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-amber-50 text-amber-900 ring-amber-300"
                      }`}
                    >
                      {r.status === "sent" ? "Sent" : "Draft"}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
