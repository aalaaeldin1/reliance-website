import { runTick } from "@/lib/jobs";
import { safeEqual } from "@/lib/crypto";

// Call every 5 minutes: curl -H "authorization: Bearer $CRON_SECRET" https://your-site/api/cron/tick
export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!process.env.CRON_SECRET || !safeEqual(auth, `Bearer ${process.env.CRON_SECRET}`)) return new Response("Unauthorized", { status: 401 });
  const log = await runTick();
  return Response.json({ ok: true, log });
}
