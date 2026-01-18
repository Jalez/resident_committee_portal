import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, and, notInArray, inArray } from "drizzle-orm";
import { users, inventoryItems, purchases, budgets, transactions, submissions, socialLinks, inventoryItemTransactions, permissions, roles, rolePermissions, appSettings, type User, type NewUser, type InventoryItem, type NewInventoryItem, type Purchase, type NewPurchase, type Budget, type NewBudget, type Transaction, type NewTransaction, type Submission, type NewSubmission, type SubmissionStatus, type SocialLink, type NewSocialLink, type InventoryItemTransaction, type Permission, type NewPermission, type Role, type NewRole, type RolePermission, type AppSetting } from "../schema";

import type { DatabaseAdapter } from "./types";

/**
 * Neon PostgreSQL database adapter using Drizzle ORM
 */
export class NeonAdapter implements DatabaseAdapter {
	private db: ReturnType<typeof drizzle>;

	constructor(connectionString: string) {
		const sql = neon(connectionString);
		this.db = drizzle(sql);
	}

	// ==================== User Methods ====================
	async findUserByEmail(email: string): Promise<User | null> {
		const result = await this.db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
		return result[0] ?? null;
	}

	async findUserById(id: string): Promise<User | null> {
		const result = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
		return result[0] ?? null;
	}

	async createUser(user: NewUser): Promise<User> {
		const result = await this.db.insert(users).values({ ...user, email: user.email.toLowerCase() }).returning();
		return result[0];
	}

	async updateUser(id: string, data: Partial<Omit<NewUser, "id">>): Promise<User | null> {
		const result = await this.db.update(users).set({ ...data, email: data.email?.toLowerCase(), updatedAt: new Date() }).where(eq(users.id, id)).returning();
		return result[0] ?? null;
	}

	async deleteUser(id: string): Promise<boolean> {
		const result = await this.db.delete(users).where(eq(users.id, id)).returning();
		return result.length > 0;
	}

	async getAllUsers(limit = 100, offset = 0): Promise<User[]> {
		return this.db.select().from(users).limit(limit).offset(offset);
	}

	async upsertUser(user: NewUser): Promise<User> {
		const existing = await this.findUserByEmail(user.email);
		if (existing) {
			const updated = await this.updateUser(existing.id, { name: user.name, ...(user.role && { role: user.role }), ...(user.apartmentNumber && { apartmentNumber: user.apartmentNumber }) });
			return updated!;
		}
		// For new users, automatically assign the Resident role from RBAC system
		const residentRole = await this.getRoleByName("Resident");
		const newUserData: NewUser = {
			...user,
			roleId: residentRole?.id ?? null,
		};
		return this.createUser(newUserData);
	}

	// ==================== RBAC Methods ====================
	// Permissions
	async getAllPermissions(): Promise<Permission[]> {
		return this.db.select().from(permissions);
	}

	async getPermissionById(id: string): Promise<Permission | null> {
		const result = await this.db.select().from(permissions).where(eq(permissions.id, id)).limit(1);
		return result[0] ?? null;
	}

	async getPermissionByName(name: string): Promise<Permission | null> {
		const result = await this.db.select().from(permissions).where(eq(permissions.name, name)).limit(1);
		return result[0] ?? null;
	}

	async createPermission(permission: NewPermission): Promise<Permission> {
		const result = await this.db.insert(permissions).values(permission).returning();
		return result[0];
	}

	async deletePermission(id: string): Promise<boolean> {
		const result = await this.db.delete(permissions).where(eq(permissions.id, id)).returning();
		return result.length > 0;
	}

	// Roles
	async getAllRoles(): Promise<Role[]> {
		return this.db.select().from(roles);
	}

	async getRoleById(id: string): Promise<Role | null> {
		const result = await this.db.select().from(roles).where(eq(roles.id, id)).limit(1);
		return result[0] ?? null;
	}

	async getRoleByName(name: string): Promise<Role | null> {
		const result = await this.db.select().from(roles).where(eq(roles.name, name)).limit(1);
		return result[0] ?? null;
	}

	async createRole(role: NewRole): Promise<Role> {
		const result = await this.db.insert(roles).values(role).returning();
		return result[0];
	}

	async updateRole(id: string, data: Partial<Omit<NewRole, "id">>): Promise<Role | null> {
		const result = await this.db.update(roles).set({ ...data, updatedAt: new Date() }).where(eq(roles.id, id)).returning();
		return result[0] ?? null;
	}

