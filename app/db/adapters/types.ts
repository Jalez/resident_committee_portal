import type {
	AppSetting,
	CommitteeMailMessage,
	CommitteeMailThread,
	EntityRelationship,
	Event,
	Faq,
	FundBudget,
	InventoryAdjustment,
	InventoryItem,
	MailDraft,
	Message,
	Minute,
	NewCommitteeMailMessage,
	NewEntityRelationship,
	NewEvent,
	NewFaq,
	NewFundBudget,
	NewInventoryAdjustment,
	NewInventoryItem,
	NewMailDraft,
	NewMessage,
	NewMinute,
	NewNews,
	NewPoll,
	NewPurchase,
	NewReceipt,
	NewRole,
	NewSocialLink,
	NewSubmission,
	News,
	NewTransaction,
	NewUser,
	Poll,
	Purchase,
	Receipt,
	RelationshipEntityType,
	Role,
	SocialLink,
	Submission,
	SubmissionStatus,
	Transaction,
	User,
} from "../client";

/**
 * Database adapter interface
 * Implement this interface to support different database backends
 */
export interface DatabaseAdapter {
	// ==================== User Methods ====================
	findUserByEmail(email: string): Promise<User | null>;
	findUserById(id: string): Promise<User | null>;
	createUser(user: NewUser): Promise<User>;
	updateUser(
		id: string,
		data: Partial<Omit<NewUser, "id">>,
	): Promise<User | null>;
	deleteUser(id: string): Promise<boolean>;
	getAllUsers(limit?: number, offset?: number): Promise<User[]>;
	upsertUser(user: Omit<NewUser, "roleId">): Promise<User>;

	// ==================== RBAC Methods ====================
	// Roles
	getAllRoles(): Promise<Role[]>;
	getRoleById(id: string): Promise<Role | null>;
	getRoleByName(name: string): Promise<Role | null>;
	createRole(role: NewRole): Promise<Role>;
	updateRole(
		id: string,
		data: Partial<Omit<NewRole, "id">>,
	): Promise<Role | null>;
	deleteRole(id: string): Promise<boolean>;

	// User permissions (fetched from all user roles)
	getUserPermissions(userId: string): Promise<string[]>;
	getUserWithRole(
		userId: string,
	): Promise<(User & { roleName?: string; permissions: string[] }) | null>;
	/** Role IDs for a user */
	getUserRoleIds(userId: string): Promise<string[]>;
	/** All user–role pairs (for bulk display) */
	getAllUserRoles(): Promise<{ userId: string; roleId: string }[]>;
	/** Replace user's roles with the given role IDs */
	setUserRoles(userId: string, roleIds: string[]): Promise<void>;
	/** Users who have this role (deduplicated) */
	getUsersByRoleId(roleId: string): Promise<User[]>;

	// ==================== Inventory Methods ====================
	getInventoryItems(): Promise<InventoryItem[]>;
	getInventoryItemById(id: string): Promise<InventoryItem | null>;
	createInventoryItem(item: NewInventoryItem): Promise<InventoryItem>;
	updateInventoryItem(
		id: string,
		data: Partial<Omit<NewInventoryItem, "id">>,
	): Promise<InventoryItem | null>;
	deleteInventoryItem(id: string): Promise<boolean>;
	bulkCreateInventoryItems(items: NewInventoryItem[]): Promise<InventoryItem[]>;
	// Lifecycle management
	getActiveInventoryItems(): Promise<InventoryItem[]>;
	softDeleteInventoryItem(
		id: string,
		reason: string,
		notes?: string,
	): Promise<InventoryItem | null>;
	markInventoryItemAsLegacy(id: string): Promise<InventoryItem | null>;

	// ==================== Inventory Adjustment Methods ====================
	getInventoryAdjustmentsByItemId(
		inventoryItemId: string,
	): Promise<InventoryAdjustment[]>;
	createInventoryAdjustment(
		adjustment: NewInventoryAdjustment,
	): Promise<InventoryAdjustment>;

