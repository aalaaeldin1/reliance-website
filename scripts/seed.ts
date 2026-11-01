// Seeds areas, a super-admin, and clearly marked SAMPLE hosts, homes, bookings and searches.
// Run: npm run db:seed   (remove samples later from Admin → Settings → Sample data)
import { db } from "../src/lib/db";
import { areas, bookings, hostProfiles, listings, payments, payouts, ratePlans, searchEvents, users, verificationReviews } from "../src/db/schema";
import { AREAS } from "../src/lib/areas";
import { encrypt } from "../src/lib/crypto";
import { quoteStay } from "../src/lib/pricing";
import { eq } from "drizzle-orm";

let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
const DAY = 86_400_000;
const today = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
const d = (n: number) => new Date(today.getTime() + n * DAY);

const HOMES = [
  ["zamalek", "Nile-view 2BR by Cairo Tower", "شقة بإطلالة على النيل بجوار برج القاهرة", "apartment", 2, 2, 4, 140, 5200, 120000, ["wifi", "ac", "kitchen", "elevator", "nile_view", "balcony", "security", "washer"], true, 4.91, 64],
  ["zamalek", "Art-deco studio on Abou El Feda", "ستوديو آرت ديكو في أبو الفدا", "studio", 0, 1, 2, 55, 3100, 68000, ["wifi", "ac", "kitchen", "elevator", "nile_view", "workspace"], true, 4.84, 38],
  ["zamalek", "Family 3BR near Gezira Club", "شقة عائلية 3 غرف بجوار نادي الجزيرة", "apartment", 3, 2, 6, 210, 6800, 150000, ["wifi", "ac", "kitchen", "washer", "elevator", "family_friendly", "generator", "security"], false, 4.88, 22],
  ["downtown", "Khedivial loft off Talaat Harb", "لوفت خديوي بجوار طلعت حرب", "apartment", 1, 1, 3, 95, 2100, 48000, ["wifi", "ac", "kitchen", "balcony", "workspace"], true, 4.62, 51],
  ["downtown", "Budget studio by Tahrir", "ستوديو اقتصادي بجوار التحرير", "studio", 0, 1, 2, 40, 1350, 30000, ["wifi", "ac", "elevator"], true, 4.41, 77],
  ["garden-city", "Garden City 2BR with Nile balcony", "شقة غرفتين في جاردن سيتي ببلكونة على النيل", "apartment", 2, 2, 4, 160, 4300, 95000, ["wifi", "ac", "kitchen", "nile_view", "balcony", "security", "washer"], false, 4.79, 19],
  ["maadi", "Leafy Degla 3BR with garden", "شقة 3 غرف بحديقة في دجلة", "apartment", 3, 2, 6, 220, 3900, 85000, ["wifi", "ac", "kitchen", "washer", "parking", "family_friendly", "pets_allowed", "generator"], false, 4.86, 31],
  ["maadi", "Corniche Maadi 2BR, river view", "شقة غرفتين على كورنيش المعادي", "apartment", 2, 1, 4, 130, 3400, 76000, ["wifi", "ac", "kitchen", "nile_view", "elevator", "gym"], true, 4.7, 26],
  ["heliopolis", "Korba heritage 2BR", "شقة تراثية في الكوربة", "apartment", 2, 1, 4, 125, 2400, 52000, ["wifi", "ac", "kitchen", "balcony", "washer"], true, 4.67, 29],
  ["nasr-city", "Practical 2BR near City Stars", "شقة عملية بجوار سيتي ستارز", "apartment", 2, 1, 5, 120, 1800, 40000, ["wifi", "ac", "kitchen", "elevator", "parking"], true, 4.52, 44],
  ["new-cairo", "Fifth Settlement compound 3BR", "شقة 3 غرف في كمبوند بالتجمع الخامس", "apartment", 3, 3, 6, 190, 3600, 80000, ["wifi", "ac", "kitchen", "pool", "parking", "security", "gym", "family_friendly"], false, 4.81, 17],
  ["new-cairo", "Duplex with roof terrace", "دوبلكس بروف في التجمع", "duplex", 3, 3, 7, 260, 4800, 105000, ["wifi", "ac", "kitchen", "pool", "parking", "balcony", "security"], false, 4.9, 12],
  ["dokki", "Dokki 2BR near Cairo University", "شقة غرفتين بالدقي بجوار جامعة القاهرة", "apartment", 2, 1, 4, 115, 1900, 42000, ["wifi", "ac", "kitchen", "elevator", "workspace"], true, 4.58, 36],
  ["mohandessin", "Family 3BR off Gameat El Dowal", "شقة عائلية بجوار جامعة الدول", "apartment", 3, 2, 6, 180, 2900, 62000, ["wifi", "ac", "kitchen", "washer", "elevator", "family_friendly", "generator"], false, 4.64, 21],
  ["pyramids", "Pyramids-view rooftop apartment", "شقة بروف بإطلالة على الأهرامات", "apartment", 2, 2, 4, 120, 3200, null, ["wifi", "ac", "kitchen", "pyramids_view", "balcony"], true, 4.93, 88],
  ["pyramids", "Nazlet El Semman guest studio", "ستوديو في نزلة السمان", "studio", 0, 1, 2, 45, 1600, null, ["wifi", "ac", "pyramids_view"], true, 4.72, 103],
  ["sheikh-zayed", "Villa with private pool", "فيلا بحمام سباحة خاص", "villa", 4, 4, 9, 420, 9500, 210000, ["wifi", "ac", "kitchen", "pool", "parking", "security", "family_friendly", "generator", "washer"], false, 4.95, 14],
  ["sheikh-zayed", "Zayed compound 2BR near Arkan", "شقة غرفتين في كمبوند بجوار أركان", "apartment", 2, 2, 4, 135, 3000, 65000, ["wifi", "ac", "kitchen", "pool", "parking", "security"], true, 4.76, 23],
  ["october", "6th of October 2BR near Mall of Egypt", "شقة غرفتين بأكتوبر بجوار مول مصر", "apartment", 2, 1, 4, 110, 2200, 46000, ["wifi", "ac", "kitchen", "parking", "pool"], true, 4.6, 9],
] as const;

