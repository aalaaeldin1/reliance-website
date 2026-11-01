import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { listings } from "@/db/schema";
import { exportCalendar } from "@/lib/ical";

// Calendar export for Airbnb / Booking.com: /api/ical/<token>.ics
export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const l = await db.query.listings.findFirst({ where: eq(listings.icalToken, token.replace(/\.ics$/, "")) });
  if (!l) return new Response("Not found", { status: 404 });
  return new Response(await exportCalendar(l.id), { headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "no-store" } });
}
