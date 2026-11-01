import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { notifications, users } from "@/db/schema";

// SMS and email. Providers are adapters: "console" logs and stores the message (development).
// Plug a real SMS gateway (e.g. Vodafone/Victory Link/Twilio) and SMTP in sendViaProvider().
type Lang = "en" | "ar";
type Vars = Record<string, string | number>;

const T: Record<string, { en: string; ar: string; subject?: { en: string; ar: string } }> = {
  otp: { en: "Your Reliance code is {code}. It expires in 10 minutes.", ar: "رمز Reliance الخاص بك هو {code}. صالح لمدة 10 دقائق." },
  id_verified: { en: "Your ID is verified. You can now complete bookings on Reliance.", ar: "تم التحقق من هويتك. يمكنك الآن إتمام الحجوزات على Reliance." },
  id_rejected: { en: "We couldn't verify your ID: {reason}. Please upload it again.", ar: "لم نتمكن من التحقق من هويتك: {reason}. يرجى رفعها مرة أخرى." },
  kyc_verified: { en: "You're a verified Reliance host.", ar: "أصبحت مضيفًا موثقًا على Reliance." },
  kyc_rejected: { en: "Your host verification needs attention: {reason}", ar: "التحقق من حسابك كمضيف يحتاج إلى مراجعة: {reason}" },
  request_new: { en: "New request for {listing}: {dates}, {guests} guests. Your payout {payout}. Reply within 24 h: {link}", ar: "طلب حجز جديد لـ {listing}: {dates}، {guests} ضيوف. أرباحك {payout}. يرجى الرد خلال 24 ساعة: {link}" },
  request_reminder: { en: "Your request for {listing} expires in 4 hours: {link}", ar: "ينتهي طلب الحجز لـ {listing} خلال 4 ساعات: {link}" },
  request_accepted_manual: { en: "{listing} accepted your request. Pay {total} by {deadline} (ref {ref}): {link}", ar: "وافق المضيف على طلبك لـ {listing}. ادفع {total} قبل {deadline} (المرجع {ref}): {link}" },
  request_accepted_online: { en: "{listing} accepted your request. Pay {total} online by {deadline}: {link}", ar: "وافق المضيف على طلبك لـ {listing}. ادفع {total} أونلاين قبل {deadline}: {link}" },
  request_declined: { en: "Your request for {listing} wasn't accepted. See similar homes: {link}", ar: "لم يتم قبول طلبك لـ {listing}. شاهد بيوتًا مشابهة: {link}" },
  request_expired: { en: "Your request for {listing} expired. See similar homes: {link}", ar: "انتهت صلاحية طلبك لـ {listing}. شاهد بيوتًا مشابهة: {link}" },
  payment_reminder: { en: "Reminder: pay {total} for booking {ref} within 2 hours or the dates are released: {link}", ar: "تذكير: ادفع {total} للحجز {ref} خلال ساعتين وإلا سيتم إلغاء حجز التواريخ: {link}" },
  payment_review: { en: "Payment proof received for {ref}. Confirm it in the admin console.", ar: "تم استلام إثبات الدفع للحجز {ref}." },
  booking_confirmed_guest: { en: "Booking {ref} confirmed: {listing}, {dates}. Address and host phone: {link}", ar: "تم تأكيد الحجز {ref}: {listing}، {dates}. العنوان ورقم المضيف: {link}" },
  booking_confirmed_host: { en: "Booking {ref} confirmed for {listing}, {dates}. Guest details and registration sheet: {link}", ar: "تم تأكيد الحجز {ref} لـ {listing}، {dates}. بيانات الضيوف واستمارة التسجيل: {link}" },
  payment_rejected: { en: "We couldn't match your payment for {ref}: {reason}. Please upload the proof again: {link}", ar: "لم نتمكن من مطابقة دفعتك للحجز {ref}: {reason}. يرجى رفع الإثبات مرة أخرى: {link}" },
  checkin_tomorrow_guest: { en: "Check-in tomorrow at {listing} from {time}. Details: {link}", ar: "موعد الوصول غدًا في {listing} من الساعة {time}. التفاصيل: {link}" },
  checkin_tomorrow_host: { en: "Guests arrive tomorrow at {listing}. Remember to register them: {link}", ar: "يصل الضيوف غدًا إلى {listing}. لا تنسَ تسجيلهم: {link}" },
  booking_cancelled: { en: "Booking {ref} was cancelled. Refund: {refund}, sent within 7 days.", ar: "تم إلغاء الحجز {ref}. المبلغ المسترد: {refund}، خلال 7 أيام." },
  payout_sent: { en: "Payout of {amount} sent for booking {ref} (ref {transfer}).", ar: "تم تحويل {amount} عن الحجز {ref} (مرجع التحويل {transfer})." },
  listing_approved: { en: "{listing} is now live on Reliance.", ar: "{listing} متاح الآن على Reliance." },
  listing_changes: { en: "{listing} needs changes before it goes live: {note}", ar: "{listing} يحتاج إلى تعديلات قبل نشره: {note}" },
  listing_rejected: { en: "{listing} wasn't approved: {note}", ar: "لم تتم الموافقة على {listing}: {note}" },
  listing_suspended: { en: "{listing} was suspended: {note}", ar: "تم إيقاف {listing}: {note}" },
  video_call: { en: "Your Reliance verification call is at {time}.", ar: "مكالمة التحقق من Reliance في الساعة {time}." },
  new_message: { en: "New message about booking {ref}: {link}", ar: "رسالة جديدة بخصوص الحجز {ref}: {link}" },
  review_request: { en: "How was your stay at {listing}? Leave a review: {link}", ar: "كيف كانت إقامتك في {listing}؟ اترك تقييمًا: {link}" },
  case_urgent: { en: "URGENT case on booking {ref}: {category}", ar: "بلاغ عاجل على الحجز {ref}: {category}" },
};

