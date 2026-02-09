CREATE TABLE IF NOT EXISTS "entity_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"relation_a_type" text NOT NULL,
	"relation_a_id" uuid NOT NULL,
	"relation_b_type" text NOT NULL,
	"relation_b_id" uuid NOT NULL,
	"metadata" text,
	"created_by" uuid REFERENCES "users"("id"),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "entity_rel_pair_unique" UNIQUE("relation_a_type", "relation_a_id", "relation_b_type", "relation_b_id")
);

CREATE INDEX IF NOT EXISTS "entity_rel_relation_a_idx" ON "entity_relationships" ("relation_a_type", "relation_a_id");
CREATE INDEX IF NOT EXISTS "entity_rel_relation_b_idx" ON "entity_relationships" ("relation_b_type", "relation_b_id");
