-- Mail drafts (unsent compose)

CREATE TABLE "mail_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"to_json" text NOT NULL,
	"cc_json" text,
	"bcc_json" text,
	"subject" text,
	"body" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
