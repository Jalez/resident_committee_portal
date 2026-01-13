import type { User, NewUser, InventoryItem, NewInventoryItem, Purchase, NewPurchase, Budget, NewBudget, Transaction, NewTransaction } from "../schema";

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
}
