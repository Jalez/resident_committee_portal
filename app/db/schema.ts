import { pgTable, text, timestamp, uuid, integer, decimal, boolean } from "drizzle-orm/pg-core";

/**
 * User roles in the system
 * - resident: Regular resident of the housing complex
 * - board_member: Member of the student committee/board
 * - admin: Administrator with full access
 */
export type UserRole = "resident" | "board_member" | "admin";

/**
 * Users table schema
 * Stores authenticated user information
 */
export const users = pgTable("users", {
	id: uuid("id").primaryKey().defaultRandom(),
	email: text("email").notNull().unique(),
	name: text("name").notNull(),
	role: text("role").$type<UserRole>().notNull().default("resident"),
	apartmentNumber: text("apartment_number"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

/**
 * Inventory items table schema
 * Stores committee inventory with purchase info for budget tracking
 */
export const inventoryItems = pgTable("inventory_items", {
	id: uuid("id").primaryKey().defaultRandom(),
	name: text("name").notNull(),
	quantity: integer("quantity").notNull().default(1),
	location: text("location").notNull(),
	category: text("category"),
	description: text("description"),
	value: decimal("value", { precision: 10, scale: 2 }).default("0"),
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
	purchaseId: uuid("purchase_id").references(() => purchases.id),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
