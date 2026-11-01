// Dates are handled as UTC calendar days ("YYYY-MM-DD").
export const DAY = 86_400_000;

export function parseDay(s: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error("Invalid date");
  const d = new Date(s + "T00:00:00Z");
  if (isNaN(d.getTime())) throw new Error("Invalid date");
  return d;
}
export const dayStr = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
export const nightsBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY);
export function todayUtc(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
/** Each night of a stay, as the date the night starts. */
export function eachNight(checkIn: Date, checkOut: Date): Date[] {
  const out: Date[] = [];
  for (let d = checkIn; d < checkOut; d = addDays(d, 1)) out.push(d);
  return out;
}
/** Thursday and Friday nights are the Egyptian weekend nights. */
export const isWeekendNight = (d: Date) => d.getUTCDay() === 4 || d.getUTCDay() === 5;
