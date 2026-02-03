-- Committee mail messages (sent and received at committee mailbox)

CREATE TABLE "committee_mail_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"direction" text NOT NULL,
	"from_address" text NOT NULL,
	"from_name" text,
	"to_json" text NOT NULL,
	"cc_json" text,
	"bcc_json" text,
	"subject" text NOT NULL,
	"body_html" text NOT NULL,
	"body_text" text,
	"date" timestamp NOT NULL,
	"message_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
