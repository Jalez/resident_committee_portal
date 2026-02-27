ALTER TABLE "committee_mail_threads" ADD COLUMN "slug" text;--> statement-breakpoint
UPDATE "committee_mail_threads" SET "slug" = gen_random_uuid()::text WHERE "slug" IS NULL;--> statement-breakpoint
ALTER TABLE "committee_mail_threads" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "committee_mail_threads" ADD CONSTRAINT "committee_mail_threads_slug_unique" UNIQUE("slug");