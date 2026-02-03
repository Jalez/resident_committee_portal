import type {
	AppSetting,
	CommitteeMailMessage,
	MailDraft,
	Faq,
	FundReservation,
	InventoryItem,
	InventoryItemTransaction,
	Message,
	NewCommitteeMailMessage,
	NewMailDraft,
	NewFaq,
	NewFundReservation,
	NewInventoryItem,
	NewMessage,
	NewNews,
	NewPurchase,
	NewRole,
	NewSocialLink,
	NewSubmission,
	NewTransaction,
	NewUser,
	News,
	Purchase,
	ReservationTransaction,
	Role,
	SocialLink,
	Submission,
	SubmissionStatus,
	Transaction,
	User,
} from "../schema";

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
	upsertUser(
		user: Omit<NewUser, "roleId"> & { roleId?: string },
	): Promise<User>;

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

	// User permissions (fetched from user's primary + secondary roles)
	getUserPermissions(userId: string): Promise<string[]>;
	getUserWithRole(
		userId: string,
	): Promise<(User & { roleName?: string; permissions: string[] }) | null>;
	/** Secondary role IDs for a user */
	getUserSecondaryRoleIds(userId: string): Promise<string[]>;
	/** All user–secondary role pairs (for bulk display) */
	getAllUserSecondaryRoles(): Promise<{ userId: string; roleId: string }[]>;
	/** Replace user's secondary roles with the given role IDs */
	setUserSecondaryRoles(userId: string, roleIds: string[]): Promise<void>;
	/** Users who have this role as primary OR secondary (deduplicated) */
	getUsersByRoleId(roleId: string): Promise<User[]>;

	// ==================== Inventory Methods ====================
	getInventoryItems(): Promise<InventoryItem[]>;
	getInventoryItemById(id: string): Promise<InventoryItem | null>;
	getInventoryItemsWithoutTransactions(): Promise<InventoryItem[]>;
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
	/** Get items available for transaction picker (active, non-legacy, with available quantity) */
	getInventoryItemsForPicker(): Promise<
		(InventoryItem & { availableQuantity: number })[]
	>;
	/** Get transaction links with quantities for an item */
	getTransactionLinksForItem(
		itemId: string,
	): Promise<{ transaction: Transaction; quantity: number }[]>;
	/** Reduce quantity from a specific transaction link */
	reduceInventoryFromTransaction(
		itemId: string,
		transactionId: string,
		quantityToRemove: number,
	): Promise<boolean>;
	/** Update manually accounted quantity (no transaction) for an item */
	updateInventoryItemManualCount(
		itemId: string,
		manualCount: number,
	): Promise<InventoryItem | null>;

	// ==================== Purchase Methods ====================
	getPurchases(): Promise<Purchase[]>;
	getPurchaseById(id: string): Promise<Purchase | null>;
	getPurchasesByInventoryItem(inventoryItemId: string): Promise<Purchase[]>;
	/** Get purchases that don't have a linked transaction */
	getPurchasesWithoutTransactions(): Promise<Purchase[]>;
	createPurchase(purchase: NewPurchase): Promise<Purchase>;
	updatePurchase(
		id: string,
		data: Partial<Omit<NewPurchase, "id">>,
	): Promise<Purchase | null>;
	deletePurchase(id: string): Promise<boolean>;

	// ==================== Transaction Methods ====================
	getTransactionsByYear(year: number): Promise<Transaction[]>;
	getAllTransactions(): Promise<Transaction[]>;
	getTransactionByPurchaseId(purchaseId: string): Promise<Transaction | null>;
	/** Get expense transactions that don't have a linked purchase (reimbursement) */
	getExpenseTransactionsWithoutReimbursement(): Promise<Transaction[]>;
	createTransaction(transaction: NewTransaction): Promise<Transaction>;
	updateTransaction(
		id: string,
		data: Partial<Omit<NewTransaction, "id">>,
	): Promise<Transaction | null>;
	deleteTransaction(id: string): Promise<boolean>;

	// ==================== Inventory-Transaction Junction Methods ====================
	linkInventoryItemToTransaction(
		itemId: string,
		transactionId: string,
		quantity?: number,
	): Promise<InventoryItemTransaction>;
	unlinkInventoryItemFromTransaction(
		itemId: string,
		transactionId: string,
	): Promise<boolean>;
	getTransactionsForInventoryItem(itemId: string): Promise<Transaction[]>;
	getInventoryItemsForTransaction(
		transactionId: string,
	): Promise<(InventoryItem & { quantity: number })[]>;
	/** Get only active (non-removed, non-legacy) inventory items for a transaction */
	getActiveInventoryItemsForTransaction(
		transactionId: string,
	): Promise<(InventoryItem & { quantity: number })[]>;

	// ==================== Submission Methods ====================
	getSubmissions(): Promise<Submission[]>;
	getSubmissionById(id: string): Promise<Submission | null>;
	createSubmission(submission: NewSubmission): Promise<Submission>;
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
	updateFaq(
		id: string,
		data: Partial<Omit<NewFaq, "id">>,
	): Promise<Faq | null>;
	deleteFaq(id: string): Promise<boolean>;

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
	getCommitteeMailMessageById(
		id: string,
	): Promise<CommitteeMailMessage | null>;
	/** Check if a message with this message_id (inbox) already exists */
	committeeMailMessageExistsByMessageId(
		messageId: string,
	): Promise<boolean>;

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
	getMessagesByUserId(
		userId: string,
		limit?: number,
		offset?: number,
	): Promise<Message[]>;
	getUnreadMessageCount(userId: string): Promise<number>;
	markMessageAsRead(messageId: string): Promise<Message | null>;
	markMessageAsUnread(messageId: string): Promise<Message | null>;
	markAllMessagesAsRead(userId: string): Promise<number>;

	// ==================== Fund Reservation Methods ====================
	/** Get all fund reservations */
	getFundReservations(): Promise<FundReservation[]>;
	/** Get fund reservations for a specific year */
	getFundReservationsByYear(year: number): Promise<FundReservation[]>;
	/** Get a single fund reservation by ID */
	getFundReservationById(id: string): Promise<FundReservation | null>;
	/** Get open fund reservations for a year (for transaction linking) */
	getOpenFundReservationsByYear(year: number): Promise<FundReservation[]>;
	/** Create a new fund reservation */
	createFundReservation(reservation: NewFundReservation): Promise<FundReservation>;
	/** Update a fund reservation */
	updateFundReservation(
		id: string,
		data: Partial<Omit<NewFundReservation, "id">>,
	): Promise<FundReservation | null>;
	/** Delete a fund reservation (only if no linked transactions) */
	deleteFundReservation(id: string): Promise<boolean>;
	/** Link a transaction to a reservation with a specific deduction amount */
	linkTransactionToReservation(
		transactionId: string,
		reservationId: string,
		amount: string,
	): Promise<ReservationTransaction>;
	/** Unlink a transaction from a reservation */
	unlinkTransactionFromReservation(
		transactionId: string,
		reservationId: string,
	): Promise<boolean>;
	/** Get all transactions linked to a reservation */
	getReservationTransactions(
		reservationId: string,
	): Promise<{ transaction: Transaction; amount: string }[]>;
	/** Get the total used amount for a reservation */
	getReservationUsedAmount(reservationId: string): Promise<number>;
	/** Calculate available funds for a year (balance - open reservation amounts) */
	getAvailableFundsForYear(year: number): Promise<number>;
	/** Get reservation linked to a transaction (if any) */
	getReservationForTransaction(
		transactionId: string,
	): Promise<{ reservation: FundReservation; amount: string } | null>;
}