function render(tpl: string, vars: Vars) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}

async function sendViaProvider(channel: "sms" | "email", to: string, body: string): Promise<"sent" | "logged" | "failed"> {
  const provider = channel === "sms" ? process.env.SMS_PROVIDER : process.env.EMAIL_PROVIDER;
  if (!provider || provider === "console") {
    console.log(`[${channel}] → ${to}: ${body}`);
    return "logged";
  }
  // Generic HTTP gateway: POST {to, body} to SMS_API_URL / EMAIL_API_URL with a bearer token.
  const url = channel === "sms" ? process.env.SMS_API_URL : process.env.EMAIL_API_URL;
  const tok = channel === "sms" ? process.env.SMS_API_TOKEN : process.env.EMAIL_API_TOKEN;
  if (!url) return "failed";
  try {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${tok ?? ""}` }, body: JSON.stringify({ to, body }) });
    return r.ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}

export async function sendSms(userId: string | null, phone: string, template: keyof typeof T, vars: Vars, lang: Lang = "en") {
  const body = render(T[template][lang], vars);
  const status = await sendViaProvider("sms", phone, body);
  await db.insert(notifications).values({ userId, channel: "sms", to: phone, template, body: template === "otp" ? "[code hidden]" : body, status });
}

export async function notifyUser(userId: string, template: keyof typeof T, vars: Vars, opts: { email?: boolean } = { email: true }) {
  const u = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!u) return;
  const lang = u.language as Lang;
  await sendSms(u.id, u.phone, template, vars, lang);
  if (opts.email && u.email) {
    const body = render(T[template][lang], vars);
    const status = await sendViaProvider("email", u.email, body);
    await db.insert(notifications).values({ userId: u.id, channel: "email", to: u.email, template, body, status });
  }
}

export async function notifyStaff(roles: ("verifier" | "finance" | "super_admin")[], template: keyof typeof T, vars: Vars) {
  const staff = await db.select().from(users).where(inArray(users.staffRole, [...roles, "super_admin"]));
  for (const s of staff) await notifyUser(s.id, template, vars, { email: true });
}
