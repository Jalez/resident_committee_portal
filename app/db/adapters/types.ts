import type { User, NewUser, InventoryItem, NewInventoryItem, Purchase, NewPurchase, Budget, NewBudget, Transaction, NewTransaction, Submission, NewSubmission, SubmissionStatus, SocialLink, NewSocialLink, InventoryItemTransaction, NewInventoryItemTransaction } from "../schema";

/**
 * Database adapter interface
 * Implement this interface to support different database backends
 */
export interface DatabaseAdapter {
	// ==================== User Methods ====================
	findUserByEmail(email: string): Promise<User | null>;
	findUserById(id: string): Promise<User | null>;
	createUser(user: NewUser): Promise<User>;
	updateUser(id: string, data: Partial<Omit<NewUser, "id">>): Promise<User | null>;
	deleteUser(id: string): Promise<boolean>;
	getAllUsers(limit?: number, offset?: number): Promise<User[]>;
	upsertUser(user: NewUser): Promise<User>;

	// ==================== Inventory Methods ====================
	getInventoryItems(): Promise<InventoryItem[]>;
	getInventoryItemById(id: string): Promise<InventoryItem | null>;
	getInventoryItemsWithoutTransactions(): Promise<InventoryItem[]>;
	createInventoryItem(item: NewInventoryItem): Promise<InventoryItem>;
	updateInventoryItem(id: string, data: Partial<Omit<NewInventoryItem, "id">>): Promise<InventoryItem | null>;
	deleteInventoryItem(id: string): Promise<boolean>;
	bulkCreateInventoryItems(items: NewInventoryItem[]): Promise<InventoryItem[]>;

	// ==================== Purchase Methods ====================
	getPurchases(): Promise<Purchase[]>;
	getPurchaseById(id: string): Promise<Purchase | null>;
	getPurchasesByInventoryItem(inventoryItemId: string): Promise<Purchase[]>;
	createPurchase(purchase: NewPurchase): Promise<Purchase>;
	updatePurchase(id: string, data: Partial<Omit<NewPurchase, "id">>): Promise<Purchase | null>;
	deletePurchase(id: string): Promise<boolean>;

	// ==================== Budget Methods ====================
	getBudgetByYear(year: number): Promise<Budget | null>;
	getAllBudgets(): Promise<Budget[]>;
	createBudget(budget: NewBudget): Promise<Budget>;
	updateBudget(id: string, data: Partial<Omit<NewBudget, "id">>): Promise<Budget | null>;

	// ==================== Transaction Methods ====================
	getTransactionsByYear(year: number): Promise<Transaction[]>;
	getAllTransactions(): Promise<Transaction[]>;
	createTransaction(transaction: NewTransaction): Promise<Transaction>;
	updateTransaction(id: string, data: Partial<Omit<NewTransaction, "id">>): Promise<Transaction | null>;
	deleteTransaction(id: string): Promise<boolean>;

	// ==================== Inventory-Transaction Junction Methods ====================
	linkInventoryItemToTransaction(itemId: string, transactionId: string, quantity?: number): Promise<InventoryItemTransaction>;
	unlinkInventoryItemFromTransaction(itemId: string, transactionId: string): Promise<boolean>;
	getTransactionsForInventoryItem(itemId: string): Promise<Transaction[]>;
	getInventoryItemsForTransaction(transactionId: string): Promise<(InventoryItem & { quantity: number })[]>;

	// ==================== Submission Methods ====================
	getSubmissions(): Promise<Submission[]>;
	getSubmissionById(id: string): Promise<Submission | null>;
	createSubmission(submission: NewSubmission): Promise<Submission>;
	updateSubmissionStatus(id: string, status: SubmissionStatus): Promise<Submission | null>;
	deleteSubmission(id: string): Promise<boolean>;

	// ==================== Social Link Methods ====================
	getSocialLinks(): Promise<SocialLink[]>;
	getSocialLinkById(id: string): Promise<SocialLink | null>;
	createSocialLink(link: NewSocialLink): Promise<SocialLink>;
	updateSocialLink(id: string, data: Partial<Omit<NewSocialLink, "id">>): Promise<SocialLink | null>;
	deleteSocialLink(id: string): Promise<boolean>;
}

