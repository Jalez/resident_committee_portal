CREATE TABLE "committee_mail_threads" (
	"id" text PRIMARY KEY NOT NULL,
	"subject" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mail_drafts" ADD COLUMN "thread_id" text;