-- Add secondary language columns to news (app default + app secondary)
ALTER TABLE "news" ADD COLUMN "title_secondary" text;
ALTER TABLE "news" ADD COLUMN "summary_secondary" text;
ALTER TABLE "news" ADD COLUMN "content_secondary" text;

-- Add secondary language columns to faq
ALTER TABLE "faq" ADD COLUMN "question_secondary" text;
ALTER TABLE "faq" ADD COLUMN "answer_secondary" text;
