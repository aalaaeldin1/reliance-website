import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { payments } from "@/db/schema";
import { verifyHmac } from "@/lib/paymob";
import { confirmPayment, failPayment } from "@/lib/bookings";
import { audit } from "@/lib/audit";

// Paymob "transaction processed" callback (server to server). The HMAC proves it came from Paymob.
export async function POST(req: Request) {
  const url = new URL(req.url);
  const body = (await req.json().catch(() => null)) as { type?: string; obj?: Record<string, unknown> } | null;
  const obj = body?.obj;
  if (!obj || !verifyHmac(obj, url.searchParams.get("hmac") ?? "")) return new Response("bad hmac", { status: 401 });
  const order = obj.order as { id?: number | string } | undefined;
  const extras = (obj.payment_key_claims as { extra?: { booking_id?: string } } | undefined)?.extra;
  const orderId = order?.id ? String(order.id) : null;
  let p = orderId ? await db.query.payments.findFirst({ where: eq(payments.paymobOrderId, orderId) }) : undefined;
  if (!p && extras?.booking_id)
    p = await db.query.payments.findFirst({ where: and(eq(payments.bookingId, extras.booking_id), eq(payments.method, "paymob"), eq(payments.status, "pending")) });
  if (!p) return new Response("unknown order", { status: 200 });
  const txnId = String(obj.id ?? "");
  if (obj.success === true && obj.pending !== true) {
    if (Number(obj.amount_cents) !== p.amount) {
      await audit(null, "payment.amount_mismatch", "Payment", p.id, { expected: p.amount }, { got: obj.amount_cents });
      return new Response("amount mismatch", { status: 200 });
    }
    await db.update(payments).set({ paymobTxnId: txnId, paymobOrderId: orderId ?? p.paymobOrderId }).where(eq(payments.id, p.id));
    try { await confirmPayment(p.id, null, `paymob:${txnId}`); } catch (e) { await audit(null, "payment.confirm_failed", "Payment", p.id, undefined, { error: String(e) }); }
  } else if (obj.success === false) {
    await failPayment(p.id, txnId);
  }
  return new Response("ok");
}
