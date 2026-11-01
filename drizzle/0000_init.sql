CREATE TYPE "public"."booking_status" AS ENUM('requested', 'declined', 'expired', 'awaiting_payment', 'payment_review', 'confirmed', 'in_stay', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."cancellation_policy" AS ENUM('flexible', 'moderate', 'firm');--> statement-breakpoint
CREATE TYPE "public"."case_priority" AS ENUM('normal', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."case_status" AS ENUM('open', 'in_progress', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."doc_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."host_type" AS ENUM('owner', 'tenant', 'manager');--> statement-breakpoint
CREATE TYPE "public"."id_status" AS ENUM('none', 'pending', 'verified', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."kyc_status" AS ENUM('not_started', 'pending', 'verified', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."language" AS ENUM('en', 'ar');--> statement-breakpoint
CREATE TYPE "public"."listing_status" AS ENUM('draft', 'pending', 'changes_requested', 'live', 'paused', 'suspended', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('paymob', 'instapay', 'bank_transfer');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'submitted', 'confirmed', 'rejected', 'failed');--> statement-breakpoint
CREATE TYPE "public"."payout_status" AS ENUM('scheduled', 'held', 'sent');--> statement-breakpoint
CREATE TYPE "public"."refund_status" AS ENUM('pending', 'sent');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('none', 'verifier', 'finance', 'super_admin');--> statement-breakpoint
CREATE TABLE "areas" (
	"id" text PRIMARY KEY NOT NULL,
	"name_en" text NOT NULL,
	"name_ar" text NOT NULL,
	"governorate" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" text PRIMARY KEY NOT NULL,
	"reference" text NOT NULL,
	"listing_id" text NOT NULL,
	"guest_id" text NOT NULL,
	"check_in" date NOT NULL,
	"check_out" date NOT NULL,
	"nights" integer NOT NULL,
	"guests" integer NOT NULL,
	"adult_guests" jsonb,
	"message" text,
	"base_amount" integer NOT NULL,
	"cleaning_fee" integer DEFAULT 0 NOT NULL,
	"guest_fee" integer NOT NULL,
	"host_fee" integer NOT NULL,
	"total" integer NOT NULL,
	"price_note" text,
	"status" "booking_status" DEFAULT 'requested' NOT NULL,
	"cancellation_policy" "cancellation_policy" NOT NULL,
	"expires_at" timestamp with time zone,
	"decline_reason" text,
	"cancelled_by" text,
	"cancelled_at" timestamp with time zone,
	"sample" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "calendar_days" (
	"listing_id" text NOT NULL,
	"date" date NOT NULL,
	"available" boolean DEFAULT true NOT NULL,
	"price_override" integer,
	"source" text DEFAULT 'host' NOT NULL,
	CONSTRAINT "calendar_days_listing_id_date_pk" PRIMARY KEY("listing_id","date")
);
--> statement-breakpoint
CREATE TABLE "cases" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text,
	"opened_by_id" text NOT NULL,
	"category" text NOT NULL,
	"priority" "case_priority" DEFAULT 'normal' NOT NULL,
	"owner_id" text,
	"status" "case_status" DEFAULT 'open' NOT NULL,
	"details" text NOT NULL,
	"resolution" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fraud_flags" (
	"id" text PRIMARY KEY NOT NULL,
	"listing_id" text,
	"booking_id" text,
	"kind" text NOT NULL,
	"detail" text NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "host_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"host_type" "host_type" NOT NULL,
	"display_name" text NOT NULL,
	"payout_method" text NOT NULL,
	"payout_account_enc" text NOT NULL,
	"agreement_accepted_at" timestamp with time zone NOT NULL,
	"kyc_status" "kyc_status" DEFAULT 'pending' NOT NULL,
	"kyc_reason" text,
	"video_call_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kyc_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"doc_type" text NOT NULL,
	"file_key" text NOT NULL,
	"status" "doc_status" DEFAULT 'pending' NOT NULL,
	"reason" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listings" (
	"id" text PRIMARY KEY NOT NULL,
	"host_id" text NOT NULL,
	"area_id" text NOT NULL,
	"type" text DEFAULT 'apartment' NOT NULL,
	"title_en" text DEFAULT '' NOT NULL,
	"title_ar" text DEFAULT '' NOT NULL,
	"description_en" text DEFAULT '' NOT NULL,
	"description_ar" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"floor" text,
	"lat" double precision,
	"lng" double precision,
	"bedrooms" integer DEFAULT 1 NOT NULL,
	"beds" integer DEFAULT 1 NOT NULL,
	"baths" integer DEFAULT 1 NOT NULL,
	"max_guests" integer DEFAULT 2 NOT NULL,
	"size_m2" integer,
	"amenities" text[] DEFAULT '{}' NOT NULL,
	"house_rules" text DEFAULT '' NOT NULL,
	"check_in_time" text DEFAULT '15:00' NOT NULL,
	"check_out_time" text DEFAULT '12:00' NOT NULL,
	"instant_book" boolean DEFAULT false NOT NULL,
	"cancellation_policy" "cancellation_policy" DEFAULT 'moderate' NOT NULL,
	"status" "listing_status" DEFAULT 'draft' NOT NULL,
	"has_pending_edits" boolean DEFAULT false NOT NULL,
	"pending_snapshot" jsonb,
	"last_verified_at" timestamp with time zone,
	"ical_import_url" text,
	"ical_token" text NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"rating_avg" double precision,
	"rating_count" integer DEFAULT 0 NOT NULL,
	"sample" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	CONSTRAINT "listings_ical_token_unique" UNIQUE("ical_token")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"sender_id" text NOT NULL,
	"body" text NOT NULL,
	"flagged" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"channel" text NOT NULL,
	"to" text NOT NULL,
	"template" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"method" "payment_method" NOT NULL,
	"amount" integer NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"proof_file_key" text,
	"external_reference" text,
	"paymob_intention_id" text,
	"paymob_order_id" text,
	"paymob_txn_id" text,
	"confirmed_by" text,
	"confirmed_at" timestamp with time zone,
	"reject_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"amount" integer NOT NULL,
	"method" text NOT NULL,
	"status" "payout_status" DEFAULT 'scheduled' NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"transfer_reference" text,
	"sent_by" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payouts_booking_id_unique" UNIQUE("booking_id")
);
--> statement-breakpoint
CREATE TABLE "photos" (
	"id" text PRIMARY KEY NOT NULL,
	"listing_id" text NOT NULL,
	"file_key" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"phash" text NOT NULL,
	"pending" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_plans" (
	"listing_id" text PRIMARY KEY NOT NULL,
	"nightly" integer NOT NULL,
	"weekend" integer,
	"weekly_discount" integer DEFAULT 0 NOT NULL,
	"monthly" integer,
	"cleaning_fee" integer DEFAULT 0 NOT NULL,
	"min_nights" integer DEFAULT 1 NOT NULL,
	"max_nights" integer DEFAULT 365 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"amount" integer NOT NULL,
	"reason" text NOT NULL,
	"override" boolean DEFAULT false NOT NULL,
	"status" "refund_status" DEFAULT 'pending' NOT NULL,
	"transfer_reference" text,
	"sent_by" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"author_id" text NOT NULL,
	"subject_id" text NOT NULL,
	"role" text NOT NULL,
	"rating" integer NOT NULL,
	"comment" text NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"area_id" text,
	"check_in" date,
	"nights" integer DEFAULT 0 NOT NULL,
	"guests" integer DEFAULT 1 NOT NULL,
	"budget" integer DEFAULT 0 NOT NULL,
	"results_count" integer DEFAULT 0 NOT NULL,
	"sample" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"staff_2fa" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"name" text DEFAULT '' NOT NULL,
	"language" "language" DEFAULT 'en' NOT NULL,
	"id_status" "id_status" DEFAULT 'none' NOT NULL,
	"id_reason" text,
	"staff_role" "staff_role" DEFAULT 'none' NOT NULL,
	"totp_secret" text,
	"suspended_at" timestamp with time zone,
	"suspend_reason" text,
	"sample" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "verification_reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"listing_id" text NOT NULL,
	"reviewer_id" text NOT NULL,
	"checks" jsonb NOT NULL,
	"decision" text NOT NULL,
	"note" text,
	"reason_code" text,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_guest_id_users_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_days" ADD CONSTRAINT "calendar_days_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_opened_by_id_users_id_fk" FOREIGN KEY ("opened_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fraud_flags" ADD CONSTRAINT "fraud_flags_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "host_profiles" ADD CONSTRAINT "host_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyc_documents" ADD CONSTRAINT "kyc_documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_host_id_users_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_plans" ADD CONSTRAINT "rate_plans_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_subject_id_users_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_events" ADD CONSTRAINT "search_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_events" ADD CONSTRAINT "search_events_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_reviews" ADD CONSTRAINT "verification_reviews_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_reviews" ADD CONSTRAINT "verification_reviews_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_logs" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "booking_listing_dates_idx" ON "bookings" USING btree ("listing_id","check_in","check_out");--> statement-breakpoint
CREATE INDEX "booking_status_idx" ON "bookings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "booking_guest_idx" ON "bookings" USING btree ("guest_id");--> statement-breakpoint
CREATE INDEX "listing_area_status_idx" ON "listings" USING btree ("area_id","status");--> statement-breakpoint
CREATE INDEX "listing_host_idx" ON "listings" USING btree ("host_id");--> statement-breakpoint
CREATE INDEX "message_booking_idx" ON "messages" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "notification_template_idx" ON "notifications" USING btree ("template");--> statement-breakpoint
CREATE INDEX "otp_phone_idx" ON "otp_codes" USING btree ("phone","created_at");--> statement-breakpoint
CREATE INDEX "payment_booking_idx" ON "payments" USING btree ("booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "review_booking_author_idx" ON "reviews" USING btree ("booking_id","author_id");