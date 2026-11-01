import "server-only";
import ICAL from "ical.js";
import { and, eq, gte, inArray } from "drizzle-orm";
import { db } from "./db";
import { bookings, calendarDays, listings } from "@/db/schema";
import { HOLDING } from "./bookings";
import { addDays, dayStr, todayUtc } from "./dates";

const icsDate = (d: Date) => dayStr(d).replace(/-/g, "");

/** Export: every held booking and host-blocked night, for Airbnb / Booking.com to import. */
export async function exportCalendar(listingId: string) {
  const today = todayUtc();
  const [held, blocked] = await Promise.all([
    db.select().from(bookings).where(and(eq(bookings.listingId, listingId), inArray(bookings.status, HOLDING), gte(bookings.checkOut, today))),
    db.select().from(calendarDays).where(and(eq(calendarDays.listingId, listingId), eq(calendarDays.available, false), eq(calendarDays.source, "host"), gte(calendarDays.date, today))),
  ]);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Reliance//Stays//EN", "CALSCALE:GREGORIAN"];
  for (const b of held)
    lines.push("BEGIN:VEVENT", `UID:${b.id}@reliance`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${icsDate(b.checkIn)}`, `DTEND;VALUE=DATE:${icsDate(b.checkOut)}`, "SUMMARY:Reserved (Reliance)", "END:VEVENT");
  for (const d of blocked)
    lines.push("BEGIN:VEVENT", `UID:block-${listingId}-${dayStr(d.date)}@reliance`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${icsDate(d.date)}`, `DTEND;VALUE=DATE:${icsDate(addDays(d.date, 1))}`, "SUMMARY:Not available", "END:VEVENT");
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

/** Parse an .ics file into blocked nights ("YYYY-MM-DD"), today onwards. */
export function parseIcsToNights(ics: string, horizonDays = 365, today = todayUtc()): string[] {
  const comp = new ICAL.Component(ICAL.parse(ics));
  const out = new Set<string>();
  const end = addDays(today, horizonDays);
  for (const ev of comp.getAllSubcomponents("vevent")) {
    const e = new ICAL.Event(ev);
    const s = e.startDate, f = e.endDate;
    if (!s || !f) continue;
    let d = new Date(Date.UTC(s.year, s.month - 1, s.day));
    const stop = new Date(Date.UTC(f.year, f.month - 1, f.day));
    for (; d < stop && d < end; d = addDays(d, 1)) if (d >= today) out.add(dayStr(d));
  }
  return [...out].sort();
}

/** Import: replace this listing's iCal-sourced blocks with the remote calendar's busy nights. */
export async function importCalendar(listingId: string): Promise<{ ok: boolean; nights?: number; error?: string }> {
  const l = await db.query.listings.findFirst({ where: eq(listings.id, listingId) });
  if (!l?.icalImportUrl) return { ok: false, error: "no_url" };
  try {
    const url = new URL(l.icalImportUrl);
    if (url.protocol !== "https:") return { ok: false, error: "https_only" };
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000), redirect: "follow" });
    if (!res.ok) return { ok: false, error: `http_${res.status}` };
    const nights = parseIcsToNights((await res.text()).slice(0, 2_000_000));
    await db.transaction(async (tx) => {
      await tx.delete(calendarDays).where(and(eq(calendarDays.listingId, listingId), eq(calendarDays.source, "ical")));
      if (nights.length)
        await tx.insert(calendarDays).values(nights.map((n) => ({ listingId, date: new Date(n + "T00:00:00Z"), available: false, source: "ical" })))
          .onConflictDoUpdate({ target: [calendarDays.listingId, calendarDays.date], set: { available: false } });
    });
    return { ok: true, nights: nights.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.slice(0, 80) : "failed" };
  }
}
