import { pgTable, text, timestamp, uuid, integer, decimal, boolean } from "drizzle-orm/pg-core";

/**
 * Legacy user roles (kept for backward compatibility during migration)
 * - resident: Regular resident of the housing complex
 * - board_member: Member of the student committee/board
 * - admin: Administrator with full access
 */
export type UserRole = "resident" | "board_member" | "admin";

// ============================================
// RBAC (Role-Based Access Control) System
// ============================================

/**
 * Permissions table schema
 * Defines all available permissions in the system
 * Format: "resource:action" (e.g., "inventory:write", "users:manage")
 */
export const permissions = pgTable("permissions", {
	id: uuid("id").primaryKey().defaultRandom(),
	name: text("name").notNull().unique(), // e.g., "inventory:write"
	description: text("description"), // Human-readable description
	category: text("category").notNull(), // Grouping for UI (e.g., "Inventory", "Treasury")
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Permission = typeof permissions.$inferSelect;
export type NewPermission = typeof permissions.$inferInsert;

/**
 * Roles table schema
 * Admin-defined roles that can be assigned to users
 */
export const roles = pgTable("roles", {
	id: uuid("id").primaryKey().defaultRandom(),
	name: text("name").notNull().unique(), // e.g., "Board Member"
	description: text("description"),
	color: text("color").notNull().default("bg-gray-500"), // Tailwind class for UI badge
	isSystem: boolean("is_system").notNull().default(false), // Prevent deletion of built-in roles
	sortOrder: integer("sort_order").notNull().default(0), // For UI ordering
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Role = typeof roles.$inferSelect;
export type NewRole = typeof roles.$inferInsert;

/**
 * Role-Permission junction table
 * Maps which permissions belong to which roles
 */
export const rolePermissions = pgTable("role_permissions", {
	id: uuid("id").primaryKey().defaultRandom(),
	roleId: uuid("role_id").references(() => roles.id, { onDelete: "cascade" }).notNull(),
	permissionId: uuid("permission_id").references(() => permissions.id, { onDelete: "cascade" }).notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type RolePermission = typeof rolePermissions.$inferSelect;
export type NewRolePermission = typeof rolePermissions.$inferInsert;

/**
 * Users table schema
 * Stores authenticated user information
 */
export const users = pgTable("users", {
	id: uuid("id").primaryKey().defaultRandom(),
	email: text("email").notNull().unique(),
	name: text("name").notNull(),
	role: text("role").$type<UserRole>().notNull().default("resident"), // Legacy field
	roleId: uuid("role_id").references(() => roles.id), // New RBAC role reference
	apartmentNumber: text("apartment_number"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

/**
 * Inventory item status for lifecycle tracking
 * - active: Item is currently in use
 * - removed: Item was removed from inventory (soft-deleted)
 * - legacy: Item existed before treasury records (no linked transactions expected)
 */
export type InventoryItemStatus = "active" | "removed" | "legacy";

/**
 * Removal reason for audit purposes
 */
export type RemovalReason = "broken" | "used_up" | "lost" | "sold" | "other";

/**
 * Inventory items table schema
 * Stores committee inventory with purchase info for budget tracking
 */
export const inventoryItems = pgTable("inventory_items", {
	id: uuid("id").primaryKey().defaultRandom(),
	name: text("name").notNull(),
	quantity: integer("quantity").notNull().default(1),
	// Quantity explicitly confirmed to have no transaction (legacy/gift/etc)
	manualCount: integer("manual_count").notNull().default(0),
	location: text("location").notNull(),
	category: text("category"),
	description: text("description"),
	value: decimal("value", { precision: 10, scale: 2 }).default("0"),
	showInInfoReel: boolean("show_in_info_reel").notNull().default(false),
	// Lifecycle tracking
	status: text("status").$type<InventoryItemStatus>().notNull().default("active"),
	removedAt: timestamp("removed_at"),
	removalReason: text("removal_reason").$type<RemovalReason>(),
	removalNotes: text("removal_notes"),
	// Timestamps
	purchasedAt: timestamp("purchased_at"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type InventoryItem = typeof inventoryItems.$inferSelect;
export type NewInventoryItem = typeof inventoryItems.$inferInsert;

/**
 * Purchase status values
 * - pending: Waiting for approval
 * - approved: Approved, reserved from budget
 * - reimbursed: Paid, deducted from budget
 * - rejected: Not approved, not deducted
 */
export type PurchaseStatus = "pending" | "approved" | "reimbursed" | "rejected";

/**
 * Purchases table schema
 * Tracks purchase reimbursement requests (can be standalone or linked to inventory)
 */
export const purchases = pgTable("purchases", {
	id: uuid("id").primaryKey().defaultRandom(),
	// Optional link to inventory item (null for consumables like food)
	inventoryItemId: uuid("inventory_item_id").references(() => inventoryItems.id),
	// Description for standalone purchases (e.g., "Kahvitarjoilu kokoukseen")
	description: text("description"),
	// Amount for the purchase (separate from inventory item value)
	amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
	// Purchaser info
	purchaserName: text("purchaser_name").notNull(),
	bankAccount: text("bank_account").notNull(),
	// Required reference to meeting minutes
	minutesId: text("minutes_id").notNull(),
	minutesName: text("minutes_name"), // For display purposes
	// Additional notes
	notes: text("notes"),
	// Status tracking
	status: text("status").$type<PurchaseStatus>().notNull().default("pending"),
	// Email tracking
	emailSent: boolean("email_sent").default(false),
	emailError: text("email_error"),
	// Email threading for inbound replies
	emailMessageId: text("email_message_id"), // Resend message ID for threading
	emailReplyReceived: boolean("email_reply_received").default(false),
	emailReplyContent: text("email_reply_content"), // Store reply for audit/review
	// Year for budget association
	year: integer("year").notNull(),
	// Timestamps
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Purchase = typeof purchases.$inferSelect;
export type NewPurchase = typeof purchases.$inferInsert;

/**
 * Budgets table schema
 * Stores yearly budget allocations
 */
export const budgets = pgTable("budgets", {
	id: uuid("id").primaryKey().defaultRandom(),
	year: integer("year").notNull().unique(),
	allocation: decimal("allocation", { precision: 10, scale: 2 }).notNull(),
	notes: text("notes"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Budget = typeof budgets.$inferSelect;
export type NewBudget = typeof budgets.$inferInsert;

/**
 * Transaction types
 */
export type TransactionType = "income" | "expense";

/**
 * Transaction status values
 * - pending: Awaiting reimbursement or admin action
 * - complete: Finalized transaction
 * - paused: Temporarily on hold
 * - declined: Rejected by admin
 */
export type TransactionStatus = "pending" | "complete" | "paused" | "declined";

/**
 * Reimbursement status values
 * - not_requested: No reimbursement needed
 * - requested: Reimbursement request submitted
 * - approved: Reimbursement approved
 * - declined: Reimbursement rejected
 */
export type ReimbursementStatus = "not_requested" | "requested" | "approved" | "declined";

/**
 * Transactions table schema
 * Tracks all monetary traffic (income and expenses)
 */
export const transactions = pgTable("transactions", {
	id: uuid("id").primaryKey().defaultRandom(),
	year: integer("year").notNull(),
	type: text("type").$type<TransactionType>().notNull(),
	amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
	description: text("description").notNull(),
	category: text("category"),
	date: timestamp("date").notNull(),
	// Status tracking
	status: text("status").$type<TransactionStatus>().notNull().default("complete"),
	reimbursementStatus: text("reimbursement_status").$type<ReimbursementStatus>().default("not_requested"),
	// Links to other entities (inventoryItemId moved to junction table)
	purchaseId: uuid("purchase_id").references(() => purchases.id),
	// Timestamps
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;

/**
 * Junction table for inventory items <-> transactions (many-to-many)
 * Allows multiple items per transaction (bulk purchases) and
 * items appearing in multiple transactions (restocking)
 */
export const inventoryItemTransactions = pgTable("inventory_item_transactions", {
	id: uuid("id").primaryKey().defaultRandom(),
	inventoryItemId: uuid("inventory_item_id").references(() => inventoryItems.id).notNull(),
	transactionId: uuid("transaction_id").references(() => transactions.id).notNull(),
	// Quantity of this item in this transaction (for bulk purchases)
	quantity: integer("quantity").notNull().default(1),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type InventoryItemTransaction = typeof inventoryItemTransactions.$inferSelect;
export type NewInventoryItemTransaction = typeof inventoryItemTransactions.$inferInsert;

/**
 * Submission types matching contact form options
 */
export type SubmissionType = "committee" | "events" | "purchases" | "questions";

/**
 * Submission status values
 */
export type SubmissionStatus =
	| "Uusi / New"
	| "Käsittelyssä / In Progress"
	| "Hyväksytty / Approved"
	| "Hylätty / Rejected"
	| "Valmis / Done";

/**
 * Submissions table schema
 * Stores contact form submissions
 */
export const submissions = pgTable("submissions", {
	id: uuid("id").primaryKey().defaultRandom(),
	type: text("type").$type<SubmissionType>().notNull(),
	name: text("name").notNull(),
	email: text("email").notNull(),
	apartmentNumber: text("apartment_number"),
	message: text("message").notNull(),
	status: text("status").$type<SubmissionStatus>().notNull().default("Uusi / New"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Submission = typeof submissions.$inferSelect;
export type NewSubmission = typeof submissions.$inferInsert;

/**
 * Social links table schema
 * Stores social media links displayed on the social page
 */
export const socialLinks = pgTable("social_links", {
	id: uuid("id").primaryKey().defaultRandom(),
	name: text("name").notNull(),
	icon: text("icon").notNull(), // Material symbol name
	url: text("url").notNull(),
	color: text("color").notNull(), // Tailwind class e.g. "bg-blue-500"
	sortOrder: integer("sort_order").notNull().default(0),
	isActive: boolean("is_active").notNull().default(true),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type SocialLink = typeof socialLinks.$inferSelect;
export type NewSocialLink = typeof socialLinks.$inferInsert;

// ============================================
// APPLICATION SETTINGS
// ============================================

/**
 * Key-value store for application settings
 * Used for: keywords configuration, AI settings, API keys, etc.
 */
export const appSettings = pgTable("app_settings", {
	key: text("key").primaryKey(),
	value: text("value"),
	description: text("description"), // For admin UI
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type AppSetting = typeof appSettings.$inferSelect;
export type NewAppSetting = typeof appSettings.$inferInsert;
