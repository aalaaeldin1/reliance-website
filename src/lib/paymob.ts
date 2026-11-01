import "server-only";
import { createHmac } from "node:crypto";
import { safeEqual } from "./crypto";

// Paymob Unified Checkout (Intention API). Verify field names against Paymob's current docs with your sandbox keys.
const BASE = () => process.env.PAYMOB_BASE_URL ?? "https://accept.paymob.com";
export const paymentsMode = () => (process.env.PAYMENTS_MODE ?? "manual") as "manual" | "paymob" | "simulate";

export async function createIntention(input: {
  amountPiastres: number;
  reference: string;
  bookingId: string;
  guest: { name: string; phone: string; email?: string | null };
  itemName: string;
}) {
  const [first, ...rest] = (input.guest.name || "Guest").split(" ");
  const res = await fetch(`${BASE()}/v1/intention/`, {
    method: "POST",
    headers: { Authorization: `Token ${process.env.PAYMOB_SECRET_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: input.amountPiastres,
      currency: "EGP",
      payment_methods: (process.env.PAYMOB_INTEGRATION_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean).map((s) => (/^\d+$/.test(s) ? Number(s) : s)),
      items: [{ name: input.itemName.slice(0, 50), amount: input.amountPiastres, description: `Booking ${input.reference}`, quantity: 1 }],
      billing_data: {
        first_name: first || "Guest",
        last_name: rest.join(" ") || "Reliance",
        phone_number: input.guest.phone,
        email: input.guest.email || "guest@reliance.invalid",
        apartment: "NA", street: "NA", building: "NA", floor: "NA", city: "Cairo", country: "EG",
      },
      special_reference: `${input.reference}-${Date.now()}`,
      extras: { booking_id: input.bookingId },
      notification_url: `${process.env.APP_URL}/api/paymob/webhook`,
      redirection_url: `${process.env.APP_URL}/api/paymob/return`,
    }),
  });
  if (!res.ok) throw new Error(`Paymob intention failed: ${res.status} ${await res.text()}`);
  const j = (await res.json()) as { id: string; client_secret: string; intention_order_id?: number };
  return {
    intentionId: String(j.id),
    orderId: j.intention_order_id ? String(j.intention_order_id) : null,
    checkoutUrl: `${BASE()}/unifiedcheckout/?publicKey=${process.env.PAYMOB_PUBLIC_KEY}&clientSecret=${j.client_secret}`,
  };
}

// Fields of the "transaction processed" callback, in the order Paymob concatenates them for the HMAC.
const HMAC_FIELDS = [
  "amount_cents", "created_at", "currency", "error_occured", "has_parent_transaction", "id", "integration_id",
  "is_3d_secure", "is_auth", "is_capture", "is_refunded", "is_standalone_payment", "is_voided", "order.id", "owner",
  "pending", "source_data.pan", "source_data.sub_type", "source_data.type", "success",
] as const;

function pick(obj: Record<string, unknown>, path: string): string {
  const v = path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);
  return v === undefined || v === null ? "" : String(v);
}

/** Works for both the POST callback body (`obj`) and the GET redirect query (flat keys like "order", "source_data.pan"). */
export function verifyHmac(source: Record<string, unknown>, hmac: string, flat = false): boolean {
  const secret = process.env.PAYMOB_HMAC_SECRET;
  if (!secret || !hmac) return false;
  const str = HMAC_FIELDS.map((f) => (flat ? String(source[f === "order.id" ? "order" : f] ?? "") : pick(source, f))).join("");
  const calc = createHmac("sha512", secret).update(str).digest("hex");
  return safeEqual(calc, hmac.toLowerCase());
}

export function hmacFor(source: Record<string, unknown>) {
  const str = HMAC_FIELDS.map((f) => pick(source, f)).join("");
  return createHmac("sha512", process.env.PAYMOB_HMAC_SECRET ?? "").update(str).digest("hex");
}
