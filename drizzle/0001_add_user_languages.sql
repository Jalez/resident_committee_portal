-- Add missing language columns to users

ALTER TABLE "users" ADD COLUMN "primary_language" text;
ALTER TABLE "users" ADD COLUMN "secondary_language" text;

UPDATE "users"
SET primary_language = COALESCE(NULLIF(primary_language, ''), 'fi'),
	secondary_language = COALESCE(NULLIF(secondary_language, ''), 'en');

ALTER TABLE "users"
	ALTER COLUMN "primary_language" SET DEFAULT 'fi',
	ALTER COLUMN "secondary_language" SET DEFAULT 'en',
	ALTER COLUMN "primary_language" SET NOT NULL,
	ALTER COLUMN "secondary_language" SET NOT NULL;