	// ==================== Purchase Methods ====================
	getPurchases(): Promise<Purchase[]>;
	getPurchaseById(id: string): Promise<Purchase | null>;
	getPurchasesByInventoryItem(inventoryItemId: string): Promise<Purchase[]>;

	createPurchase(purchase: NewPurchase): Promise<Purchase>;
	updatePurchase(
		id: string,
		data: Partial<Omit<NewPurchase, "id">>,
	): Promise<Purchase | null>;
	deletePurchase(id: string): Promise<boolean>;

	// ==================== Transaction Methods ====================
	getTransactionById(id: string): Promise<Transaction | null>;
	getTransactionsByYear(year: number): Promise<Transaction[]>;
	getAllTransactions(): Promise<Transaction[]>;
	createTransaction(transaction: NewTransaction): Promise<Transaction>;
	updateTransaction(
		id: string,
		data: Partial<Omit<NewTransaction, "id">>,
	): Promise<Transaction | null>;
	deleteTransaction(id: string): Promise<boolean>;

	// ==================== Submission Methods ====================
	getSubmissions(): Promise<Submission[]>;
	getSubmissionById(id: string): Promise<Submission | null>;
	createSubmission(submission: NewSubmission): Promise<Submission>;
	updateSubmission(
		id: string,
		data: Partial<Omit<Submission, "id" | "createdAt">>,
	): Promise<Submission | null>;
	updateSubmissionStatus(
		id: string,
		status: SubmissionStatus,
	): Promise<Submission | null>;
	deleteSubmission(id: string): Promise<boolean>;

	// ==================== Social Link Methods ====================
	getSocialLinks(): Promise<SocialLink[]>;
	getSocialLinkById(id: string): Promise<SocialLink | null>;
	getPrimarySocialLink(): Promise<SocialLink | null>;
	createSocialLink(link: NewSocialLink): Promise<SocialLink>;
	updateSocialLink(
		id: string,
		data: Partial<Omit<NewSocialLink, "id">>,
	): Promise<SocialLink | null>;
	deleteSocialLink(id: string): Promise<boolean>;
	setPrimarySocialLink(id: string): Promise<void>;

	// ==================== News Methods ====================
	getNews(): Promise<News[]>;
	getNewsById(id: string): Promise<News | null>;
	createNews(item: NewNews): Promise<News>;
	updateNews(
		id: string,
		data: Partial<Omit<NewNews, "id">>,
	): Promise<News | null>;
	deleteNews(id: string): Promise<boolean>;

	// ==================== FAQ Methods ====================
	getFaqs(): Promise<Faq[]>;
	getFaqById(id: string): Promise<Faq | null>;
	createFaq(item: NewFaq): Promise<Faq>;
	updateFaq(id: string, data: Partial<Omit<NewFaq, "id">>): Promise<Faq | null>;
	deleteFaq(id: string): Promise<boolean>;

	// ==================== Minute Methods ====================
	getMinutes(year?: number): Promise<Minute[]>;
	getMinuteById(id: string): Promise<Minute | null>;
	createMinute(minute: NewMinute): Promise<Minute>;
	updateMinute(
		id: string,
		data: Partial<Omit<NewMinute, "id">>,
	): Promise<Minute | null>;
	deleteMinute(id: string): Promise<boolean>;

	// ==================== App Settings Methods ====================
	getSetting(key: string): Promise<string | null>;
	setSetting(
		key: string,
		value: string,
		description?: string,
	): Promise<AppSetting>;
	getAllSettings(): Promise<AppSetting[]>;
	deleteSetting(key: string): Promise<boolean>;

