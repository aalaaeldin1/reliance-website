# Reliance — verified home rentals in Cairo & Giza

A bilingual (Arabic / English) rental marketplace. Guests search and book verified homes; hosts list homes and get paid 24 hours after check-in; the Reliance team verifies every host and home, confirms payments, pays hosts and watches the business from an admin console.

This codebase covers **Phase 1 + Phase 2** of the product plan.

| Area | What's included |
| --- | --- |
| Guests | Search by area, dates, guests and budget (list + map) · listing page with fair-price marker · phone OTP sign-in · ID upload · request to book / instant book · online payment (Paymob) or InstaPay / bank transfer with receipt upload · trips, voucher, cancellation with refund preview · messaging (contact details masked until confirmed) · two-way reviews · report a problem |
| Hosts | Host profile (owner / tenant / manager) with encrypted payout account · KYC documents per host type · verification video-call booking · listing wizard with suggested price · photos (5–30, ≥1200 px, auto WebP) · calendar (block, open, special prices) · iCal import/export (Airbnb, Booking.com) · accept / decline / cancel · guest registration sheet · earnings and payouts |
| Admin | Two-factor sign-in (TOTP) · roles: Verifier, Finance, Super admin · approvals queue with checklist, duplicate-address and duplicate-photo flags, 6-month re-checks · identity checks (hosts and guests) · payment confirmation · payouts · refunds (with overrides) · cases · listings / bookings / users · guests & demand dashboard · fraud flags (incl. "pay me on WhatsApp/InstaPay" messages) · audit log · CSV exports · remove sample data |
| Platform | Next.js 16 · PostgreSQL · Drizzle ORM · Arabic RTL · 7% guest fee + 5% host fee · scheduled jobs (expiries, reminders, payouts, reviews, iCal) · SMS/email adapters |

Odoo (invoicing, CRM, helpdesk) is connected in a later phase. Until then, **Admin → Settings → Exports** gives the accountant CSV files of bookings, payments, payouts and refunds.

---

## 1. Run it on your computer

You need **Node.js 22** and **PostgreSQL 16**.

```bash
# 1. Install packages
npm install

# 2. Create the database (psql or pgAdmin)
#    CREATE USER reliance WITH PASSWORD 'reliance' CREATEDB;
#    CREATE DATABASE reliance OWNER reliance;

# 3. Settings
cp .env.example .env          # Windows: copy .env.example .env
#    then set SESSION_SECRET and ENCRYPTION_KEY (see comments in the file)

# 4. Create the tables, then load sample data
npm run db:migrate
npm run db:seed               # creates the 12 areas, a super admin and SAMPLE homes/bookings/searches

# 5. Start
npm run dev                   # http://localhost:3000
```

**Signing in during development:** `SMS_PROVIDER="console"` shows the one-time code on the sign-in screen (and prints it in the terminal). The seed creates a super admin with phone `+201000000000` (change with `SEED_ADMIN_PHONE` before seeding). On first visit to **/admin** you set up two-factor with Google or Microsoft Authenticator.

**Sample data** is marked "Sample" everywhere. Remove it before launch: **Admin → Settings → Remove sample data**.

### Useful commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build && npm start` | Production build and server |
| `npm test` | Unit tests (pricing, refunds, masking, two-factor, translations) |
| `npm run typecheck` | TypeScript check |
| `npm run db:generate` | Create a migration after changing `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations |
| `npm run cron` | Calls the scheduled-jobs endpoint every 5 minutes (development) |

---

## 2. Payments

`PAYMENTS_MODE` in `.env`:

| Mode | Use | Behaviour |
| --- | --- | --- |
| `manual` | Phase 1 pilot | Guest pays by InstaPay or bank transfer and uploads the receipt. Finance matches it with the statement and confirms in **Admin → Payments**. |
| `paymob` | Phase 2 / live | "Pay online" opens Paymob Unified Checkout (cards, wallets, InstaPay, Fawry). Paymob's callback confirms the booking. Manual payment stays available as a fallback. |
| `simulate` | Development only | "Simulate successful payment" confirms instantly. Disabled when `NODE_ENV=production`. |

**Going live with Paymob**
1. Get your secret key, public key, HMAC secret and integration IDs from the Paymob dashboard.
2. Fill `PAYMOB_*` in `.env` and set `PAYMENTS_MODE="paymob"`.
3. In Paymob, set the **transaction processed callback** to `https://YOUR-DOMAIN/api/paymob/webhook` and the **response callback** to `https://YOUR-DOMAIN/api/paymob/return`.
4. Test with Paymob test cards. Check the field names in `src/lib/paymob.ts` against Paymob's current docs.

