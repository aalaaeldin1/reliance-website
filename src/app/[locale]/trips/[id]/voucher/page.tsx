import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { pageCtx } from "@/lib/page";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { bookings, hostProfiles } from "@/db/schema";
import { listingTitle } from "@/lib/listings";
import { areaName, fmtDate } from "@/lib/i18n";
import { fmtEgp } from "@/lib/money";
import { Logo } from "@/components/Logo";
import { PrintButton } from "@/components/PrintButton";

export default async function Voucher({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { l, t } = await pageCtx(params);
  const { id } = await params;
  const cur = await requireUser(l);
  const b = await db.query.bookings.findFirst({ where: eq(bookings.id, id), with: { listing: { with: { area: true } } } });
  if (!b || (b.guestId !== cur.user.id && b.listing.hostId !== cur.user.id) || !["confirmed", "in_stay", "completed"].includes(b.status)) notFound();
  const host = await db.query.hostProfiles.findFirst({ where: eq(hostProfiles.userId, b.listing.hostId) });
  return (
    <div className="wrap max-w-2xl py-10">
      <div className="card space-y-4 p-8">
        <div className="flex items-center justify-between rounded-lg bg-navy-950 p-4"><Logo sub="BOOKING VOUCHER" /><span className="font-mono text-gold-200">{b.reference}</span></div>
        <h1 className="font-display text-3xl font-semibold">{listingTitle(b.listing, l)}</h1>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-muted">{t.trips.address}</dt><dd>{b.listing.address}, {areaName(b.listing.area, l)}</dd>
          <dt className="text-muted">{t.trips.checkIn}</dt><dd>{fmtDate(b.checkIn, l)} · {b.listing.checkInTime}</dd>
          <dt className="text-muted">{t.trips.checkOut}</dt><dd>{fmtDate(b.checkOut, l)} · {b.listing.checkOutTime}</dd>
          <dt className="text-muted">{t.trips.adults}</dt><dd>{(b.adultGuests ?? []).map((a) => a.name).join(", ")}</dd>
          <dt className="text-muted">{t.common.total}</dt><dd className="num">{fmtEgp(b.total, l)} · {t.trips.paid}</dd>
          <dt className="text-muted">{l === "ar" ? "المضيف" : "Host"}</dt><dd>{host?.displayName}</dd>
        </dl>
        <PrintButton label={t.host.print} />
      </div>
    </div>
  );
}
