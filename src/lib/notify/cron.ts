import "server-only";
import { NextResponse, type NextRequest } from "next/server";

/** Scheduled jobs call these routes with "Authorization: Bearer <CRON_SECRET>". */
export function cronHandler(job: () => Promise<unknown>) {
  return async function handler(req: NextRequest) {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorised" }, { status: 401 });
    }
    try {
      const result = await job();
      console.log(`[pexeta-ops] cron ${req.nextUrl.pathname}:`, JSON.stringify(result));
      return NextResponse.json({ ok: true, result });
    } catch (err) {
      console.error(`[pexeta-ops] cron ${req.nextUrl.pathname} failed:`, err);
      return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
    }
  };
}
