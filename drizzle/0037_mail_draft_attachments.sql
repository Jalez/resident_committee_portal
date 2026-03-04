ALTER TABLE "mail_drafts"
ADD COLUMN IF NOT EXISTS "attachments_json" text;