	// ==================== Committee Mail Methods ====================
	insertCommitteeMailMessage(
		message: NewCommitteeMailMessage,
	): Promise<CommitteeMailMessage>;
	getCommitteeMailMessages(
		direction: "sent" | "inbox",
		limit?: number,
		offset?: number,
	): Promise<CommitteeMailMessage[]>;
	getCommitteeMailMessageById(id: string): Promise<CommitteeMailMessage | null>;
	updateCommitteeMailMessage(
		id: string,
		data: Partial<Omit<NewCommitteeMailMessage, "id">>,
	): Promise<CommitteeMailMessage | null>;
	/** Check if a message with this message_id (inbox) already exists */
	committeeMailMessageExistsByMessageId(messageId: string): Promise<boolean>;
	deleteCommitteeMailMessage(id: string): Promise<boolean>;
	/** Get all messages in a thread, sorted chronologically */
	getCommitteeMailMessagesByThreadId(
		threadId: string,
	): Promise<CommitteeMailMessage[]>;
	/** Get threaded message list: latest message per thread with count */
	getCommitteeMailThreads(
		direction?: "sent" | "inbox",
		limit?: number,
		offset?: number,
	): Promise<
		{
			threadId: string;
			latestMessage: CommitteeMailMessage;
			messageCount: number;
		}[]
	>;
	/** Look up a message by its email message-ID header (not DB UUID) */
	getCommitteeMailMessageByMessageId(
		messageId: string,
	): Promise<CommitteeMailMessage | null>;
	/** Find mail messages whose subject contains a specific pattern (case-insensitive) */
	getCommitteeMailMessagesBySubjectPattern(
		pattern: string,
	): Promise<CommitteeMailMessage[]>;

	// ==================== Mail Thread Methods ====================
	/** Insert a new mail thread record */
	insertCommitteeMailThread(thread: {
		id: string;
		subject: string;
	}): Promise<CommitteeMailThread>;
	/** Get a mail thread by its ID */
	getCommitteeMailThreadById(
		id: string,
	): Promise<CommitteeMailThread | null>;
	/** Insert or update a mail thread record (upsert by id) */
	upsertCommitteeMailThread(thread: {
		id: string;
		subject: string;
	}): Promise<CommitteeMailThread>;

	// ==================== Mail Drafts Methods ====================
	insertMailDraft(draft: NewMailDraft): Promise<MailDraft>;
	updateMailDraft(
		id: string,
		data: Partial<Omit<NewMailDraft, "id" | "createdAt">>,
	): Promise<MailDraft | null>;
	getMailDrafts(limit?: number): Promise<MailDraft[]>;
	getMailDraftById(id: string): Promise<MailDraft | null>;
	deleteMailDraft(id: string): Promise<boolean>;

	// ==================== Message Methods ====================
	createMessage(message: NewMessage): Promise<Message>;
	getMessageById(id: string): Promise<Message | null>;
	getMessagesByUserId(
		userId: string,
		limit?: number,
		offset?: number,
	): Promise<Message[]>;
	getUnreadMessageCount(userId: string): Promise<number>;
	markMessageAsRead(messageId: string): Promise<Message | null>;
	markMessageAsUnread(messageId: string): Promise<Message | null>;
	markAllMessagesAsRead(userId: string): Promise<number>;

	// ==================== Fund Budget Methods ====================
	/** Get all fund budgets */
	getFundBudgets(): Promise<FundBudget[]>;
	/** Get fund budgets for a specific year */
	getFundBudgetsByYear(year: number): Promise<FundBudget[]>;
	/** Get a single fund budget by ID */
	getFundBudgetById(id: string): Promise<FundBudget | null>;
	/** Get open fund budgets for a year (for transaction linking) */
	getOpenFundBudgetsByYear(year: number): Promise<FundBudget[]>;
	/** Create a new fund budget */
	createFundBudget(budget: NewFundBudget): Promise<FundBudget>;
	/** Update a fund budget */
	updateFundBudget(
		id: string,
		data: Partial<Omit<NewFundBudget, "id">>,
	): Promise<FundBudget | null>;
	/** Delete a fund budget (only if no linked transactions) */
	deleteFundBudget(id: string): Promise<boolean>;

