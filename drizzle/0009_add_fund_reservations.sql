-- Fund Reservations for Treasury
-- Allows reserving funds from treasury for specific purposes

-- ============================================
-- FUND RESERVATIONS
-- ============================================

CREATE TABLE "fund_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"amount" numeric(10, 2) NOT NULL,
	"year" integer NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- Junction table for tracking which transactions deduct from which reservations
CREATE TABLE "reservation_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"transaction_id" uuid NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

-- ============================================
-- FOREIGN KEY CONSTRAINTS
-- ============================================

ALTER TABLE "fund_reservations" ADD CONSTRAINT "fund_reservations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "reservation_transactions" ADD CONSTRAINT "reservation_transactions_reservation_id_fund_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."fund_reservations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "reservation_transactions" ADD CONSTRAINT "reservation_transactions_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX "idx_fund_reservations_year" ON "fund_reservations"("year");
CREATE INDEX "idx_fund_reservations_status" ON "fund_reservations"("status");
CREATE INDEX "idx_reservation_transactions_reservation_id" ON "reservation_transactions"("reservation_id");
CREATE INDEX "idx_reservation_transactions_transaction_id" ON "reservation_transactions"("transaction_id");

-- Unique constraint: a transaction can only be linked to a reservation once
CREATE UNIQUE INDEX "idx_reservation_transactions_unique" ON "reservation_transactions"("reservation_id", "transaction_id");
