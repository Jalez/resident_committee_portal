-- Migration: Merge receipt_contents into receipts table
-- This consolidates OCR content directly in the receipts table for better data persistence

-- Add OCR content columns to receipts table
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS raw_text TEXT;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS store_name TEXT;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS items TEXT;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS total_amount DECIMAL(10,2);
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'EUR';
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS purchase_date TIMESTAMP;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS ai_model TEXT;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS ocr_processed BOOLEAN DEFAULT false;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS ocr_processed_at TIMESTAMP;

-- Migrate existing data from receipt_contents to receipts
UPDATE receipts r
SET 
  raw_text = rc.raw_text,
  store_name = rc.store_name,
  items = rc.items,
  total_amount = rc.total_amount,
  currency = COALESCE(rc.currency, 'EUR'),
  purchase_date = rc.purchase_date,
  ai_model = rc.ai_model,
  ocr_processed = COALESCE(rc.processed, false),
  ocr_processed_at = rc.processed_at
FROM receipt_contents rc
WHERE r.id = rc.receipt_id;

-- Note: We keep the receipt_contents table for now as a backup
-- It can be dropped in a follow-up migration after verifying the data migration