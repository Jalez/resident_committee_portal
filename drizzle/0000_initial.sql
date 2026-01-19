-- Resident Committee Portal - Initial Schema
-- This migration creates all tables needed for a fresh installation.
-- Run with: bun run db:push or bun run db:migrate

-- ============================================
-- RBAC (Role-Based Access Control) System
-- Permissions are defined in app/lib/permissions.ts
-- Roles store permission names as a text array
-- ============================================

CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"color" text DEFAULT 'bg-gray-500' NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"permissions" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "roles_name_unique" UNIQUE("name")
);

-- ============================================
-- USERS
-- ============================================

CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role_id" uuid NOT NULL,
	"apartment_number" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);

-- ============================================
-- TREASURY
-- ============================================

CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year" integer NOT NULL,
	"type" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"description" text NOT NULL,
	"category" text,
	"date" timestamp NOT NULL,
	"status" text DEFAULT 'complete' NOT NULL,
	"reimbursement_status" text DEFAULT 'not_requested',
	"purchase_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- ============================================
-- INVENTORY
-- ============================================

CREATE TABLE "inventory_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"manual_count" integer DEFAULT 0 NOT NULL,
	"location" text NOT NULL,
	"category" text,
	"description" text,
	"value" numeric(10, 2) DEFAULT '0',
	"show_in_info_reel" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"removed_at" timestamp,
	"removal_reason" text,
	"removal_notes" text,
	"purchased_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "inventory_item_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inventory_item_id" uuid NOT NULL,
	"transaction_id" uuid NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

-- ============================================
-- PURCHASES (Reimbursement Requests)
-- ============================================

CREATE TABLE "purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inventory_item_id" uuid,
	"description" text,
	"amount" numeric(10, 2) NOT NULL,
	"purchaser_name" text NOT NULL,
	"bank_account" text NOT NULL,
	"minutes_id" text NOT NULL,
	"minutes_name" text,
	"notes" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"email_sent" boolean DEFAULT false,
	"email_error" text,
	"email_message_id" text,
	"email_reply_received" boolean DEFAULT false,
	"email_reply_content" text,
	"year" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- ============================================
-- SUBMISSIONS (Contact Form)
-- ============================================

CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"apartment_number" text,
	"message" text NOT NULL,
	"status" text DEFAULT 'Uusi / New' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- ============================================
-- SOCIAL LINKS
-- ============================================

CREATE TABLE "social_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"icon" text NOT NULL,
	"url" text NOT NULL,
	"color" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- ============================================
-- APPLICATION SETTINGS
-- ============================================

CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text,
	"description" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- ============================================
-- FOREIGN KEY CONSTRAINTS
-- ============================================

ALTER TABLE "users" ADD CONSTRAINT "users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "inventory_item_transactions" ADD CONSTRAINT "inventory_item_transactions_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "inventory_item_transactions" ADD CONSTRAINT "inventory_item_transactions_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX "idx_users_role_id" ON "users"("role_id");
