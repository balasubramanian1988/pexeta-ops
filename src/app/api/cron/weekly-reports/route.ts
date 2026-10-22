import { generateWeeklyDrafts } from "@/lib/notify/weekly";
import { cronHandler } from "@/lib/notify/cron";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const handler = cronHandler(() => generateWeeklyDrafts());
export { handler as GET, handler as POST };
