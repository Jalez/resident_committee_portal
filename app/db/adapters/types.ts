import type { User, NewUser, InventoryItem, NewInventoryItem, Purchase, NewPurchase, Budget, NewBudget, Transaction, NewTransaction, Submission, NewSubmission, SubmissionStatus, SocialLink, NewSocialLink, InventoryItemTransaction, NewInventoryItemTransaction, Permission, NewPermission, Role, NewRole, RolePermission, NewRolePermission, AppSetting, RemovalReason } from "../schema";

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

	// ==================== RBAC Methods ====================
	// Permissions
	getAllPermissions(): Promise<Permission[]>;
	getPermissionById(id: string): Promise<Permission | null>;
	getPermissionByName(name: string): Promise<Permission | null>;
	createPermission(permission: NewPermission): Promise<Permission>;
	deletePermission(id: string): Promise<boolean>;

	// Roles
	getAllRoles(): Promise<Role[]>;
	getRoleById(id: string): Promise<Role | null>;
	getRoleByName(name: string): Promise<Role | null>;
	createRole(role: NewRole): Promise<Role>;
	updateRole(id: string, data: Partial<Omit<NewRole, "id">>): Promise<Role | null>;
	deleteRole(id: string): Promise<boolean>;

	// Role-Permission mappings
	getRolePermissions(roleId: string): Promise<Permission[]>;
	setRolePermissions(roleId: string, permissionIds: string[]): Promise<void>;
	addPermissionToRole(roleId: string, permissionId: string): Promise<RolePermission>;
	removePermissionFromRole(roleId: string, permissionId: string): Promise<boolean>;

	// User permissions (computed from role)
	getUserPermissions(userId: string): Promise<string[]>;
	getUserWithRole(userId: string): Promise<(User & { roleName?: string; permissions: string[] }) | null>;

	// ==================== Inventory Methods ====================
	getInventoryItems(): Promise<InventoryItem[]>;
	getInventoryItemById(id: string): Promise<InventoryItem | null>;
	getInventoryItemsWithoutTransactions(): Promise<InventoryItem[]>;
	createInventoryItem(item: NewInventoryItem): Promise<InventoryItem>;
	updateInventoryItem(id: string, data: Partial<Omit<NewInventoryItem, "id">>): Promise<InventoryItem | null>;
	deleteInventoryItem(id: string): Promise<boolean>;
	bulkCreateInventoryItems(items: NewInventoryItem[]): Promise<InventoryItem[]>;
	// Lifecycle management
	getActiveInventoryItems(): Promise<InventoryItem[]>;
	softDeleteInventoryItem(id: string, reason: string, notes?: string): Promise<InventoryItem | null>;
	markInventoryItemAsLegacy(id: string): Promise<InventoryItem | null>;
	/** Get items available for transaction picker (active, non-legacy, with available quantity) */
	getInventoryItemsForPicker(): Promise<(InventoryItem & { availableQuantity: number })[]>;
	/** Get transaction links with quantities for an item */
	getTransactionLinksForItem(itemId: string): Promise<{ transaction: Transaction; quantity: number }[]>;
	/** Reduce quantity from a specific transaction link */
	/** Reduce quantity from a specific transaction link */
	reduceInventoryFromTransaction(itemId: string, transactionId: string, quantityToRemove: number): Promise<boolean>;
	/** Update manually accounted quantity (no transaction) for an item */
	updateInventoryItemManualCount(itemId: string, manualCount: number): Promise<InventoryItem | null>;

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
	getTransactionByPurchaseId(purchaseId: string): Promise<Transaction | null>;
	createTransaction(transaction: NewTransaction): Promise<Transaction>;
	updateTransaction(id: string, data: Partial<Omit<NewTransaction, "id">>): Promise<Transaction | null>;
	deleteTransaction(id: string): Promise<boolean>;

	// ==================== Inventory-Transaction Junction Methods ====================
	linkInventoryItemToTransaction(itemId: string, transactionId: string, quantity?: number): Promise<InventoryItemTransaction>;
	unlinkInventoryItemFromTransaction(itemId: string, transactionId: string): Promise<boolean>;
	getTransactionsForInventoryItem(itemId: string): Promise<Transaction[]>;
	getInventoryItemsForTransaction(transactionId: string): Promise<(InventoryItem & { quantity: number })[]>;
	/** Get only active (non-removed, non-legacy) inventory items for a transaction */
	getActiveInventoryItemsForTransaction(transactionId: string): Promise<(InventoryItem & { quantity: number })[]>;

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

	// ==================== App Settings Methods ====================
	getSetting(key: string): Promise<string | null>;
	setSetting(key: string, value: string, description?: string): Promise<AppSetting>;
	getAllSettings(): Promise<AppSetting[]>;
	deleteSetting(key: string): Promise<boolean>;
}

