CREATE TABLE "receipt_contents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_id" uuid NOT NULL,
	"raw_text" text,
	"store_name" text,
	"items" text,
	"total_amount" numeric(10, 2),
	"currency" text DEFAULT 'EUR',
	"purchase_date" timestamp,
	"ai_model" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "receipt_contents_receipt_id_unique" UNIQUE("receipt_id")
);
--> statement-breakpoint
ALTER TABLE "receipt_contents" ADD CONSTRAINT "receipt_contents_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE cascade ON UPDATE no action;