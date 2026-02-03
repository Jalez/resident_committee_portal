-- Add is_primary column to social_links table
-- Only one social link can be primary at a time (enforced at application level)
ALTER TABLE "social_links" ADD COLUMN "is_primary" boolean NOT NULL DEFAULT false;
