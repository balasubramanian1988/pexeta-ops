import { runRecurring } from "@/lib/recurring";
import { cronHandler } from "@/lib/notify/cron";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const handler = cronHandler(() => runRecurring());
export { handler as GET, handler as POST };
