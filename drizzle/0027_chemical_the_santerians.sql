CREATE TABLE "entity_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"relation_a_type" text NOT NULL,
	"relation_a_id" text NOT NULL,
	"relation_b_type" text NOT NULL,
	"relation_b_id" text NOT NULL,
	"metadata" text,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "entity_rel_pair_unique" UNIQUE("relation_a_type","relation_a_id","relation_b_type","relation_b_id")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"location" text,
	"is_all_day" boolean DEFAULT false NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp,
	"recurrence" text,
	"reminders" text,
	"attendees" text,
	"event_type" text DEFAULT 'social' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"google_event_id" text,
	"google_calendar_id" text,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory_item_transactions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "minute_links" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "receipt_contents" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "inventory_item_transactions" CASCADE;--> statement-breakpoint
DROP TABLE "minute_links" CASCADE;--> statement-breakpoint
DROP TABLE "receipt_contents" CASCADE;--> statement-breakpoint
ALTER TABLE "receipts" DROP CONSTRAINT "receipts_purchase_id_purchases_id_fk";
--> statement-breakpoint
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_purchase_id_purchases_id_fk";
--> statement-breakpoint
ALTER TABLE "faq" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "news" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "raw_text" text;--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "store_name" text;--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "items" text;--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "total_amount" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "currency" text DEFAULT 'EUR';--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "purchase_date" timestamp;--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "ai_model" text;--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "ocr_processed" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "ocr_processed_at" timestamp;--> statement-breakpoint
ALTER TABLE "social_links" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "entity_relationships" ADD CONSTRAINT "entity_relationships_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entity_rel_relation_a_idx" ON "entity_relationships" USING btree ("relation_a_type","relation_a_id");--> statement-breakpoint
CREATE INDEX "entity_rel_relation_b_idx" ON "entity_relationships" USING btree ("relation_b_type","relation_b_id");--> statement-breakpoint
ALTER TABLE "receipts" DROP COLUMN "purchase_id";--> statement-breakpoint
ALTER TABLE "transactions" DROP COLUMN "purchase_id";