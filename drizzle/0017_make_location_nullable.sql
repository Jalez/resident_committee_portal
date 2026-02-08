-- Make location nullable for incomplete inventory items
ALTER TABLE inventory_items ALTER COLUMN location DROP NOT NULL;

-- Add completion tracking
ALTER TABLE inventory_items ADD COLUMN needs_completion BOOLEAN DEFAULT FALSE;
ALTER TABLE inventory_items ADD COLUMN completion_notes TEXT;

-- Add receipt processing status tracking to receipt_contents
ALTER TABLE receipt_contents ADD COLUMN processed BOOLEAN DEFAULT FALSE;
ALTER TABLE receipt_contents ADD COLUMN processed_at TIMESTAMP;
ALTER TABLE receipt_contents ADD COLUMN reimbursement_id UUID REFERENCES purchases(id);
ALTER TABLE receipt_contents ADD COLUMN transaction_ids TEXT;
ALTER TABLE receipt_contents ADD COLUMN inventory_item_ids TEXT;