	/** Get the total used amount for a budget (only complete transactions) */
	getBudgetUsedAmount(budgetId: string): Promise<number>;
	/** Get the total reserved amount for a budget (only pending transactions) */
	getBudgetReservedAmount(budgetId: string): Promise<number>;
	/** Calculate available funds for a year (balance - open budget amounts) */
	getAvailableFundsForYear(year: number): Promise<number>;

	// ==================== Poll Methods ====================
	/** Get all polls */
	getPolls(year?: number): Promise<Poll[]>;
	/** Get a single poll by ID */
	getPollById(id: string): Promise<Poll | null>;
	/** Get active polls (not closed, optionally filtered by year) */
	getActivePolls(year?: number): Promise<Poll[]>;
	/** Create a new poll */
	createPoll(poll: NewPoll): Promise<Poll>;
	/** Update a poll */
	updatePoll(
		id: string,
		data: Partial<Omit<NewPoll, "id">>,
	): Promise<Poll | null>;
	/** Delete a poll */
	deletePoll(id: string): Promise<boolean>;

	// ==================== Receipt Methods ====================
	/** Get all receipts */
	getReceipts(): Promise<Receipt[]>;
	/** Get a single receipt by ID */
	getReceiptById(id: string): Promise<Receipt | null>;
	/** Create a new receipt */
	createReceipt(receipt: NewReceipt): Promise<Receipt>;
	/** Update a receipt */
	updateReceipt(
		id: string,
		data: Partial<Omit<NewReceipt, "id">>,
	): Promise<Receipt | null>;
	/** Delete a receipt */
	deleteReceipt(id: string): Promise<boolean>;

	/** Get incomplete inventory items (needs_completion = true) */
	getIncompleteInventoryItems(): Promise<InventoryItem[]>;
	/** Get app setting by key */
	getAppSetting(key: string): Promise<AppSetting | null>;

	// ==================== Universal Relationship Methods ====================
	createEntityRelationship(
		relationship: NewEntityRelationship,
	): Promise<EntityRelationship>;
	deleteEntityRelationship(id: string): Promise<boolean>;
	deleteEntityRelationshipByPair(
		relationAType: RelationshipEntityType,
		relationAId: string,
		relationBType: RelationshipEntityType,
		relationBId: string,
	): Promise<boolean>;
	getEntityRelationships(
		type: RelationshipEntityType,
		id: string,
	): Promise<EntityRelationship[]>;
	getEntityRelationshipsForMultipleIds(
		type: RelationshipEntityType,
		ids: string[],
	): Promise<EntityRelationship[]>;
	entityRelationshipExists(
		relationAType: RelationshipEntityType,
		relationAId: string,
		relationBType: RelationshipEntityType,
		relationBId: string,
	): Promise<boolean>;
	/**
	 * Get IDs of draft entities of a specific type that have no relationships
	 * and are older than the specified time.
	 */
	getOrphanedDrafts(
		type: RelationshipEntityType,
		olderThanMinutes: number,
	): Promise<string[]>;
	/**
	 * Bulk delete entities of a specific type.
	 * Used for cleaning up orphaned drafts.
	 */
	bulkDeleteDraftEntities(
		type: RelationshipEntityType,
		ids: string[],
	): Promise<number>;

	// ==================== Event Methods ====================
	getEvents(): Promise<Event[]>;
	getUpcomingEvents(limit?: number): Promise<Event[]>;
	getEventById(id: string): Promise<Event | null>;
	getEventByGoogleEventId(googleEventId: string): Promise<Event | null>;
	createEvent(event: NewEvent): Promise<Event>;
	updateEvent(
		id: string,
		data: Partial<Omit<NewEvent, "id">>,
	): Promise<Event | null>;
	deleteEvent(id: string): Promise<boolean>;
}
