// Reliance — rental marketplace for Cairo & Giza.
// Money is integer piastres (1 EGP = 100 piastres). Timestamps are UTC. Stay dates are calendar dates.
import { randomUUID } from "node:crypto";
import { relations } from "drizzle-orm";
import {
  pgTable, pgEnum, text, integer, boolean, timestamp, date, jsonb, doublePrecision, primaryKey, index, uniqueIndex,
} from "drizzle-orm/pg-core";

const id = () => text("id").primaryKey().$defaultFn(() => randomUUID());
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const day = (name: string) => date(name, { mode: "date" });

export const language = pgEnum("language", ["en", "ar"]);
export const idStatus = pgEnum("id_status", ["none", "pending", "verified", "rejected"]);
export const staffRole = pgEnum("staff_role", ["none", "verifier", "finance", "super_admin"]);
export const hostType = pgEnum("host_type", ["owner", "tenant", "manager"]);
export const kycStatus = pgEnum("kyc_status", ["not_started", "pending", "verified", "rejected"]);
export const docStatus = pgEnum("doc_status", ["pending", "approved", "rejected"]);
export const listingStatus = pgEnum("listing_status", ["draft", "pending", "changes_requested", "live", "paused", "suspended", "rejected"]);
export const cancellationPolicy = pgEnum("cancellation_policy", ["flexible", "moderate", "firm"]);
export const bookingStatus = pgEnum("booking_status", [
  "requested", "declined", "expired", "awaiting_payment", "payment_review", "confirmed", "in_stay", "completed", "cancelled",
]);
export const paymentMethod = pgEnum("payment_method", ["paymob", "instapay", "bank_transfer"]);
export const paymentStatus = pgEnum("payment_status", ["pending", "submitted", "confirmed", "rejected", "failed"]);
export const payoutStatus = pgEnum("payout_status", ["scheduled", "held", "sent"]);
export const refundStatus = pgEnum("refund_status", ["pending", "sent"]);
export const caseStatus = pgEnum("case_status", ["open", "in_progress", "resolved"]);
export const casePriority = pgEnum("case_priority", ["normal", "urgent"]);

export const users = pgTable("users", {
  id: id(),
  phone: text("phone").notNull().unique(),
  email: text("email"),
  name: text("name").notNull().default(""),
  language: language("language").notNull().default("en"),
  idStatus: idStatus("id_status").notNull().default("none"),
  idReason: text("id_reason"),
  staffRole: staffRole("staff_role").notNull().default("none"),
  totpSecret: text("totp_secret"),
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  suspendReason: text("suspend_reason"),
  sample: boolean("sample").notNull().default(false),
  createdAt: createdAt(),
});

