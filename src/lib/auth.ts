import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { randomInt } from "node:crypto";
import { db } from "./db";
import { sha256, safeEqual } from "./crypto";
import { and, count, desc, eq, gt } from "drizzle-orm";
import { otpCodes, sessions, users, type StaffRole, type User } from "@/db/schema";

const COOKIE = "rs_sid";
const SESSION_DAYS = 30;
const secret = () => new TextEncoder().encode(process.env.SESSION_SECRET ?? "");

export type Current = { user: User; sessionId: string; staff2fa: boolean } | null;

export async function getCurrent(): Promise<Current> {
  const jar = await cookies();
  const tok = jar.get(COOKIE)?.value;
  if (!tok) return null;
  try {
    const { payload } = await jwtVerify(tok, secret());
    const [row] = await db.select().from(sessions).innerJoin(users, eq(users.id, sessions.userId)).where(eq(sessions.id, String(payload.sid))).limit(1);
    if (!row || row.sessions.expiresAt < new Date() || row.users.suspendedAt) return null;
    return { user: row.users, sessionId: row.sessions.id, staff2fa: row.sessions.staff2fa };
  } catch {
    return null;
  }
}

export async function startSession(userId: string) {
  const [s] = await db.insert(sessions).values({ userId, expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000) }).returning();
  const tok = await new SignJWT({ sid: s.id })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());
  (await cookies()).set(COOKIE, tok, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
}

export async function endSession() {
  const cur = await getCurrent();
  if (cur) await db.delete(sessions).where(eq(sessions.id, cur.sessionId));
  (await cookies()).delete(COOKIE);
}

export async function requireUser(locale: string, next?: string) {
  const cur = await getCurrent();
  if (!cur) redirect(`/${locale}/sign-in${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  return cur;
}

const RANK: Record<StaffRole, number> = { none: 0, verifier: 1, finance: 1, super_admin: 2 };

/** Staff pages: role check plus two-factor, when the staff member has set it up. */
export async function requireStaff(locale: string, roles: StaffRole[] = ["verifier", "finance", "super_admin"]) {
  const cur = await requireUser(locale, `/${locale}/admin`);
  const role = cur.user.staffRole;
  if (RANK[role] === 0) redirect(`/${locale}`);
  if (role !== "super_admin" && !roles.includes(role)) redirect(`/${locale}/admin?denied=1`);
  if (!cur.user.totpSecret || !cur.staff2fa) redirect(`/${locale}/staff/two-factor`);
  return cur;
}

export const canDo = (role: StaffRole, need: StaffRole[]) => role === "super_admin" || need.includes(role);

/* ---------- One-time codes ---------- */

export function normalizePhone(raw: string): string | null {
  const latin = raw.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[\s\-()]/g, "");
  if (/^01[0125]\d{8}$/.test(latin)) return "+20" + latin.slice(1); // Egyptian mobile
  if (/^\+?\d{8,15}$/.test(latin)) return latin.startsWith("+") ? latin : "+" + latin;
  return null;
}

export async function issueOtp(phone: string): Promise<{ ok: true; devCode?: string } | { ok: false; error: "rate" }> {
  const hourAgo = new Date(Date.now() - 3_600_000);
  const [{ n: recent }] = await db.select({ n: count() }).from(otpCodes).where(and(eq(otpCodes.phone, phone), gt(otpCodes.createdAt, hourAgo)));
  if (recent >= 5) return { ok: false, error: "rate" };
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.insert(otpCodes).values({ phone, codeHash: sha256(phone + code + process.env.SESSION_SECRET), expiresAt: new Date(Date.now() + 10 * 60_000) });
  const { sendSms } = await import("./notify");
  await sendSms(null, phone, "otp", { code });
  return { ok: true, devCode: process.env.SMS_PROVIDER === "console" ? code : undefined };
}

export async function checkOtp(phone: string, code: string): Promise<boolean> {
  const [otp] = await db.select().from(otpCodes).where(eq(otpCodes.phone, phone)).orderBy(desc(otpCodes.createdAt)).limit(1);
  if (!otp || otp.expiresAt < new Date() || otp.attempts >= 5) return false;
  const ok = safeEqual(otp.codeHash, sha256(phone + code.trim() + process.env.SESSION_SECRET));
  await db.update(otpCodes).set(ok ? { expiresAt: new Date(0) } : { attempts: otp.attempts + 1 }).where(eq(otpCodes.id, otp.id));
  return ok;
}

export async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}
