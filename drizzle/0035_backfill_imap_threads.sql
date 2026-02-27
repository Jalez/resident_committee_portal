-- Backfill committee_mail_threads rows for IMAP-synced messages that have a
-- threadId but no corresponding thread record (and therefore no slug).
INSERT INTO "committee_mail_threads" ("id", "subject", "slug", "created_at", "updated_at")
SELECT
    m.thread_id,
    MIN(m.subject),
    gen_random_uuid()::text,
    NOW(),
    NOW()
FROM committee_mail_messages m
WHERE m.thread_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM committee_mail_threads t WHERE t.id = m.thread_id
  )
GROUP BY m.thread_id;
