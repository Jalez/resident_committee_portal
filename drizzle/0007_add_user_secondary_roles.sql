-- User secondary roles (many-to-many)
-- A user has one primary role (users.role_id) and optionally multiple secondary roles.

CREATE TABLE "user_secondary_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "user_secondary_roles"
	ADD CONSTRAINT "user_secondary_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "user_secondary_roles"
	ADD CONSTRAINT "user_secondary_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "user_secondary_roles"
	ADD CONSTRAINT "user_secondary_roles_user_id_role_id_unique" UNIQUE ("user_id", "role_id");