async function main() {
  await db.insert(areas).values([...AREAS]).onConflictDoNothing();

  const adminPhone = process.env.SEED_ADMIN_PHONE ?? "+201000000000";
  const existingAdmin = await db.query.users.findFirst({ where: eq(users.phone, adminPhone) });
  if (!existingAdmin) await db.insert(users).values({ phone: adminPhone, name: "Reliance Admin", staffRole: "super_admin", idStatus: "verified" });
  else await db.update(users).set({ staffRole: "super_admin" }).where(eq(users.id, existingAdmin.id));

  const already = await db.query.listings.findFirst({ where: eq(listings.sample, true) });
  if (already) { console.log("Sample data already present; skipping."); return; }

  const hosts = ["Nile Residence", "Gezira Homes", "Downtown Lofts", "Maadi Green Stays", "Heliopolis Living", "Fifth Settlement Suites", "West Bank Rentals", "Pyramids Gate Stays", "Zayed Villas", "October Keys"];
  const hostIds: string[] = [];
  for (const [i, name] of hosts.entries()) {
    const [u] = await db.insert(users).values({ phone: `+2010900000${String(i).padStart(2, "0")}`, name, idStatus: "verified", sample: true }).returning();
    await db.insert(hostProfiles).values({ userId: u.id, hostType: i % 3 === 2 ? "manager" : "owner", displayName: name, payoutMethod: "bank", payoutAccountEnc: encrypt("EG0000000000000000000000000" + i), agreementAcceptedAt: new Date(), kycStatus: "verified" });
    hostIds.push(u.id);
  }
  const guestIds: string[] = [];
  for (let i = 0; i < 25; i++) {
    const [u] = await db.insert(users).values({ phone: `+2011100000${String(i).padStart(2, "0")}`, name: `Sample Guest ${i + 1}`, idStatus: "verified", sample: true }).returning();
    guestIds.push(u.id);
  }
  const [admin] = await db.select().from(users).where(eq(users.phone, adminPhone));

  const live: { id: string; rate: { nightly: number; monthly: number | null }; areaId: string; hostId: string; policy: "moderate" }[] = [];
  for (const [i, h] of HOMES.entries()) {
    const [areaId, titleEn, titleAr, type, br, ba, g, size, nightly, monthly, amen, instant, rating, rc] = h;
    const area = AREAS.find((a) => a.id === areaId)!;
    const status = i === HOMES.length - 1 ? "pending" : "live";
    const [row] = await db.insert(listings).values({
      hostId: hostIds[i % hostIds.length], areaId, type, titleEn, titleAr,
      descriptionEn: `${titleEn}. A verified Reliance home in ${area.nameEn}, close to shops, cafés and transport.`,
      descriptionAr: `${titleAr}. بيت موثّق من Reliance في ${area.nameAr}، قريب من المحلات والمقاهي والمواصلات.`,
      address: `Sample address ${i + 1}, ${area.nameEn}`, floor: String(1 + (i % 9)),
      lat: area.lat + (rnd() - 0.5) * 0.02, lng: area.lng + (rnd() - 0.5) * 0.02,
      bedrooms: br, beds: Math.max(1, br), baths: ba, maxGuests: g, sizeM2: size, amenities: [...amen], instantBook: instant,
      houseRules: "Valid ID for every adult guest at check-in. No parties or events. No smoking indoors.",
      status, lastVerifiedAt: status === "live" ? d(-30 - i) : null, submittedAt: d(-40 - i), ratingAvg: rating, ratingCount: rc, sample: true,
      createdAt: d(-60 - i),
    }).returning();
    await db.insert(ratePlans).values({ listingId: row.id, nightly: nightly * 100, monthly: monthly ? monthly * 100 : null, weeklyDiscount: pick([0, 5, 10]), minNights: monthly ? 2 : 1 });
    if (status === "live") {
      await db.insert(verificationReviews).values({ listingId: row.id, reviewerId: admin.id, checks: { identity: true, ownership: true, photos: true, address: true, video: true, price: true }, decision: "approved", decidedAt: d(-30 - i) });
      live.push({ id: row.id, rate: { nightly: nightly * 100, monthly: monthly ? monthly * 100 : null }, areaId, hostId: row.hostId, policy: "moderate" });
    }
  }

  // Bookings across the last 12 weeks and the next few weeks.
  const taken: Record<string, [number, number][]> = {};
  let n = 0;
  for (let k = 0; k < 70 && n < 45; k++) {
    const h = pick(live);
    const created = -Math.floor(rnd() * 84);
    const ci = created + 2 + Math.floor(rnd() * 28);
    const nights = pick([2, 3, 3, 4, 5, 7, 7, 10, 14]);
    if ((taken[h.id] ?? []).some(([a, b]) => ci < b && ci + nights > a)) continue;
    (taken[h.id] ??= []).push([ci, ci + nights]);
    const q = quoteStay(h.rate, d(ci), d(ci + nights), { guestBps: 700, hostBps: 500 });
    const status = ci + nights <= 0 ? "completed" : ci <= 0 ? "in_stay" : rnd() < 0.85 ? "confirmed" : "requested";
    const pay = pick(["paymob", "paymob", "instapay", "bank_transfer"] as const);
    const [b] = await db.insert(bookings).values({
      reference: `RS-S${String(++n).padStart(4, "0")}`, listingId: h.id, guestId: pick(guestIds), checkIn: d(ci), checkOut: d(ci + nights), nights, guests: 2,
      adultGuests: [{ name: "Sample Guest", idNumber: "00000000000000", nationality: "Egyptian" }],
      baseAmount: q.baseAmount, cleaningFee: q.cleaningFee, guestFee: q.guestFee, hostFee: q.hostFee, total: q.total, priceNote: q.note,
      status, cancellationPolicy: "moderate", expiresAt: status === "requested" ? new Date(Date.now() + 20 * 3_600_000) : null, sample: true, createdAt: d(created),
    }).returning();
    if (status !== "requested") {
      await db.insert(payments).values({ bookingId: b.id, method: pay, amount: q.total, status: "confirmed", confirmedAt: d(created), externalReference: "SAMPLE" });
      const due = new Date(d(ci + 1).getTime() + 13 * 3_600_000);
      await db.insert(payouts).values({ bookingId: b.id, amount: q.hostPayout, method: "bank", dueAt: due, status: due < new Date() && status === "completed" ? "sent" : "scheduled", sentAt: status === "completed" ? due : null, transferReference: status === "completed" ? "SAMPLE" : null });
    }
  }

  // Guest searches (demand data).
  const weights: [string | null, number][] = [["zamalek", 14], ["downtown", 9], ["garden-city", 4], ["maadi", 8], ["heliopolis", 5], ["nasr-city", 4], ["new-cairo", 10], ["dokki", 4], ["mohandessin", 5], ["pyramids", 16], ["sheikh-zayed", 9], ["october", 7], [null, 12]];
  const bag = weights.flatMap(([a, w]) => Array(w).fill(a) as (string | null)[]);
  const rows = Array.from({ length: 160 }, () => ({
    userId: pick(guestIds), areaId: pick(bag), nights: pick([0, 2, 3, 3, 4, 5, 7, 7, 14, 30]), guests: pick([1, 2, 2, 2, 3, 4, 4, 5, 6, 8]),
    budget: pick([0, 0, 1500, 2000, 2500, 2500, 3000, 3000, 3500, 4000, 5000, 6000]) * 100, resultsCount: 5, sample: true,
    createdAt: new Date(Date.now() - Math.floor(rnd() * 60) * DAY),
  }));
  await db.insert(searchEvents).values(rows);
  console.log(`Seeded ${HOMES.length} homes, ${n} bookings, ${rows.length} searches. Super admin phone: ${adminPhone}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