	async deleteRole(id: string): Promise<boolean> {
		// First check if it's a system role
		const role = await this.getRoleById(id);
		if (role?.isSystem) {
			throw new Error("Cannot delete system role");
		}
		// Remove role from users first
		await this.db.update(users).set({ roleId: null }).where(eq(users.roleId, id));
		// Delete role (cascade will remove role_permissions)
		const result = await this.db.delete(roles).where(eq(roles.id, id)).returning();
		return result.length > 0;
	}

	// Role-Permission mappings
	async getRolePermissions(roleId: string): Promise<Permission[]> {
		const mappings = await this.db.select().from(rolePermissions).where(eq(rolePermissions.roleId, roleId));
		if (mappings.length === 0) return [];
		const permissionIds = mappings.map(m => m.permissionId);
		return this.db.select().from(permissions).where(inArray(permissions.id, permissionIds));
	}

	async setRolePermissions(roleId: string, permissionIds: string[]): Promise<void> {
		// Delete existing permissions for role
		await this.db.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
		// Add new permissions
		if (permissionIds.length > 0) {
			await this.db.insert(rolePermissions).values(
				permissionIds.map(permissionId => ({ roleId, permissionId }))
			);
		}
	}

	async addPermissionToRole(roleId: string, permissionId: string): Promise<RolePermission> {
		const result = await this.db.insert(rolePermissions).values({ roleId, permissionId }).returning();
		return result[0];
	}

	async removePermissionFromRole(roleId: string, permissionId: string): Promise<boolean> {
		const result = await this.db.delete(rolePermissions)
			.where(and(eq(rolePermissions.roleId, roleId), eq(rolePermissions.permissionId, permissionId)))
			.returning();
		return result.length > 0;
	}

	// User permissions (computed from role)
	async getUserPermissions(userId: string): Promise<string[]> {
		const user = await this.findUserById(userId);
		if (!user) return [];

		// If user has new roleId, use that
		if (user.roleId) {
			const perms = await this.getRolePermissions(user.roleId);
			return perms.map(p => p.name);
		}

		// Fallback to legacy role mapping
		return this.getLegacyPermissions(user.role);
	}

	async getUserWithRole(userId: string): Promise<(User & { roleName?: string; permissions: string[] }) | null> {
		const user = await this.findUserById(userId);
		if (!user) return null;

		let roleName: string | undefined;
		let perms: string[];

		if (user.roleId) {
			const role = await this.getRoleById(user.roleId);
			roleName = role?.name;
			const rolePerms = await this.getRolePermissions(user.roleId);
			perms = rolePerms.map(p => p.name);
		} else {
			// Fallback to legacy
			roleName = user.role;
			perms = this.getLegacyPermissions(user.role);
		}

		return { ...user, roleName, permissions: perms };
	}

	// Helper: Map legacy roles to permissions
	private getLegacyPermissions(legacyRole: string): string[] {
		const basePermissions = ["profile:read:own", "profile:write:own"];

		if (legacyRole === "board_member") {
			return [
				...basePermissions,
				"inventory:write", "inventory:delete",
				"treasury:read", "treasury:write", "treasury:edit",
				"reimbursements:read", "reimbursements:write", "reimbursements:approve",
				"submissions:read", "submissions:write",
				"social:write", "social:delete",
				"minutes:guide",
			];
		}

		if (legacyRole === "admin") {
			return ["*"]; // Super admin has all permissions
		}

		return basePermissions; // resident
	}

	// ==================== Inventory Methods ====================
	async getInventoryItems(): Promise<InventoryItem[]> {
		return this.db.select().from(inventoryItems);
	}

	async getInventoryItemById(id: string): Promise<InventoryItem | null> {
		const result = await this.db.select().from(inventoryItems).where(eq(inventoryItems.id, id)).limit(1);
		return result[0] ?? null;
	}

	async createInventoryItem(item: NewInventoryItem): Promise<InventoryItem> {
		const result = await this.db.insert(inventoryItems).values(item).returning();
		return result[0];
	}

	async updateInventoryItem(id: string, data: Partial<Omit<NewInventoryItem, "id">>): Promise<InventoryItem | null> {
		const result = await this.db.update(inventoryItems).set({ ...data, updatedAt: new Date() }).where(eq(inventoryItems.id, id)).returning();
		return result[0] ?? null;
	}

	async deleteInventoryItem(id: string): Promise<boolean> {
		// First delete any transaction links
		await this.db.delete(inventoryItemTransactions).where(eq(inventoryItemTransactions.inventoryItemId, id));
		// Unlink from purchases (set inventoryItemId to null)
		await this.db.update(purchases).set({ inventoryItemId: null }).where(eq(purchases.inventoryItemId, id));

		const result = await this.db.delete(inventoryItems).where(eq(inventoryItems.id, id)).returning();
		return result.length > 0;
	}

