import { sendDailyReport } from "@/lib/notify/daily";
import { cronHandler } from "@/lib/notify/cron";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const handler = cronHandler(() => sendDailyReport());
export { handler as GET, handler as POST };
