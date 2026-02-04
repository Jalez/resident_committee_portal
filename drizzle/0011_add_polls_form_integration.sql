-- Add google_form_id column to polls and update type values
-- Migration: 0011_add_polls_form_integration.sql

-- Add google_form_id column
ALTER TABLE polls ADD COLUMN google_form_id TEXT;

-- Update existing type values:
-- 'google_form' -> 'linked' (existing linked forms)
-- 'custom' -> 'external' (existing external URLs)
UPDATE polls SET type = 'linked' WHERE type = 'google_form';
UPDATE polls SET type = 'external' WHERE type = 'custom';