	async bulkCreateInventoryItems(items: NewInventoryItem[]): Promise<InventoryItem[]> {
		if (items.length === 0) return [];
		return this.db.insert(inventoryItems).values(items).returning();
	}

	async getInventoryItemsWithoutTransactions(): Promise<InventoryItem[]> {
		// Get all item IDs that have linked transactions
		const linkedItems = await this.db.select({ id: inventoryItemTransactions.inventoryItemId }).from(inventoryItemTransactions);
		const linkedIds = linkedItems.map(l => l.id);

		if (linkedIds.length === 0) {
			// No items are linked, return all
			return this.db.select().from(inventoryItems);
		}

		// Return items not in the linked list
		return this.db.select().from(inventoryItems).where(notInArray(inventoryItems.id, linkedIds));
	}

	async getActiveInventoryItems(): Promise<InventoryItem[]> {
		return this.db.select().from(inventoryItems).where(eq(inventoryItems.status, "active"));
	}

	async softDeleteInventoryItem(id: string, reason: string, notes?: string): Promise<InventoryItem | null> {
		const result = await this.db.update(inventoryItems).set({
			status: "removed",
			removedAt: new Date(),
			removalReason: reason as InventoryItem["removalReason"],
			removalNotes: notes || null,
			updatedAt: new Date(),
		}).where(eq(inventoryItems.id, id)).returning();
		return result[0] ?? null;
	}

	async markInventoryItemAsLegacy(id: string): Promise<InventoryItem | null> {
		const result = await this.db.update(inventoryItems).set({
			status: "legacy",
			updatedAt: new Date(),
		}).where(eq(inventoryItems.id, id)).returning();
		return result[0] ?? null;
	}

	async getInventoryItemsForPicker(): Promise<(InventoryItem & { availableQuantity: number })[]> {
		// Get all active (non-legacy, non-removed) items
		const activeItems = await this.db.select().from(inventoryItems)
			.where(eq(inventoryItems.status, "active"));

		// Get all transaction links with quantities
		const allLinks = await this.db.select().from(inventoryItemTransactions);

		// Calculate linked quantity per item
		const linkedQuantityMap = new Map<string, number>();
		for (const link of allLinks) {
			const current = linkedQuantityMap.get(link.inventoryItemId) || 0;
			linkedQuantityMap.set(link.inventoryItemId, current + link.quantity);
		}

		// Return items with available quantity > 0
		const result: (InventoryItem & { availableQuantity: number })[] = [];
		for (const item of activeItems) {
			const linkedQty = linkedQuantityMap.get(item.id) || 0;
			const availableQuantity = item.quantity - linkedQty - (item.manualCount || 0);
			if (availableQuantity > 0) {
				result.push({ ...item, availableQuantity });
			}
		}

		return result;
	}

	async getTransactionLinksForItem(itemId: string): Promise<{ transaction: Transaction; quantity: number }[]> {
		const links = await this.db.select().from(inventoryItemTransactions)
			.where(eq(inventoryItemTransactions.inventoryItemId, itemId));

		if (links.length === 0) return [];

		const result: { transaction: Transaction; quantity: number }[] = [];
		for (const link of links) {
			const txResult = await this.db.select().from(transactions)
				.where(eq(transactions.id, link.transactionId)).limit(1);
			if (txResult[0]) {
				result.push({ transaction: txResult[0], quantity: link.quantity });
			}
		}

		return result;
	}

	async reduceInventoryFromTransaction(itemId: string, transactionId: string, quantityToRemove: number): Promise<boolean> {
		// Get current link
		const links = await this.db.select().from(inventoryItemTransactions)
			.where(and(
				eq(inventoryItemTransactions.inventoryItemId, itemId),
				eq(inventoryItemTransactions.transactionId, transactionId)
			));

		if (links.length === 0) return false;

		const currentQty = links[0].quantity;
		const newQty = currentQty - quantityToRemove;

		if (newQty <= 0) {
			// Remove the link entirely
			await this.db.delete(inventoryItemTransactions)
				.where(and(
					eq(inventoryItemTransactions.inventoryItemId, itemId),
					eq(inventoryItemTransactions.transactionId, transactionId)
				));
		} else {
			// Update the quantity
			await this.db.update(inventoryItemTransactions)
				.set({ quantity: newQty })
				.where(and(
					eq(inventoryItemTransactions.inventoryItemId, itemId),
					eq(inventoryItemTransactions.transactionId, transactionId)
				));
		}

		// Also reduce the inventory item's total quantity
		const item = await this.getInventoryItemById(itemId);
		if (item) {
			const newItemQty = Math.max(0, item.quantity - quantityToRemove);
			await this.updateInventoryItem(itemId, { quantity: newItemQty });
		}

		return true;
	}

