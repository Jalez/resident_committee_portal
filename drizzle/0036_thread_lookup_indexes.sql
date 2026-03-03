CREATE INDEX IF NOT EXISTS "idx_committee_mail_messages_thread_date"
ON "committee_mail_messages" ("thread_id", "date");
