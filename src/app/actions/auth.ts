"use server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, sessions } from "@/db/schema";
import { checkOtp, endSession, getCurrent, issueOtp, normalizePhone, startSession } from "@/lib/auth";
import { verifyTotp } from "@/lib/totp";
import { audit } from "@/lib/audit";

export type OtpState = { step: "phone" | "code" | "name"; phone?: string; error?: string; devCode?: string };

const safeNext = (n: unknown, locale: string) => (typeof n === "string" && n.startsWith(`/${locale}`) && !n.startsWith("//") ? n : `/${locale}`);

export async function otpAction(prev: OtpState, form: FormData): Promise<OtpState> {
  const locale = String(form.get("locale") ?? "en");
  const next = safeNext(form.get("next"), locale);
  if (prev.step === "phone" || form.get("restart")) {
    if (form.get("restart")) return { step: "phone" };
    const phone = normalizePhone(String(form.get("phone") ?? ""));
    if (!phone) return { step: "phone", error: "badPhone" };
    const r = await issueOtp(phone);
    if (!r.ok) return { step: "phone", error: "rate" };
    return { step: "code", phone, devCode: r.devCode };
  }
  if (prev.step === "code") {
    const phone = prev.phone!;
    if (!(await checkOtp(phone, String(form.get("code") ?? "")))) return { ...prev, error: "badCode" };
    let user = await db.query.users.findFirst({ where: eq(users.phone, phone) });
    if (!user) [user] = await db.insert(users).values({ phone, language: locale === "ar" ? "ar" : "en" }).returning();
    if (user.suspendedAt) return { step: "phone", error: "badCode" };
    await startSession(user.id);
    await audit(user.id, "auth.sign_in", "User", user.id);
    if (!user.name) return { step: "name", phone };
    redirect(next);
  }
  // step: name
  const cur = await getCurrent();
  const name = String(form.get("name") ?? "").trim().slice(0, 120);
  if (!cur || name.length < 2) return { ...prev, error: "badCode" };
  await db.update(users).set({ name }).where(eq(users.id, cur.user.id));
  redirect(next);
}

export async function signOutAction(form: FormData) {
  await endSession();
  redirect(`/${String(form.get("locale") ?? "en")}`);
}

export async function staffTotpAction(_: { error?: string }, form: FormData): Promise<{ error?: string }> {
  const locale = String(form.get("locale") ?? "en");
  const cur = await getCurrent();
  if (!cur || cur.user.staffRole === "none") redirect(`/${locale}`);
  const code = String(form.get("code") ?? "");
  const pendingSecret = String(form.get("secret") ?? "");
  const secret = cur.user.totpSecret ?? pendingSecret;
  if (!secret || !verifyTotp(secret, code)) return { error: "badTotp" };
  if (!cur.user.totpSecret) await db.update(users).set({ totpSecret: pendingSecret }).where(eq(users.id, cur.user.id));
  await db.update(sessions).set({ staff2fa: true }).where(eq(sessions.id, cur.sessionId));
  await audit(cur.user.id, "auth.staff_2fa", "User", cur.user.id);
  redirect(`/${locale}/admin`);
}

export async function setLanguageCookie(locale: "en" | "ar") {
  (await cookies()).set("rs_lang", locale, { path: "/", maxAge: 31_536_000 });
}