	// ==================== Purchase Methods ====================
	async getPurchases(): Promise<Purchase[]> {
		return this.db.select().from(purchases);
	}

	async getPurchaseById(id: string): Promise<Purchase | null> {
		const result = await this.db.select().from(purchases).where(eq(purchases.id, id)).limit(1);
		return result[0] ?? null;
	}

	async getPurchasesByInventoryItem(inventoryItemId: string): Promise<Purchase[]> {
		return this.db.select().from(purchases).where(eq(purchases.inventoryItemId, inventoryItemId));
	}

	async createPurchase(purchase: NewPurchase): Promise<Purchase> {
		const result = await this.db.insert(purchases).values(purchase).returning();
		return result[0];
	}

	async updatePurchase(id: string, data: Partial<Omit<NewPurchase, "id">>): Promise<Purchase | null> {
		const result = await this.db.update(purchases).set({ ...data, updatedAt: new Date() }).where(eq(purchases.id, id)).returning();
		return result[0] ?? null;
	}

	async deletePurchase(id: string): Promise<boolean> {
		// First unlink any transactions referencing this purchase
		await this.db.update(transactions).set({ purchaseId: null }).where(eq(transactions.purchaseId, id));

		const result = await this.db.delete(purchases).where(eq(purchases.id, id)).returning();
		return result.length > 0;
	}

	// ==================== Budget Methods ====================
	async getBudgetByYear(year: number): Promise<Budget | null> {
		const result = await this.db.select().from(budgets).where(eq(budgets.year, year)).limit(1);
		return result[0] ?? null;
	}

	async getAllBudgets(): Promise<Budget[]> {
		return this.db.select().from(budgets);
	}

	async createBudget(budget: NewBudget): Promise<Budget> {
		const result = await this.db.insert(budgets).values(budget).returning();
		return result[0];
	}

	async updateBudget(id: string, data: Partial<Omit<NewBudget, "id">>): Promise<Budget | null> {
		const result = await this.db.update(budgets).set({ ...data, updatedAt: new Date() }).where(eq(budgets.id, id)).returning();
		return result[0] ?? null;
	}

	// ==================== Transaction Methods ====================
	async getTransactionsByYear(year: number): Promise<Transaction[]> {
		return this.db.select().from(transactions).where(eq(transactions.year, year));
	}

	async getAllTransactions(): Promise<Transaction[]> {
		return this.db.select().from(transactions);
	}

	async getTransactionByPurchaseId(purchaseId: string): Promise<Transaction | null> {
		const result = await this.db.select().from(transactions).where(eq(transactions.purchaseId, purchaseId)).limit(1);
		return result[0] ?? null;
	}

	async createTransaction(transaction: NewTransaction): Promise<Transaction> {
		const result = await this.db.insert(transactions).values(transaction).returning();
		return result[0];
	}

	async updateTransaction(id: string, data: Partial<Omit<NewTransaction, "id">>): Promise<Transaction | null> {
		const result = await this.db.update(transactions).set({ ...data, updatedAt: new Date() }).where(eq(transactions.id, id)).returning();
		return result[0] ?? null;
	}

	async deleteTransaction(id: string): Promise<boolean> {
		const result = await this.db.delete(transactions).where(eq(transactions.id, id)).returning();
		return result.length > 0;
	}

	async updateInventoryItemManualCount(itemId: string, manualCount: number): Promise<InventoryItem | null> {
		const result = await this.db.update(inventoryItems)
			.set({ manualCount, updatedAt: new Date() })
			.where(eq(inventoryItems.id, itemId))
			.returning();
		return result[0] ?? null;
	}

	// ==================== Inventory-Transaction Junction Methods ====================
	async linkInventoryItemToTransaction(itemId: string, transactionId: string, quantity = 1): Promise<InventoryItemTransaction> {
		const result = await this.db.insert(inventoryItemTransactions).values({
			inventoryItemId: itemId,
			transactionId,
			quantity,
		}).returning();
		return result[0];
	}

