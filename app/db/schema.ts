import {
	boolean,
	decimal,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";
import type { RelationshipEntityType } from "./types";

// ============================================
// RBAC (Role-Based Access Control) System
// ============================================

/**
 * Roles table schema
 * Admin-defined roles that can be assigned to users
 *
 * IMPORTANT: Permission definitions are stored in app/lib/permissions.ts
 * The `permissions` array on each role stores permission NAME strings
 * that must match keys defined in the PERMISSIONS constant.
 *
 * To add a new permission:
 * 1. Add it to PERMISSIONS in app/lib/permissions.ts
 * 2. Assign it to roles via the admin UI or seed-rbac.ts
 */
export const roles = pgTable("roles", {
	id: uuid("id").primaryKey().defaultRandom(),
	name: text("name").notNull().unique(), // e.g., "Board Member"
	description: text("description"),
	color: text("color").notNull().default("bg-gray-500"), // Tailwind class for UI badge
	isSystem: boolean("is_system").notNull().default(false), // Prevent deletion of built-in roles
	sortOrder: integer("sort_order").notNull().default(0), // For UI ordering
	// Permission names (e.g., ["inventory:read", "treasury:write"])
	// Must match permission keys in app/lib/permissions.ts
	permissions: text("permissions").array().notNull().default([]),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Role = typeof roles.$inferSelect;
export type NewRole = typeof roles.$inferInsert;

/**
 * Users table schema
 * Stores authenticated user information
 *
 * Users have roles assigned via the userRoles junction table.
 * New users are automatically assigned the "Resident" role when created via upsertUser().
 */
export const users = pgTable("users", {
	id: uuid("id").primaryKey().defaultRandom(),
	email: text("email").notNull().unique(),
	name: text("name").notNull(),
	apartmentNumber: text("apartment_number"),
	bankAccount: text("bank_account"),
	// Profile fields
	description: text("description"),
	picture: text("picture"), // Google profile picture URL
	// Language preferences
	primaryLanguage: text("primary_language").notNull().default("fi"),
	secondaryLanguage: text("secondary_language").notNull().default("en"),
	// Local AI model preferences
	// Local AI model preferences
	localOllamaEnabled: boolean("local_ollama_enabled").notNull().default(false),
	localOllamaUrl: text("local_ollama_url")
		.notNull()
		.default("http://localhost:11434"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

/**
 * User roles (many-to-many)
 * Users can have multiple roles. Permissions = union of all role permissions.
 * New users are automatically assigned the "Resident" role.
 */
export const userRoles = pgTable(
	"user_secondary_roles", // Keep table name for backward compatibility
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: uuid("user_id")
			.references(() => users.id, { onDelete: "cascade" })
			.notNull(),
		roleId: uuid("role_id")
			.references(() => roles.id, { onDelete: "cascade" })
			.notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => ({
		userRolesUserRoleUnique: unique().on(t.userId, t.roleId),
	}),
);

export type UserRole = typeof userRoles.$inferSelect;
export type NewUserRole = typeof userRoles.$inferInsert;

/**
 * Inventory item status for lifecycle tracking
 * - draft: Item is being created but not yet finalized
 * - active: Item is currently in use
 * - removed: Item was removed from inventory (soft-deleted)
 * - legacy: Item existed before treasury records (no linked transactions expected)
 */
export type InventoryItemStatus = "draft" | "active" | "removed" | "legacy";

/**
 * Removal reason for audit purposes
 */
export type RemovalReason = "broken" | "used_up" | "lost" | "sold" | "other";

/**
 * Inventory items table schema
 * Stores committee inventory with purchase info
 */
export const inventoryItems = pgTable("inventory_items", {
	id: uuid("id").primaryKey().defaultRandom(),
	name: text("name").notNull(),
	quantity: integer("quantity").notNull().default(1),
	// Quantity explicitly confirmed to have no transaction (legacy/gift/etc)
	manualCount: integer("manual_count").notNull().default(0),
	location: text("location"), // Nullable for incomplete items from receipt processing
	category: text("category"),
	description: text("description"),
	showInInfoReel: boolean("show_in_info_reel").notNull().default(false),
	// Lifecycle tracking
	status: text("status")
		.$type<InventoryItemStatus>()
		.notNull()
		.default("active"),
	// Completion tracking for auto-created items from receipt processing
	needsCompletion: boolean("needs_completion").default(false),
	completionNotes: text("completion_notes"),
	// Timestamps
	purchasedAt: timestamp("purchased_at"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type InventoryItem = typeof inventoryItems.$inferSelect;
export type NewInventoryItem = typeof inventoryItems.$inferInsert;

/**
 * Inventory adjustments table
 * Tracks additions, removals, and other changes to inventory quantities
 */
export const inventoryAdjustments = pgTable("inventory_adjustments", {
	id: uuid("id").primaryKey().defaultRandom(),
	inventoryItemId: uuid("inventory_item_id")
		.references(() => inventoryItems.id, { onDelete: "cascade" })
		.notNull(),
	quantityChange: integer("quantity_change").notNull(),
	reason: text("reason").notNull(), // 'initial_stock', 'purchase', 'lost', 'broken', 'disposed', 'found', 'correction'
	notes: text("notes"),
	date: timestamp("date").defaultNow().notNull(),
	createdBy: uuid("created_by").references(() => users.id),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type InventoryAdjustment = typeof inventoryAdjustments.$inferSelect;
export type NewInventoryAdjustment = typeof inventoryAdjustments.$inferInsert;

/**
 * Purchase status values
 * - draft: Purchase is being created but not yet submitted
 * - pending: Waiting for approval
 * - approved: Approved, reserved from treasury
 * - reimbursed: Paid, deducted from treasury
 * - rejected: Not approved, not deducted
 */
export type PurchaseStatus =
	| "draft"
	| "pending"
	| "approved"
	| "reimbursed"
	| "rejected";

/**
 * Purchases table schema
 * Tracks purchase reimbursement requests (can be standalone or linked to inventory)
 */
export const purchases = pgTable("purchases", {
	id: uuid("id").primaryKey().defaultRandom(),
	// Optional link to inventory item (null for consumables like food)
	inventoryItemId: uuid("inventory_item_id").references(
		() => inventoryItems.id,
	),
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
	// Year for treasury association
	year: integer("year").notNull(),
	// Creator tracking for self-edit/delete permissions
	createdBy: uuid("created_by").references(() => users.id),
	// Timestamps
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Purchase = typeof purchases.$inferSelect;
export type NewPurchase = typeof purchases.$inferInsert;

/**
 * Transaction types
 */
export type TransactionType = "income" | "expense";

/**
 * Transaction status values
 * - draft: Transaction is being created but not yet finalized
 * - pending: Awaiting reimbursement or admin action
 * - complete: Finalized transaction
 * - paused: Temporarily on hold
 * - declined: Rejected by admin
 */
export type TransactionStatus =
	| "draft"
	| "pending"
	| "complete"
	| "paused"
	| "declined";

/**
 * Reimbursement status values
 * - not_requested: No reimbursement needed
 * - requested: Reimbursement request submitted
 * - approved: Reimbursement approved
 * - declined: Reimbursement rejected
 */
export type ReimbursementStatus =
	| "not_requested"
	| "requested"
	| "approved"
	| "declined";

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
	date: timestamp("date").notNull(),
	// Status tracking
	status: text("status")
		.$type<TransactionStatus>()
		.notNull()
		.default("complete"),
	reimbursementStatus: text("reimbursement_status")
		.$type<ReimbursementStatus>()
		.default("not_requested"),
	// Links to other entities via entity_relationships table (universal relationships)
	// Creator tracking for self-edit/delete permissions
	createdBy: uuid("created_by").references(() => users.id),
	// Timestamps
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;

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
	status: text("status")
		.$type<SubmissionStatus>()
		.notNull()
		.default("Uusi / New"),
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
	isPrimary: boolean("is_primary").notNull().default(false),
	// Status tracking
	status: text("status")
		.$type<"draft" | "active" | "archived">()
		.notNull()
		.default("active"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type SocialLink = typeof socialLinks.$inferSelect;
export type NewSocialLink = typeof socialLinks.$inferInsert;

/**
 * News table schema
 * Stores news stories for the portal
 */
export const news = pgTable("news", {
	id: uuid("id").primaryKey().defaultRandom(),
	title: text("title").notNull(),
	summary: text("summary"),
	content: text("content").notNull(),
	titleSecondary: text("title_secondary"),
	summarySecondary: text("summary_secondary"),
	contentSecondary: text("content_secondary"),
	createdBy: uuid("created_by").references(() => users.id),
	// Status tracking
	status: text("status")
		.$type<"draft" | "active" | "archived">()
		.notNull()
		.default("active"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type News = typeof news.$inferSelect;
export type NewNews = typeof news.$inferInsert;

/**
 * FAQ table schema
 * Stores frequently asked questions
 */
export const faq = pgTable("faq", {
	id: uuid("id").primaryKey().defaultRandom(),
	question: text("question").notNull(),
	answer: text("answer").notNull(),
	questionSecondary: text("question_secondary"),
	answerSecondary: text("answer_secondary"),
	sortOrder: integer("sort_order").notNull().default(0),
	// Status tracking
	status: text("status")
		.$type<"draft" | "active" | "archived">()
		.notNull()
		.default("active"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Faq = typeof faq.$inferSelect;
export type NewFaq = typeof faq.$inferInsert;

/**
 * Message types for notifications
 */
export type MessageType =
	| "reimbursement_approved"
	| "reimbursement_declined"
	| "news_published"
	| "ai_news_translation_failed"
	| "ai_faq_translation_failed";

/**
 * Messages table schema
 * Stores in-app notifications for users
 */
export const messages = pgTable("messages", {
	id: uuid("id").primaryKey().defaultRandom(),
	userId: uuid("user_id")
		.references(() => users.id)
		.notNull(),
	type: text("type").$type<MessageType>().notNull(),
	title: text("title").notNull(),
	content: text("content").notNull(),
	read: boolean("read").notNull().default(false),
	readAt: timestamp("read_at"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

// ============================================
// COMMITTEE MAIL (sent / inbox)
// ============================================

export type CommitteeMailDirection = "sent" | "inbox";

/**
 * Committee mail messages (sent and received at committee mailbox).
 * Stored when sending via Nodemailer or when fetching inbox via IMAP.
 */
export const committeeMailMessages = pgTable("committee_mail_messages", {
	id: uuid("id").primaryKey().defaultRandom(),
	direction: text("direction").$type<CommitteeMailDirection>().notNull(),
	fromAddress: text("from_address").notNull(),
	fromName: text("from_name"),
	toJson: text("to_json").notNull(), // JSON array of { email, name? }
	ccJson: text("cc_json"), // JSON array or null
	bccJson: text("bcc_json"), // JSON array or null
	subject: text("subject").notNull(),
	bodyHtml: text("body_html").notNull(),
	bodyText: text("body_text"), // optional plain text (inbox)
	date: timestamp("date").notNull(),
	messageId: text("message_id"), // for IMAP threading / dedupe
	inReplyTo: text("in_reply_to"), // In-Reply-To header value
	referencesJson: text("references_json"), // JSON array of References header message-IDs
	threadId: text("thread_id"), // thread root message-ID for grouping conversations
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type CommitteeMailMessage = typeof committeeMailMessages.$inferSelect;
export type NewCommitteeMailMessage = typeof committeeMailMessages.$inferInsert;

// ============================================
// MAIL DRAFTS (unsent compose)
// ============================================

/**
 * Mail drafts – unsent compose content, saved so refresh does not lose it.
 */
export type MailDraftType = "new" | "reply" | "replyAll" | "forward";

export const mailDrafts = pgTable("mail_drafts", {
	id: uuid("id").primaryKey().defaultRandom(),
	toJson: text("to_json").notNull(), // JSON array of { email, name? }
	ccJson: text("cc_json"),
	bccJson: text("bcc_json"),
	subject: text("subject"),
	body: text("body"),
	replyToMessageId: text("reply_to_message_id"), // DB id of message being replied to
	forwardFromMessageId: text("forward_from_message_id"), // DB id of message being forwarded
	draftType: text("draft_type").$type<MailDraftType>().notNull().default("new"),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type MailDraft = typeof mailDrafts.$inferSelect;
export type NewMailDraft = typeof mailDrafts.$inferInsert;

// ============================================
// FUND RESERVATIONS
// ============================================

/**
 * Budget status values
 * - draft: Budget is being created but not yet finalized
 * - open: Funds are reserved and can be used
 * - closed: Budget is closed, unused funds returned to available
 */
export type BudgetStatus = "draft" | "open" | "closed";

/**
 * Fund budgets table schema
 * Allows reserving treasury funds for specific purposes (e.g., "Guitar purchase")
 * Budgets are year-scoped and support partial deductions via transactions
 */
export const fundBudgets = pgTable("fund_budgets", {
	id: uuid("id").primaryKey().defaultRandom(),
	name: text("name").notNull(), // e.g., "Guitar purchase"
	description: text("description"), // Additional details
	amount: decimal("amount", { precision: 10, scale: 2 }).notNull(), // Reserved amount
	year: integer("year").notNull(), // Year the budget applies to
	status: text("status").$type<BudgetStatus>().notNull().default("open"),
	// Creator tracking for self-edit/delete permissions
	createdBy: uuid("created_by").references(() => users.id),
	// Timestamps
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type FundBudget = typeof fundBudgets.$inferSelect;
export type NewFundBudget = typeof fundBudgets.$inferInsert;

/**
 * Junction table for budget-transaction links
 * Tracks which transactions deduct from which budgets and by how much
 * Supports partial deductions (transaction amount can be less than budget amount)
 */
export const budgetTransactions = pgTable("budget_transactions", {
	id: uuid("id").primaryKey().defaultRandom(),
	budgetId: uuid("budget_id")
		.references(() => fundBudgets.id, { onDelete: "cascade" })
		.notNull(),
	transactionId: uuid("transaction_id")
		.references(() => transactions.id, { onDelete: "cascade" })
		.notNull(),
	amount: decimal("amount", { precision: 10, scale: 2 }).notNull(), // Deducted amount
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type BudgetTransaction = typeof budgetTransactions.$inferSelect;
export type NewBudgetTransaction = typeof budgetTransactions.$inferInsert;

// ============================================
// POLLS
// ============================================

/**
 * Poll types
 * - managed: Service account owns the form, users are added as editors
 * - linked: User owns the form, shared with service account
 * - external: External URL (not a Google Form)
 */
export type PollType = "managed" | "linked" | "external";

/**
 * Poll status
 * - active: Poll is currently accepting responses
 * - closed: Poll is no longer accepting responses
 */
export type PollStatus = "active" | "closed" | "draft";

/**
 * Polls table schema
 * Stores user-added polls (Google Forms links or other external polls)
 */
export const polls = pgTable("polls", {
	id: uuid("id").primaryKey().defaultRandom(),
	// Basic info
	name: text("name").notNull(),
	description: text("description"),
	// Poll source type
	type: text("type").$type<PollType>().notNull().default("external"),
	// Google Form ID (for managed/linked types)
	googleFormId: text("google_form_id"),
	// External URL (auto-generated for managed/linked forms)
	externalUrl: text("external_url").notNull(),
	// Optional: Link to analytics sheet (Google Sheet ID for response data)
	analyticsSheetId: text("analytics_sheet_id"),
	// Deadline tracking
	deadline: timestamp("deadline"), // When the poll closes
	status: text("status").$type<PollStatus>().notNull().default("active"),
	// Metadata
	year: integer("year").notNull(),
	// Creator tracking
	createdBy: uuid("created_by").references(() => users.id),
	// Timestamps
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Poll = typeof polls.$inferSelect;
export type NewPoll = typeof polls.$inferInsert;

/**
 * Receipt status values
 * - draft: Receipt is being created but not yet finalized
 * - active: Normal active receipt
 * - archived: Soft-deleted or archived receipt
 */
export type ReceiptStatus = "draft" | "active" | "archived";

/**
 * Receipts table schema
 * Stores receipt metadata and links to purchases (reimbursement requests)
 * Receipt files are stored in blob storage (Vercel Blob/Google Drive)
 */
export const receipts = pgTable("receipts", {
	id: uuid("id").primaryKey().defaultRandom(),
	// Status tracking
	status: text("status").$type<ReceiptStatus>().notNull().default("draft"),
	// Receipt metadata
	name: text("name"),
	description: text("description"),
	// File storage info (nullable for drafts)
	url: text("url"),
	pathname: text("pathname"),
	// OCR Content (extracted and parsed from receipt image)
	rawText: text("raw_text"),
	storeName: text("store_name"),
	items: text("items"),
	totalAmount: decimal("total_amount", { precision: 10, scale: 2 }),
	currency: text("currency").default("EUR"),
	purchaseDate: timestamp("purchase_date"),
	aiModel: text("ai_model"),
	ocrProcessed: boolean("ocr_processed").default(false),
	ocrProcessedAt: timestamp("ocr_processed_at"),
	// Creator tracking
	createdBy: uuid("created_by").references(() => users.id),
	// Timestamps
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Receipt = typeof receipts.$inferSelect;
export type NewReceipt = typeof receipts.$inferInsert;

// ============================================
// MINUTES
// ============================================

/**
 * Minute status values
 * - draft: Minute is being created but not yet finalized
 * - active: Normal active minute
 * - archived: Soft-deleted or archived minute
 */
export type MinuteStatus = "draft" | "active" | "archived";

/**
 * Minutes table schema
 * Stores meeting minutes metadata and file references (blob storage)
 */
export const minutes = pgTable("minutes", {
	id: uuid("id").primaryKey().defaultRandom(),
	// Status tracking
	status: text("status").$type<MinuteStatus>().notNull().default("draft"),
	date: timestamp("date"), // Can be null for drafts
	title: text("title"), // Can be null for drafts
	description: text("description"),
	// File storage info (nullable for drafts)
	fileUrl: text("file_url"), // Can be null for drafts
	fileKey: text("file_key"), // Can be null for drafts
	year: integer("year"), // Can be null for drafts
	// Creator tracking
	createdBy: uuid("created_by").references(() => users.id),
	// Timestamps
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Minute = typeof minutes.$inferSelect;
export type NewMinute = typeof minutes.$inferInsert;

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

// ============================================
// UNIVERSAL RELATIONSHIPS
// ============================================

export const entityRelationships = pgTable(
	"entity_relationships",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		relationAType: text("relation_a_type")
			.$type<RelationshipEntityType>()
			.notNull(),
		relationId: text("relation_a_id").notNull(),
		relationBType: text("relation_b_type")
			.$type<RelationshipEntityType>()
			.notNull(),
		relationBId: text("relation_b_id").notNull(),
		metadata: text("metadata"), // JSON string
		createdBy: uuid("created_by").references(() => users.id),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => ({
		pairUnique: unique("entity_rel_pair_unique").on(
			t.relationAType,
			t.relationId,
			t.relationBType,
			t.relationBId,
		),
		relationIdx: index("entity_rel_relation_a_idx").on(
			t.relationAType,
			t.relationId,
		),
		relationBIdx: index("entity_rel_relation_b_idx").on(
			t.relationBType,
			t.relationBId,
		),
	}),
);

export type EntityRelationship = typeof entityRelationships.$inferSelect;
export type NewEntityRelationship = typeof entityRelationships.$inferInsert;

// ============================================
// EVENTS
// ============================================

/**
 * Event status values
 * - draft: Event is being created but not yet finalized
 * - active: Event is scheduled and visible
 * - cancelled: Event was cancelled
 * - completed: Event has passed
 */
export type EventStatus = "draft" | "active" | "cancelled" | "completed";

/**
 * Event type for categorization
 * - meeting: Committee meeting
 * - social: Social event
 * - private: Private event (hidden from non-staff)
 */
export type EventType = "meeting" | "social" | "private";

/**
 * Events table schema
 * Stores event information synced with Google Calendar
 * DB is the primary source of truth, Google Calendar is synced for external visibility
 */
export const events = pgTable("events", {
	id: uuid("id").primaryKey().defaultRandom(),
	title: text("title").notNull(),
	description: text("description"),
	location: text("location"),
	isAllDay: boolean("is_all_day").notNull().default(false),
	startDate: timestamp("start_date").notNull(),
	endDate: timestamp("end_date"),
	recurrence: text("recurrence"),
	reminders: text("reminders"),
	attendees: text("attendees"),
	timezone: text("timezone"),
	eventType: text("event_type").$type<EventType>().notNull().default("social"),
	status: text("status").$type<EventStatus>().notNull().default("active"),
	googleEventId: text("google_event_id"),
	googleCalendarId: text("google_calendar_id"),
	createdBy: uuid("created_by").references(() => users.id),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
