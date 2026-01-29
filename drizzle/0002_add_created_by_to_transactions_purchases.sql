-- Add created_by columns to transactions and purchases tables
-- This enables self-edit and self-delete permissions

ALTER TABLE "transactions" ADD COLUMN "created_by" uuid;
ALTER TABLE "purchases" ADD COLUMN "created_by" uuid;

-- Add foreign key constraints
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;

-- Existing records will have NULL created_by (users with self permissions can only edit/delete items they create going forward)
