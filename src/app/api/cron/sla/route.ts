import { runSlaReminders } from "@/lib/notify/reminders";
import { cronHandler } from "@/lib/notify/cron";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const handler = cronHandler(() => runSlaReminders());
export { handler as GET, handler as POST };
