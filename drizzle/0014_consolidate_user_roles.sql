-- Consolidate user roles: migrate from role_id column to unified user_roles junction table
-- This removes the distinction between "main role" and "secondary roles"

-- Step 1: Migrate existing role_id values to user_secondary_roles table
-- Only insert if the user doesn't already have this role in the junction table
INSERT INTO "user_secondary_roles" ("user_id", "role_id")
SELECT u."id", u."role_id"
FROM "users" u
WHERE u."role_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "user_secondary_roles" usr
    WHERE usr."user_id" = u."id"
      AND usr."role_id" = u."role_id"
  );

-- Step 2: Drop foreign key constraint on users.role_id
ALTER TABLE "users"
  DROP CONSTRAINT IF EXISTS "users_role_id_roles_id_fk";

-- Step 3: Drop index on users.role_id if it exists
DROP INDEX IF EXISTS "idx_users_role_id";

-- Step 4: Drop the role_id column from users table
ALTER TABLE "users"
  DROP COLUMN IF EXISTS "role_id";
