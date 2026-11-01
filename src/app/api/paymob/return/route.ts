import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { payments } from "@/db/schema";
import { verifyHmac } from "@/lib/paymob";

// Where Paymob sends the guest's browser after checkout. The webhook confirms the payment; this only routes the guest back.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = Object.fromEntries(url.searchParams);
  const ok = verifyHmac(q, q.hmac ?? "", true);
  const p = q.order ? await db.query.payments.findFirst({ where: eq(payments.paymobOrderId, q.order) }) : undefined;
  const app = process.env.APP_URL ?? url.origin;
  if (!p) return Response.redirect(`${app}/en/trips`, 303);
  const flag = ok && q.success === "true" ? "" : "?error=state";
  return Response.redirect(`${app}/en/trips/${p.bookingId}${flag}`, 303);
}