export const sessions = pgTable("sessions", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  staff2fa: boolean("staff_2fa").notNull().default(false),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

export const otpCodes = pgTable("otp_codes", {
  id: id(),
  phone: text("phone").notNull(),
  codeHash: text("code_hash").notNull(),
  attempts: integer("attempts").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
}, (t) => [index("otp_phone_idx").on(t.phone, t.createdAt)]);

export const hostProfiles = pgTable("host_profiles", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  hostType: hostType("host_type").notNull(),
  displayName: text("display_name").notNull(),
  payoutMethod: text("payout_method").notNull(), // bank | instapay | wallet
  payoutAccountEnc: text("payout_account_enc").notNull(), // AES-256-GCM
  agreementAcceptedAt: timestamp("agreement_accepted_at", { withTimezone: true }).notNull(),
  kycStatus: kycStatus("kyc_status").notNull().default("pending"),
  kycReason: text("kyc_reason"),
  videoCallAt: timestamp("video_call_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const kycDocuments = pgTable("kyc_documents", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  docType: text("doc_type").notNull(),
  fileKey: text("file_key").notNull(),
  status: docStatus("status").notNull().default("pending"),
  reason: text("reason"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const areas = pgTable("areas", {
  id: text("id").primaryKey(),
  nameEn: text("name_en").notNull(),
  nameAr: text("name_ar").notNull(),
  governorate: text("governorate").notNull(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
});

export const listings = pgTable("listings", {
  id: id(),
  hostId: text("host_id").notNull().references(() => users.id),
  areaId: text("area_id").notNull().references(() => areas.id),
  type: text("type").notNull().default("apartment"),
  titleEn: text("title_en").notNull().default(""),
  titleAr: text("title_ar").notNull().default(""),
  descriptionEn: text("description_en").notNull().default(""),
  descriptionAr: text("description_ar").notNull().default(""),
  address: text("address").notNull().default(""),
  floor: text("floor"),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  bedrooms: integer("bedrooms").notNull().default(1),
  beds: integer("beds").notNull().default(1),
  baths: integer("baths").notNull().default(1),
  maxGuests: integer("max_guests").notNull().default(2),
  sizeM2: integer("size_m2"),
  amenities: text("amenities").array().notNull().default([]),
  houseRules: text("house_rules").notNull().default(""),
  checkInTime: text("check_in_time").notNull().default("15:00"),
  checkOutTime: text("check_out_time").notNull().default("12:00"),
  instantBook: boolean("instant_book").notNull().default(false),
  cancellationPolicy: cancellationPolicy("cancellation_policy").notNull().default("moderate"),
  status: listingStatus("status").notNull().default("draft"),
  hasPendingEdits: boolean("has_pending_edits").notNull().default(false),
  pendingSnapshot: jsonb("pending_snapshot"),
  lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
  icalImportUrl: text("ical_import_url"),
  icalToken: text("ical_token").notNull().unique().$defaultFn(() => randomUUID().replace(/-/g, "")),
  views: integer("views").notNull().default(0),
  ratingAvg: doublePrecision("rating_avg"),
  ratingCount: integer("rating_count").notNull().default(0),
  sample: boolean("sample").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
}, (t) => [index("listing_area_status_idx").on(t.areaId, t.status), index("listing_host_idx").on(t.hostId)]);

export const photos = pgTable("photos", {
  id: id(),
  listingId: text("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  fileKey: text("file_key").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  phash: text("phash").notNull(),
  pending: boolean("pending").notNull().default(false), // added in an edit that awaits review
});

export const ratePlans = pgTable("rate_plans", {
  listingId: text("listing_id").primaryKey().references(() => listings.id, { onDelete: "cascade" }),
  nightly: integer("nightly").notNull(),
  weekend: integer("weekend"),
  weeklyDiscount: integer("weekly_discount").notNull().default(0),
  monthly: integer("monthly"),
  cleaningFee: integer("cleaning_fee").notNull().default(0),
  minNights: integer("min_nights").notNull().default(1),
  maxNights: integer("max_nights").notNull().default(365),
});

export const calendarDays = pgTable("calendar_days", {
  listingId: text("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  date: day("date").notNull(),
  available: boolean("available").notNull().default(true),
  priceOverride: integer("price_override"),
  source: text("source").notNull().default("host"), // host | ical
}, (t) => [primaryKey({ columns: [t.listingId, t.date] })]);

export const verificationReviews = pgTable("verification_reviews", {
  id: id(),
  listingId: text("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  reviewerId: text("reviewer_id").notNull().references(() => users.id),
  checks: jsonb("checks").$type<Record<string, boolean>>().notNull(),
  decision: text("decision").notNull(), // approved | changes_requested | rejected | suspended | restored
  note: text("note"),
  reasonCode: text("reason_code"),
  decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AdultGuest = { name: string; idNumber: string; nationality: string };

export const bookings = pgTable("bookings", {
  id: id(),
  reference: text("reference").notNull().unique(),
  listingId: text("listing_id").notNull().references(() => listings.id),
  guestId: text("guest_id").notNull().references(() => users.id),
  checkIn: day("check_in").notNull(),
  checkOut: day("check_out").notNull(),
  nights: integer("nights").notNull(),
  guests: integer("guests").notNull(),
  adultGuests: jsonb("adult_guests").$type<AdultGuest[]>(),
  message: text("message"),
  baseAmount: integer("base_amount").notNull(),
  cleaningFee: integer("cleaning_fee").notNull().default(0),
  guestFee: integer("guest_fee").notNull(),
  hostFee: integer("host_fee").notNull(),
  total: integer("total").notNull(),
  priceNote: text("price_note"),
  status: bookingStatus("status").notNull().default("requested"),
  cancellationPolicy: cancellationPolicy("cancellation_policy").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  declineReason: text("decline_reason"),
  cancelledBy: text("cancelled_by"),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  sample: boolean("sample").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("booking_listing_dates_idx").on(t.listingId, t.checkIn, t.checkOut), index("booking_status_idx").on(t.status), index("booking_guest_idx").on(t.guestId)]);

export const payments = pgTable("payments", {
  id: id(),
  bookingId: text("booking_id").notNull().references(() => bookings.id),
  method: paymentMethod("method").notNull(),
  amount: integer("amount").notNull(),
  status: paymentStatus("status").notNull().default("pending"),
  proofFileKey: text("proof_file_key"),
  externalReference: text("external_reference"),
  paymobIntentionId: text("paymob_intention_id"),
  paymobOrderId: text("paymob_order_id"),
  paymobTxnId: text("paymob_txn_id"),
  confirmedBy: text("confirmed_by"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  rejectReason: text("reject_reason"),
  createdAt: createdAt(),
}, (t) => [index("payment_booking_idx").on(t.bookingId)]);

export const payouts = pgTable("payouts", {
  id: id(),
  bookingId: text("booking_id").notNull().unique().references(() => bookings.id),
  amount: integer("amount").notNull(),
  method: text("method").notNull(),
  status: payoutStatus("status").notNull().default("scheduled"),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  transferReference: text("transfer_reference"),
  sentBy: text("sent_by"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const refunds = pgTable("refunds", {
  id: id(),
  bookingId: text("booking_id").notNull().references(() => bookings.id),
  amount: integer("amount").notNull(),
  reason: text("reason").notNull(),
  override: boolean("override").notNull().default(false),
  status: refundStatus("status").notNull().default("pending"),
  transferReference: text("transfer_reference"),
  sentBy: text("sent_by"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const messages = pgTable("messages", {
  id: id(),
  bookingId: text("booking_id").notNull().references(() => bookings.id, { onDelete: "cascade" }),
  senderId: text("sender_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  flagged: boolean("flagged").notNull().default(false),
  createdAt: createdAt(),
}, (t) => [index("message_booking_idx").on(t.bookingId)]);

export const reviews = pgTable("reviews", {
  id: id(),
  bookingId: text("booking_id").notNull().references(() => bookings.id),
  authorId: text("author_id").notNull().references(() => users.id),
  subjectId: text("subject_id").notNull().references(() => users.id),
  role: text("role").notNull(), // guest_to_host | host_to_guest
  rating: integer("rating").notNull(),
  comment: text("comment").notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("review_booking_author_idx").on(t.bookingId, t.authorId)]);

export const cases = pgTable("cases", {
  id: id(),
  bookingId: text("booking_id").references(() => bookings.id),
  openedById: text("opened_by_id").notNull().references(() => users.id),
  category: text("category").notNull(),
  priority: casePriority("priority").notNull().default("normal"),
  ownerId: text("owner_id"),
  status: caseStatus("status").notNull().default("open"),
  details: text("details").notNull(),
  resolution: text("resolution"),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const fraudFlags = pgTable("fraud_flags", {
  id: id(),
  listingId: text("listing_id").references(() => listings.id, { onDelete: "cascade" }),
  bookingId: text("booking_id"),
  kind: text("kind").notNull(), // duplicate_address | duplicate_photo | off_platform_payment
  detail: text("detail").notNull(),
  resolved: boolean("resolved").notNull().default(false),
  createdAt: createdAt(),
});

export const searchEvents = pgTable("search_events", {
  id: id(),
  userId: text("user_id").references(() => users.id),
  areaId: text("area_id").references(() => areas.id),
  checkIn: day("check_in"),
  nights: integer("nights").notNull().default(0),
  guests: integer("guests").notNull().default(1),
  budget: integer("budget").notNull().default(0), // piastres per night; 0 = none
  resultsCount: integer("results_count").notNull().default(0),
  sample: boolean("sample").notNull().default(false),
  createdAt: createdAt(),
});

export const notifications = pgTable("notifications", {
  id: id(),
  userId: text("user_id"),
  channel: text("channel").notNull(), // sms | email
  to: text("to").notNull(),
  template: text("template").notNull(),
  body: text("body").notNull(),
  status: text("status").notNull().default("sent"), // sent | logged | failed
  createdAt: createdAt(),
}, (t) => [index("notification_template_idx").on(t.template)]);

export const auditLogs = pgTable("audit_logs", {
  id: id(),
  actorId: text("actor_id"),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id").notNull(),
  before: jsonb("before"),
  after: jsonb("after"),
  ip: text("ip"),
  createdAt: createdAt(),
}, (t) => [index("audit_entity_idx").on(t.entity, t.entityId), index("audit_created_idx").on(t.createdAt)]);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

/* ---------- relations (for db.query.* with `with`) ---------- */
export const usersRelations = relations(users, ({ one, many }) => ({
  hostProfile: one(hostProfiles, { fields: [users.id], references: [hostProfiles.userId] }),
  documents: many(kycDocuments),
  listings: many(listings),
}));
export const hostProfilesRelations = relations(hostProfiles, ({ one }) => ({ user: one(users, { fields: [hostProfiles.userId], references: [users.id] }) }));
export const kycDocumentsRelations = relations(kycDocuments, ({ one }) => ({ user: one(users, { fields: [kycDocuments.userId], references: [users.id] }) }));
export const listingsRelations = relations(listings, ({ one, many }) => ({
  host: one(users, { fields: [listings.hostId], references: [users.id] }),
  area: one(areas, { fields: [listings.areaId], references: [areas.id] }),
  rate: one(ratePlans, { fields: [listings.id], references: [ratePlans.listingId] }),
  photos: many(photos),
  bookings: many(bookings),
  reviews: many(verificationReviews),
  flags: many(fraudFlags),
}));
export const photosRelations = relations(photos, ({ one }) => ({ listing: one(listings, { fields: [photos.listingId], references: [listings.id] }) }));
export const ratePlansRelations = relations(ratePlans, ({ one }) => ({ listing: one(listings, { fields: [ratePlans.listingId], references: [listings.id] }) }));
export const verificationReviewsRelations = relations(verificationReviews, ({ one }) => ({
  listing: one(listings, { fields: [verificationReviews.listingId], references: [listings.id] }),
  reviewer: one(users, { fields: [verificationReviews.reviewerId], references: [users.id] }),
}));
export const bookingsRelations = relations(bookings, ({ one, many }) => ({
  listing: one(listings, { fields: [bookings.listingId], references: [listings.id] }),
  guest: one(users, { fields: [bookings.guestId], references: [users.id] }),
  payments: many(payments),
  payout: one(payouts, { fields: [bookings.id], references: [payouts.bookingId] }),
  refunds: many(refunds),
  cases: many(cases),
  messages: many(messages),
  reviews: many(reviews),
}));
export const paymentsRelations = relations(payments, ({ one }) => ({ booking: one(bookings, { fields: [payments.bookingId], references: [bookings.id] }) }));
export const payoutsRelations = relations(payouts, ({ one }) => ({ booking: one(bookings, { fields: [payouts.bookingId], references: [bookings.id] }) }));
export const refundsRelations = relations(refunds, ({ one }) => ({ booking: one(bookings, { fields: [refunds.bookingId], references: [bookings.id] }) }));
export const messagesRelations = relations(messages, ({ one }) => ({
  booking: one(bookings, { fields: [messages.bookingId], references: [bookings.id] }),
  sender: one(users, { fields: [messages.senderId], references: [users.id] }),
}));
export const reviewsRelations = relations(reviews, ({ one }) => ({
  booking: one(bookings, { fields: [reviews.bookingId], references: [bookings.id] }),
  author: one(users, { fields: [reviews.authorId], references: [users.id] }),
}));
export const casesRelations = relations(cases, ({ one }) => ({
  booking: one(bookings, { fields: [cases.bookingId], references: [bookings.id] }),
  openedBy: one(users, { fields: [cases.openedById], references: [users.id] }),
}));
export const fraudFlagsRelations = relations(fraudFlags, ({ one }) => ({ listing: one(listings, { fields: [fraudFlags.listingId], references: [listings.id] }) }));

export type User = typeof users.$inferSelect;
export type Listing = typeof listings.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type BookingStatus = (typeof bookingStatus.enumValues)[number];
export type StaffRole = (typeof staffRole.enumValues)[number];
