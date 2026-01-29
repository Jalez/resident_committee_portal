-- Add messages table for in-app notifications
-- This enables users to receive notifications when their reimbursement requests are approved or declined

CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"related_purchase_id" uuid,
	"read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- Add foreign key constraints
ALTER TABLE "messages" ADD CONSTRAINT "messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "messages" ADD CONSTRAINT "messages_related_purchase_id_purchases_id_fk" FOREIGN KEY ("related_purchase_id") REFERENCES "purchases"("id") ON DELETE no action ON UPDATE no action;

-- Create index on user_id for faster queries
CREATE INDEX "idx_messages_user_id" ON "messages"("user_id");

-- Create index on read status for unread count queries
CREATE INDEX "idx_messages_user_read" ON "messages"("user_id", "read");