	async unlinkInventoryItemFromTransaction(itemId: string, transactionId: string): Promise<boolean> {
		const result = await this.db.delete(inventoryItemTransactions)
			.where(and(
				eq(inventoryItemTransactions.inventoryItemId, itemId),
				eq(inventoryItemTransactions.transactionId, transactionId)
			))
			.returning();
		return result.length > 0;
	}

	async getTransactionsForInventoryItem(itemId: string): Promise<Transaction[]> {
		const links = await this.db.select().from(inventoryItemTransactions)
			.where(eq(inventoryItemTransactions.inventoryItemId, itemId));
		if (links.length === 0) return [];
		const transactionIds = links.map(l => l.transactionId);
		const result: Transaction[] = [];
		for (const tid of transactionIds) {
			const t = await this.db.select().from(transactions).where(eq(transactions.id, tid)).limit(1);
			if (t[0]) result.push(t[0]);
		}
		return result;
	}

	async getInventoryItemsForTransaction(transactionId: string): Promise<(InventoryItem & { quantity: number })[]> {
		const links = await this.db.select().from(inventoryItemTransactions)
			.where(eq(inventoryItemTransactions.transactionId, transactionId));
		if (links.length === 0) return [];
		const result: (InventoryItem & { quantity: number })[] = [];
		for (const link of links) {
			const item = await this.db.select().from(inventoryItems).where(eq(inventoryItems.id, link.inventoryItemId)).limit(1);
			if (item[0]) result.push({ ...item[0], quantity: link.quantity });
		}
		return result;
	}

	async getActiveInventoryItemsForTransaction(transactionId: string): Promise<(InventoryItem & { quantity: number })[]> {
		const allItems = await this.getInventoryItemsForTransaction(transactionId);
		// Filter to only include active items (non-removed, non-legacy)
		return allItems.filter(item => item.status === "active");
	}

	// ==================== Submission Methods ====================
	async getSubmissions(): Promise<Submission[]> {
		return this.db.select().from(submissions);
	}

	async getSubmissionById(id: string): Promise<Submission | null> {
		const result = await this.db.select().from(submissions).where(eq(submissions.id, id)).limit(1);
		return result[0] ?? null;
	}

	async createSubmission(submission: NewSubmission): Promise<Submission> {
		const result = await this.db.insert(submissions).values(submission).returning();
		return result[0];
	}

	async updateSubmissionStatus(id: string, status: SubmissionStatus): Promise<Submission | null> {
		const result = await this.db.update(submissions).set({ status, updatedAt: new Date() }).where(eq(submissions.id, id)).returning();
		return result[0] ?? null;
	}

	async deleteSubmission(id: string): Promise<boolean> {
		const result = await this.db.delete(submissions).where(eq(submissions.id, id)).returning();
		return result.length > 0;
	}

	// ==================== Social Link Methods ====================
	async getSocialLinks(): Promise<SocialLink[]> {
		return this.db.select().from(socialLinks);
	}

	async getSocialLinkById(id: string): Promise<SocialLink | null> {
		const result = await this.db.select().from(socialLinks).where(eq(socialLinks.id, id)).limit(1);
		return result[0] ?? null;
	}

	async createSocialLink(link: NewSocialLink): Promise<SocialLink> {
		const result = await this.db.insert(socialLinks).values(link).returning();
		return result[0];
	}

	async updateSocialLink(id: string, data: Partial<Omit<NewSocialLink, "id">>): Promise<SocialLink | null> {
		const result = await this.db.update(socialLinks).set({ ...data, updatedAt: new Date() }).where(eq(socialLinks.id, id)).returning();
		return result[0] ?? null;
	}

	async deleteSocialLink(id: string): Promise<boolean> {
		const result = await this.db.delete(socialLinks).where(eq(socialLinks.id, id)).returning();
		return result.length > 0;
	}

	// ==================== App Settings Methods ====================
	async getSetting(key: string): Promise<string | null> {
		const result = await this.db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
		return result[0]?.value ?? null;
	}

	async setSetting(key: string, value: string, description?: string): Promise<AppSetting> {
		const existing = await this.db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
		if (existing.length > 0) {
			const result = await this.db
				.update(appSettings)
				.set({ value, description, updatedAt: new Date() })
				.where(eq(appSettings.key, key))
				.returning();
			return result[0];
		}
		const result = await this.db.insert(appSettings).values({ key, value, description }).returning();
		return result[0];
	}

	async getAllSettings(): Promise<AppSetting[]> {
		return this.db.select().from(appSettings);
	}

	async deleteSetting(key: string): Promise<boolean> {
		const result = await this.db.delete(appSettings).where(eq(appSettings.key, key)).returning();
		return result.length > 0;
	}
}
