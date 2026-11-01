import Link from "next/link";
import { notFound } from "next/navigation";
import { and, count, eq, inArray, lt, or } from "drizzle-orm";
import { requireStaff } from "@/lib/auth";
import { getDict, isLocale, type Locale } from "@/lib/i18n";
import { db } from "@/lib/db";
import { cases, fraudFlags, hostProfiles, listings, payments, payouts, refunds, users } from "@/db/schema";
import { tickIfDue } from "@/lib/jobs";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const l = locale as Locale;
  const cur = await requireStaff(l);
  const t = getDict(l);
  await tickIfDue();
  const c = async (q: Promise<{ n: number }[]>) => (await q)[0].n;
  const [approvals, guestIds, hostKyc, pay, due, ref, open, flags] = await Promise.all([
    c(db.select({ n: count() }).from(listings).where(or(eq(listings.status, "pending"), eq(listings.hasPendingEdits, true)))),
    c(db.select({ n: count() }).from(users).where(eq(users.idStatus, "pending"))),
    c(db.select({ n: count() }).from(hostProfiles).where(eq(hostProfiles.kycStatus, "pending"))),
    c(db.select({ n: count() }).from(payments).where(eq(payments.status, "submitted"))),
    c(db.select({ n: count() }).from(payouts).where(and(eq(payouts.status, "scheduled"), lt(payouts.dueAt, new Date())))),
    c(db.select({ n: count() }).from(refunds).where(eq(refunds.status, "pending"))),
    c(db.select({ n: count() }).from(cases).where(inArray(cases.status, ["open", "in_progress"]))),
    c(db.select({ n: count() }).from(fraudFlags).where(eq(fraudFlags.resolved, false))),
  ]);
  const role = cur.user.staffRole;
  const nav: [string, string, number, boolean][] = [
    ["", t.admin.nav.overview, 0, true],
    ["approvals", t.admin.nav.approvals, approvals, role !== "finance"],
    ["kyc", t.admin.nav.kyc, guestIds + hostKyc, role !== "finance"],
    ["payments", t.admin.nav.payments, pay, role !== "verifier"],
    ["payouts", t.admin.nav.payouts, due, role !== "verifier"],
    ["refunds", t.admin.nav.refunds, ref, role !== "verifier"],
    ["cases", t.admin.nav.cases, open, true],
    ["listings", t.admin.nav.listings, 0, true],
    ["bookings", t.admin.nav.bookings, 0, true],
    ["demand", t.admin.nav.demand, 0, true],
    ["flags", t.admin.nav.flags, flags, role !== "finance"],
    ["users", t.admin.nav.users, 0, role === "super_admin"],
    ["audit", t.admin.nav.audit, 0, role === "super_admin"],
    ["settings", t.admin.nav.settings, 0, role === "super_admin"],
  ];
  return (
    <div className="wrap grid gap-6 py-6 lg:grid-cols-[200px_1fr]">
      <nav className="flex gap-1 overflow-x-auto pb-1 lg:sticky lg:top-24 lg:flex-col lg:self-start" aria-label={t.admin.title}>
        <div className="eyebrow mb-2 hidden px-3 lg:block">{t.admin.title}</div>
        {nav.filter((n) => n[3]).map(([k, label, n]) => (
          <Link key={k} href={`/${l}/admin${k ? "/" + k : ""}`} className="flex items-center justify-between gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm text-muted hover:bg-mist hover:text-ink">
            {label}{n > 0 && <span className="rounded-full bg-gold-500 px-1.5 text-[11px] font-bold text-navy-950">{n}</span>}
          </Link>
        ))}
      </nav>
      <div className="min-w-0 space-y-6">{children}</div>
    </div>
  );
}
