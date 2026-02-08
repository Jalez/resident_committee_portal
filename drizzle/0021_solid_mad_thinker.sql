CREATE TABLE "minute_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"minute_id" uuid NOT NULL,
	"purchase_id" uuid,
	"news_id" uuid,
	"faq_id" uuid,
	"inventory_item_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "minutes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" timestamp NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"file_url" text NOT NULL,
	"file_key" text NOT NULL,
	"year" integer NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "minute_links" ADD CONSTRAINT "minute_links_minute_id_minutes_id_fk" FOREIGN KEY ("minute_id") REFERENCES "public"."minutes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "minute_links" ADD CONSTRAINT "minute_links_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "minute_links" ADD CONSTRAINT "minute_links_news_id_news_id_fk" FOREIGN KEY ("news_id") REFERENCES "public"."news"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "minute_links" ADD CONSTRAINT "minute_links_faq_id_faq_id_fk" FOREIGN KEY ("faq_id") REFERENCES "public"."faq"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "minute_links" ADD CONSTRAINT "minute_links_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "minutes" ADD CONSTRAINT "minutes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "minute_links_minute_id_idx" ON "minute_links" USING btree ("minute_id");--> statement-breakpoint
CREATE INDEX "minute_links_purchase_id_idx" ON "minute_links" USING btree ("purchase_id");--> statement-breakpoint
CREATE INDEX "minute_links_news_id_idx" ON "minute_links" USING btree ("news_id");--> statement-breakpoint
CREATE INDEX "minute_links_inventory_item_id_idx" ON "minute_links" USING btree ("inventory_item_id");