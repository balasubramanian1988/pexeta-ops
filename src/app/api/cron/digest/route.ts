import { sendDigests } from "@/lib/notify/digest";
import { cronHandler } from "@/lib/notify/cron";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const handler = cronHandler(() => sendDigests());
export { handler as GET, handler as POST };
