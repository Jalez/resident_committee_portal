CREATE TABLE "inventory_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inventory_item_id" uuid NOT NULL,
	"quantity_change" integer NOT NULL,
	"reason" text NOT NULL,
	"notes" text,
	"date" timestamp DEFAULT now() NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" DROP COLUMN "value";--> statement-breakpoint
ALTER TABLE "inventory_items" DROP COLUMN "removed_at";--> statement-breakpoint
ALTER TABLE "inventory_items" DROP COLUMN "removal_reason";--> statement-breakpoint
ALTER TABLE "inventory_items" DROP COLUMN "removal_notes";