ALTER TABLE "inventory_items" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "removed_at" timestamp;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "removal_reason" text;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "removal_notes" text;