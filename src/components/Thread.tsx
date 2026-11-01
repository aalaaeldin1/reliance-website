import { messageAction } from "@/app/actions/guest";
import type { Dict, Locale } from "@/lib/i18n";
import { fmtDateTime } from "@/lib/i18n";

export function Thread({ l, t, bookingId, me, items, back }: { l: Locale; t: Dict; bookingId: string; me: string; back: string; items: { id: string; senderId: string; body: string; createdAt: Date; flagged: boolean }[] }) {
  return (
    <section id="messages" className="space-y-3">
      <h2 className="font-display text-2xl font-semibold">{t.trips.messages}</h2>
      <p className="text-xs text-muted">{t.trips.maskedNote}</p>
      <ul className="space-y-2">
        {items.map((m) => (
          <li key={m.id} className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${m.senderId === me ? "ms-auto bg-navy-800 text-mist" : "bg-mist"}`}>
            <p className="whitespace-pre-line" dir="auto">{m.body}</p>
            <span className={`mt-0.5 block text-[10px] ${m.senderId === me ? "text-mist/60" : "text-muted"}`}>{fmtDateTime(m.createdAt, l)}</span>
          </li>
        ))}
      </ul>
      <form action={messageAction} className="flex gap-2">
        <input type="hidden" name="locale" value={l} /><input type="hidden" name="bookingId" value={bookingId} /><input type="hidden" name="back" value={back} />
        <input name="body" className="input" placeholder={t.trips.messagePlaceholder} aria-label={t.trips.messagePlaceholder} maxLength={2000} required dir="auto" />
        <button className="btn-navy">{t.trips.send}</button>
      </form>
    </section>
  );
}
