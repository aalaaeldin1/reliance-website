import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { pageCtx, type LP } from "@/lib/page";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { bookings } from "@/db/schema";
import { listingTitle } from "@/lib/listings";
import { fmtDate } from "@/lib/i18n";
import { fmtEgp } from "@/lib/money";
import { tickIfDue } from "@/lib/jobs";
import { BOOKING_TONE, Empty, PageHead, Pill } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Trips({ params }: LP) {
  const { l, t } = await pageCtx(params);
  const cur = await requireUser(l, `/${l}/trips`);
  await tickIfDue();
  const rows = await db.query.bookings.findMany({ where: eq(bookings.guestId, cur.user.id), with: { listing: { with: { area: true } } }, orderBy: desc(bookings.checkIn) });
  const groups = {
    upcoming: rows.filter((b) => ["requested", "awaiting_payment", "payment_review", "confirmed", "in_stay"].includes(b.status)),
    past: rows.filter((b) => b.status === "completed"),
    cancelled: rows.filter((b) => ["declined", "expired", "cancelled"].includes(b.status)),
  };
  return (
    <div className="wrap max-w-4xl pb-10">
      <PageHead title={t.trips.title} />
      {!rows.length && <Empty title={t.trips.none}><Link className="btn-gold mt-3" href={`/${l}/search`}>{t.trips.find}</Link></Empty>}
      {(Object.keys(groups) as (keyof typeof groups)[]).map((g) => groups[g].length > 0 && (
        <section key={g} className="mb-8">
          <h2 className="mb-3 font-display text-2xl font-semibold">{t.trips[g]}</h2>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {groups[g].map((b) => (
              <li key={b.id}><Link href={`/${l}/trips/${b.id}`} className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-mist">
                <div><div className="font-semibold">{listingTitle(b.listing, l)}</div>
                  <div className="num text-sm text-muted">{fmtDate(b.checkIn, l)} → {fmtDate(b.checkOut, l)} · {b.reference}</div></div>
                <div className="flex items-center gap-3"><span className="num text-sm">{fmtEgp(b.total, l)}</span><Pill tone={BOOKING_TONE[b.status]}>{t.trips.status[b.status]}</Pill></div>
              </Link></li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
