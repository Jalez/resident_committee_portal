-- Migration: Add receipts table
-- Creates a receipts table to store receipt metadata and links to purchases (reimbursement requests)
-- Receipt files are stored in blob storage (Vercel Blob/Google Drive)

CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"description" text,
	"url" text NOT NULL,
	"pathname" text NOT NULL,
	"purchase_id" uuid,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "receipts_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action,
	CONSTRAINT "receipts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action
);

-- Add index on purchase_id for efficient lookups
CREATE INDEX "receipts_purchase_id_idx" ON "receipts"("purchase_id");

-- Add index on created_by for efficient lookups
CREATE INDEX "receipts_created_by_idx" ON "receipts"("created_by");