The webhook verifies Paymob's HMAC and the amount before confirming. Money flow: guest pays Reliance → booking confirmed → payout scheduled 24 h after check-in → Finance sends it and records the transfer reference (**Admin → Payouts**). An open case holds the payout automatically.

---

## 3. Scheduled jobs

`GET /api/cron/tick` with header `Authorization: Bearer $CRON_SECRET`, every 5 minutes. It expires unanswered requests (24 h) and unpaid bookings (12 h), sends reminders, moves stays to "in stay" / "completed", holds or releases payouts, publishes reviews and syncs iCal calendars. Busy pages also run it at most once a minute, so a small deployment works without a cron.

---

## 4. Going to production — checklist

- [ ] Real secrets in `.env` (`SESSION_SECRET`, `ENCRYPTION_KEY`, `CRON_SECRET`). Back up `ENCRYPTION_KEY`: without it payout accounts can't be read.
- [ ] HTTPS domain; set `APP_URL`.
- [ ] SMS provider: set `SMS_PROVIDER`, `SMS_API_URL`, `SMS_API_TOKEN`, or adapt `sendViaProvider()` in `src/lib/notify.ts` (Egyptian SMS gateways and WhatsApp Business API usually need a registered sender name).
- [ ] File storage: uploads go to `UPLOAD_DIR` on disk. For several servers, replace `putFile` / `getFile` in `src/lib/storage.ts` with S3-compatible storage. Back up the `uploads` folder: it holds ID documents.
- [ ] Map tiles: the map uses OpenStreetMap tiles, fine for development only. Use a commercial tile provider in production (`src/components/MapView.tsx`).
- [ ] Legal: terms, privacy and host agreement in `src/app/[locale]/legal` are drafts for an Egyptian lawyer. Also confirm guest registration duties, VAT on fees, tourism licensing and data protection (Law 151 of 2020).
- [ ] Run `npm run db:migrate` on the server, create staff accounts (sign in once, then a super admin sets the role in **Admin → Users & staff**).
- [ ] Remove sample data.

---

## 5. Where things are

```
src/
  app/[locale]/           pages (en + ar): home, search, listings, trips, account, host, admin, legal
  app/actions/            server actions: auth, guest, host, admin
  app/api/                paymob webhook & return, cron, iCal export, private files, CSV exports
  app/files/              public listing photos
  components/             UI (header, cards, booking widget, forms, charts, map)
  db/schema.ts            database tables (Drizzle)
  lib/                    business logic
    bookings.ts           booking state machine, availability lock, payments, cancellation
    pricing.ts            nightly/weekend/weekly/monthly pricing, fees, fair-price, suggestions
    cancellation.ts       refund rules (flexible / moderate / firm / 28+ nights / 48 h grace)
    auth.ts, totp.ts      OTP sign-in, sessions, staff two-factor
    jobs.ts               scheduled transitions
    ical.ts, fraud.ts, masking.ts, storage.ts, notify.ts, paymob.ts, metrics.ts, i18n.ts
drizzle/                  SQL migrations
scripts/seed.ts           sample data
tests/                    unit tests
```

**Money** is stored as integer piastres (E£1 = 100). **Fees** come from `GUEST_FEE_BPS` and `HOST_FEE_BPS` (700 = 7%). **Translations** are in `src/lib/i18n.ts`; a test fails if a key is missing in either language.

**Booking states:** requested → awaiting payment → payment review (manual only) → confirmed → in stay → completed, with declined / expired / cancelled exits. Two guests can never hold the same nights: availability is checked under a per-listing PostgreSQL advisory lock.

---

## 6. Not built yet (later phases)

Odoo integration (invoices, VAT, CRM, helpdesk) · Paymob automatic payouts (disbursement API) · mobile apps · smart pricing · online monthly leases · wishlists and price alerts · host referral links · multi-unit manager accounts · promoted listings · pay-later (valU, Tabby).
