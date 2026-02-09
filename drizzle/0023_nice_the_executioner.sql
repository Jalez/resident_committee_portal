ALTER TABLE "minutes" ALTER COLUMN "date" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "minutes" ALTER COLUMN "title" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "minutes" ALTER COLUMN "file_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "minutes" ALTER COLUMN "file_key" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "minutes" ALTER COLUMN "year" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "receipts" ALTER COLUMN "url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "receipts" ALTER COLUMN "pathname" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "minutes" ADD COLUMN "status" text DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "status" text DEFAULT 'draft' NOT NULL;