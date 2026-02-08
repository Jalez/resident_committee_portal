import { neon } from "@neondatabase/serverless";
import { and, asc, desc, eq, inArray, isNull, notInArray, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import {
	type AppSetting,
	appSettings,
	type CommitteeMailMessage,
	committeeMailMessages,
	type Faq,
	faq,
	type FundBudget,
	fundBudgets,
	type InventoryItem,
	type InventoryItemTransaction,
	inventoryItems,
	inventoryItemTransactions,
	type MailDraft,
	mailDrafts,
	type Message,
	messages,
	type NewCommitteeMailMessage,
	type NewMailDraft,
	type NewFaq,
	type NewFundBudget,
	type NewInventoryItem,
	type NewMessage,
	type NewNews,
	type NewPoll,
	type NewPurchase,
	type NewReceipt,
	type NewRole,
	type NewSocialLink,
	type NewSubmission,
	type NewTransaction,
	type NewUser,
	type News,
	news,
	type Poll,
	polls,
	type Purchase,
	purchases,
	type BudgetTransaction,
	budgetTransactions,
	type Receipt,
	receipts,
	type ReceiptContent,
	receiptContents,
	type NewReceiptContent,
	type Role,
	roles,
	type SocialLink,
	type Submission,
	type SubmissionStatus,
	socialLinks,
	submissions,
	type Transaction,
	transactions,
	type User,
	userRoles,
	users,
	type Minute,
	minutes,
	type NewMinute,
	type MinuteLink,
	minuteLinks,
	type NewMinuteLink,
} from "../schema";

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
		const result = await this.db
			.select()
			.from(users)
			.where(eq(users.email, email.toLowerCase()))
			.limit(1);
		return result[0] ?? null;
	}

	async findUserById(id: string): Promise<User | null> {
		const result = await this.db
			.select()
			.from(users)
			.where(eq(users.id, id))
			.limit(1);
		return result[0] ?? null;
	}

	async createUser(user: NewUser): Promise<User> {
		const result = await this.db
			.insert(users)
			.values({ ...user, email: user.email.toLowerCase() })
			.returning();
		return result[0];
	}

	async updateUser(
		id: string,
		data: Partial<Omit<NewUser, "id">>,
	): Promise<User | null> {
		const result = await this.db
			.update(users)
			.set({ ...data, email: data.email?.toLowerCase(), updatedAt: new Date() })
			.where(eq(users.id, id))
			.returning();
		return result[0] ?? null;
	}

	async deleteUser(id: string): Promise<boolean> {
		const result = await this.db
			.delete(users)
			.where(eq(users.id, id))
			.returning();
		return result.length > 0;
	}

	async getAllUsers(limit = 100, offset = 0): Promise<User[]> {
		return this.db
			.select()
			.from(users)
			.orderBy(asc(users.name), asc(users.createdAt))
			.limit(limit)
			.offset(offset);
	}

	async upsertUser(
		user: Omit<NewUser, "roleId">,
	): Promise<User> {
		const existing = await this.findUserByEmail(user.email);
		if (existing) {
			const updated = await this.updateUser(existing.id, {
				name: user.name,
				...(user.apartmentNumber && { apartmentNumber: user.apartmentNumber }),
			});
			if (!updated) {
				throw new Error(`Failed to update user with email: ${user.email}`);
			}
			return updated;
		}
		// Create new user without roleId
		const newUser = await this.createUser(user);

		// For new users, automatically assign the Resident role via junction table
		const residentRole = await this.getRoleByName("Resident");
		if (!residentRole) {
			throw new Error(
				"Resident role not found. Run the seed-rbac.ts script to create default roles.",
			);
		}
		await this.setUserRoles(newUser.id, [residentRole.id]);

		return newUser;
	}

	// ==================== RBAC Methods ====================
	// Roles (permissions are stored as array on role, no junction table needed)
	async getAllRoles(): Promise<Role[]> {
		return this.db.select().from(roles);
	}

	async getRoleById(id: string): Promise<Role | null> {
		const result = await this.db
			.select()
			.from(roles)
			.where(eq(roles.id, id))
			.limit(1);
		return result[0] ?? null;
	}

	async getRoleByName(name: string): Promise<Role | null> {
		const result = await this.db
			.select()
			.from(roles)
			.where(eq(roles.name, name))
			.limit(1);
		return result[0] ?? null;
	}

	async createRole(role: NewRole): Promise<Role> {
		const result = await this.db.insert(roles).values(role).returning();
		return result[0];
	}

	async updateRole(
		id: string,
		data: Partial<Omit<NewRole, "id">>,
	): Promise<Role | null> {
		const result = await this.db
			.update(roles)
			.set({ ...data, updatedAt: new Date() })
			.where(eq(roles.id, id))
			.returning();
		return result[0] ?? null;
	}

	async deleteRole(id: string): Promise<boolean> {
		// First check if it's a system role
		const role = await this.getRoleById(id);
		if (role?.isSystem) {
			throw new Error("Cannot delete system role");
		}
		// Get the Resident role to reassign users
		const residentRole = await this.getRoleByName("Resident");
		if (residentRole) {
			// Get all users with this role
			const usersWithRole = await this.getUsersByRoleId(id);
			// Remove the role and assign Resident role instead
			for (const user of usersWithRole) {
				const currentRoleIds = await this.getUserRoleIds(user.id);
				const newRoleIds = currentRoleIds.filter(rid => rid !== id);
				// If user has no roles left, assign Resident
				if (newRoleIds.length === 0) {
					await this.setUserRoles(user.id, [residentRole.id]);
				} else {
					await this.setUserRoles(user.id, newRoleIds);
				}
			}
		}
		const result = await this.db
			.delete(roles)
			.where(eq(roles.id, id))
			.returning();
		return result.length > 0;
	}

	// User permissions (union of all user roles)
	async getUserPermissions(userId: string): Promise<string[]> {
		const roleIds = await this.getUserRoleIds(userId);
		const allPerms: string[] = [];
		for (const roleId of roleIds) {
			const role = await this.getRoleById(roleId);
			if (role?.permissions) {
				allPerms.push(...role.permissions);
			}
		}
		return [...new Set(allPerms)];
	}

	async getUserWithRole(
		userId: string,
	): Promise<(User & { roleName?: string; permissions: string[] }) | null> {
		const user = await this.findUserById(userId);
		if (!user) return null;

		const roleIds = await this.getUserRoleIds(userId);
		const firstRole = roleIds.length > 0 ? await this.getRoleById(roleIds[0]) : null;
		const permissions = await this.getUserPermissions(userId);
		return {
			...user,
			roleName: firstRole?.name,
			permissions,
		};
	}

	async getUserRoleIds(userId: string): Promise<string[]> {
		const rows = await this.db
			.select({ roleId: userRoles.roleId })
			.from(userRoles)
			.where(eq(userRoles.userId, userId));
		return rows.map((r) => r.roleId);
	}

	async getAllUserRoles(): Promise<
		{ userId: string; roleId: string }[]
	> {
		const rows = await this.db
			.select({
				userId: userRoles.userId,
				roleId: userRoles.roleId,
			})
			.from(userRoles);
		return rows;
	}

	async setUserRoles(userId: string, roleIds: string[]): Promise<void> {
		await this.db
			.delete(userRoles)
			.where(eq(userRoles.userId, userId));

		// If no roles provided, assign default "Resident" role to prevent users from having no roles
		let finalRoleIds = roleIds;
		if (finalRoleIds.length === 0) {
			const residentRole = await this.getRoleByName("Resident");
			if (!residentRole) {
				throw new Error(
					"Resident role not found. Run the seed-rbac.ts script to create default roles.",
				);
			}
			finalRoleIds = [residentRole.id];
		}

		await this.db.insert(userRoles).values(
			finalRoleIds.map((roleId) => ({ userId, roleId })),
		);
	}

	async getUsersByRoleId(roleId: string): Promise<User[]> {
		const rows = await this.db
			.select({ user: users })
			.from(users)
			.innerJoin(
				userRoles,
				eq(users.id, userRoles.userId),
			)
			.where(eq(userRoles.roleId, roleId));
		return rows.map((r) => r.user);
	}

	// ==================== Inventory Methods ====================
	async getInventoryItems(): Promise<InventoryItem[]> {
		return this.db.select().from(inventoryItems);
	}

	async getInventoryItemById(id: string): Promise<InventoryItem | null> {
		const result = await this.db
			.select()
			.from(inventoryItems)
			.where(eq(inventoryItems.id, id))
			.limit(1);
		return result[0] ?? null;
	}

	async createInventoryItem(item: NewInventoryItem): Promise<InventoryItem> {
		const result = await this.db
			.insert(inventoryItems)
			.values(item)
			.returning();
		return result[0];
	}

	async updateInventoryItem(
		id: string,
		data: Partial<Omit<NewInventoryItem, "id">>,
	): Promise<InventoryItem | null> {
		const result = await this.db
			.update(inventoryItems)
			.set({ ...data, updatedAt: new Date() })
			.where(eq(inventoryItems.id, id))
			.returning();
		return result[0] ?? null;
	}

	async deleteInventoryItem(id: string): Promise<boolean> {
		// First delete any transaction links
		await this.db
			.delete(inventoryItemTransactions)
			.where(eq(inventoryItemTransactions.inventoryItemId, id));
		// Unlink from purchases (set inventoryItemId to null)
		await this.db
			.update(purchases)
			.set({ inventoryItemId: null })
			.where(eq(purchases.inventoryItemId, id));

		const result = await this.db
			.delete(inventoryItems)
			.where(eq(inventoryItems.id, id))
			.returning();
		return result.length > 0;
	}

	async bulkCreateInventoryItems(
		items: NewInventoryItem[],
	): Promise<InventoryItem[]> {
		if (items.length === 0) return [];
		return this.db.insert(inventoryItems).values(items).returning();
	}

	async getInventoryItemsWithoutTransactions(): Promise<InventoryItem[]> {
		// Get all item IDs that have linked transactions
		const linkedItems = await this.db
			.select({ id: inventoryItemTransactions.inventoryItemId })
			.from(inventoryItemTransactions);
		const linkedIds = linkedItems.map((l) => l.id);

		if (linkedIds.length === 0) {
			// No items are linked, return all
			return this.db.select().from(inventoryItems);
		}

		// Return items not in the linked list
		return this.db
			.select()
			.from(inventoryItems)
			.where(notInArray(inventoryItems.id, linkedIds));
	}

	async getActiveInventoryItems(): Promise<InventoryItem[]> {
		return this.db
			.select()
			.from(inventoryItems)
			.where(eq(inventoryItems.status, "active"));
	}

	async softDeleteInventoryItem(
		id: string,
		reason: string,
		notes?: string,
	): Promise<InventoryItem | null> {
		const result = await this.db
			.update(inventoryItems)
			.set({
				status: "removed",
				removedAt: new Date(),
				removalReason: reason as InventoryItem["removalReason"],
				removalNotes: notes || null,
				updatedAt: new Date(),
			})
			.where(eq(inventoryItems.id, id))
			.returning();
		return result[0] ?? null;
	}

	async markInventoryItemAsLegacy(id: string): Promise<InventoryItem | null> {
		const result = await this.db
			.update(inventoryItems)
			.set({
				status: "legacy",
				updatedAt: new Date(),
			})
			.where(eq(inventoryItems.id, id))
			.returning();
		return result[0] ?? null;
	}

	async getInventoryItemsForPicker(): Promise<
		(InventoryItem & { availableQuantity: number })[]
	> {
		// Get all active (non-legacy, non-removed) items
		const activeItems = await this.db
			.select()
			.from(inventoryItems)
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
			const availableQuantity =
				item.quantity - linkedQty - (item.manualCount || 0);
			if (availableQuantity > 0) {
				result.push({ ...item, availableQuantity });
			}
		}

		return result;
	}

	async getTransactionLinksForItem(
		itemId: string,
	): Promise<{ transaction: Transaction; quantity: number }[]> {
		const links = await this.db
			.select()
			.from(inventoryItemTransactions)
			.where(eq(inventoryItemTransactions.inventoryItemId, itemId));

		if (links.length === 0) return [];

		const result: { transaction: Transaction; quantity: number }[] = [];
		for (const link of links) {
			const txResult = await this.db
				.select()
				.from(transactions)
				.where(eq(transactions.id, link.transactionId))
				.limit(1);
			if (txResult[0]) {
				result.push({ transaction: txResult[0], quantity: link.quantity });
			}
		}

		return result;
	}

	async reduceInventoryFromTransaction(
		itemId: string,
		transactionId: string,
		quantityToRemove: number,
	): Promise<boolean> {
		// Get current link
		const links = await this.db
			.select()
			.from(inventoryItemTransactions)
			.where(
				and(
					eq(inventoryItemTransactions.inventoryItemId, itemId),
					eq(inventoryItemTransactions.transactionId, transactionId),
				),
			);

		if (links.length === 0) return false;

		const currentQty = links[0].quantity;
		const newQty = currentQty - quantityToRemove;

		if (newQty <= 0) {
			// Remove the link entirely
			await this.db
				.delete(inventoryItemTransactions)
				.where(
					and(
						eq(inventoryItemTransactions.inventoryItemId, itemId),
						eq(inventoryItemTransactions.transactionId, transactionId),
					),
				);
		} else {
			// Update the quantity
			await this.db
				.update(inventoryItemTransactions)
				.set({ quantity: newQty })
				.where(
					and(
						eq(inventoryItemTransactions.inventoryItemId, itemId),
						eq(inventoryItemTransactions.transactionId, transactionId),
					),
				);
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
		const result = await this.db
			.select()
			.from(purchases)
			.where(eq(purchases.id, id))
			.limit(1);
		return result[0] ?? null;
	}

	async getPurchasesByInventoryItem(
		inventoryItemId: string,
	): Promise<Purchase[]> {
		return this.db
			.select()
			.from(purchases)
			.where(eq(purchases.inventoryItemId, inventoryItemId));
	}

	async getPurchasesWithoutTransactions(): Promise<Purchase[]> {
		// Get all purchases, then filter out those that have a linked transaction
		const allPurchases = await this.db.select().from(purchases);
		const linkedPurchaseIds = await this.db
			.select({ purchaseId: transactions.purchaseId })
			.from(transactions);

		const linkedIds = new Set(
			linkedPurchaseIds
				.map((t) => t.purchaseId)
				.filter(Boolean) as string[],
		);

		return allPurchases.filter((p) => !linkedIds.has(p.id));
	}

	async createPurchase(purchase: NewPurchase): Promise<Purchase> {
		const result = await this.db.insert(purchases).values(purchase).returning();
		return result[0];
	}

	async updatePurchase(
		id: string,
		data: Partial<Omit<NewPurchase, "id">>,
	): Promise<Purchase | null> {
		const result = await this.db
			.update(purchases)
			.set({ ...data, updatedAt: new Date() })
			.where(eq(purchases.id, id))
			.returning();
		return result[0] ?? null;
	}

	async deletePurchase(id: string): Promise<boolean> {
		// First unlink any transactions referencing this purchase
		await this.db
			.update(transactions)
			.set({ purchaseId: null })
			.where(eq(transactions.purchaseId, id));

		const result = await this.db
			.delete(purchases)
			.where(eq(purchases.id, id))
			.returning();
		return result.length > 0;
	}

	// ==================== Transaction Methods ====================
	async getTransactionsByYear(year: number): Promise<Transaction[]> {
		return this.db
			.select()
			.from(transactions)
			.where(eq(transactions.year, year));
	}

	async getAllTransactions(): Promise<Transaction[]> {
		return this.db.select().from(transactions);
	}

	async getTransactionByPurchaseId(
		purchaseId: string,
	): Promise<Transaction | null> {
		const result = await this.db
			.select()
			.from(transactions)
			.where(eq(transactions.purchaseId, purchaseId))
			.limit(1);
		return result[0] ?? null;
	}

	async getExpenseTransactionsWithoutReimbursement(): Promise<Transaction[]> {
		return this.db
			.select()
			.from(transactions)
			.where(
				and(
					eq(transactions.type, "expense"),
					or(
						isNull(transactions.purchaseId),
						eq(transactions.reimbursementStatus, "declined"),
					),
				),
			);
	}

	async createTransaction(transaction: NewTransaction): Promise<Transaction> {
		// Validate: if purchaseId is provided, ensure no other transaction links to it
		if (transaction.purchaseId) {
			const existingLink = await this.getTransactionByPurchaseId(
				transaction.purchaseId,
			);
			if (existingLink) {
				throw new Error(
					`Purchase ${transaction.purchaseId} is already linked to transaction ${existingLink.id}`,
				);
			}
		}

		const result = await this.db
			.insert(transactions)
			.values(transaction)
			.returning();
		return result[0];
	}

	async updateTransaction(
		id: string,
		data: Partial<Omit<NewTransaction, "id">>,
	): Promise<Transaction | null> {
		const result = await this.db
			.update(transactions)
			.set({ ...data, updatedAt: new Date() })
			.where(eq(transactions.id, id))
			.returning();
		return result[0] ?? null;
	}

	async deleteTransaction(id: string): Promise<boolean> {
		const result = await this.db
			.delete(transactions)
			.where(eq(transactions.id, id))
			.returning();
		return result.length > 0;
	}

	async updateInventoryItemManualCount(
		itemId: string,
		manualCount: number,
	): Promise<InventoryItem | null> {
		const result = await this.db
			.update(inventoryItems)
			.set({ manualCount, updatedAt: new Date() })
			.where(eq(inventoryItems.id, itemId))
			.returning();
		return result[0] ?? null;
	}

	// ==================== Inventory-Transaction Junction Methods ====================
	async linkInventoryItemToTransaction(
		itemId: string,
		transactionId: string,
		quantity = 1,
	): Promise<InventoryItemTransaction> {
		const result = await this.db
			.insert(inventoryItemTransactions)
			.values({
				inventoryItemId: itemId,
				transactionId,
				quantity,
			})
			.returning();
		return result[0];
	}

	async unlinkInventoryItemFromTransaction(
		itemId: string,
		transactionId: string,
	): Promise<boolean> {
		const result = await this.db
			.delete(inventoryItemTransactions)
			.where(
				and(
					eq(inventoryItemTransactions.inventoryItemId, itemId),
					eq(inventoryItemTransactions.transactionId, transactionId),
				),
			)
			.returning();
		return result.length > 0;
	}

	async getTransactionsForInventoryItem(
		itemId: string,
	): Promise<Transaction[]> {
		const links = await this.db
			.select()
			.from(inventoryItemTransactions)
			.where(eq(inventoryItemTransactions.inventoryItemId, itemId));
		if (links.length === 0) return [];
		const transactionIds = links.map((l) => l.transactionId);
		const result: Transaction[] = [];
		for (const tid of transactionIds) {
			const t = await this.db
				.select()
				.from(transactions)
				.where(eq(transactions.id, tid))
				.limit(1);
			if (t[0]) result.push(t[0]);
		}
		return result;
	}

	async getInventoryItemsForTransaction(
		transactionId: string,
	): Promise<(InventoryItem & { quantity: number })[]> {
		const links = await this.db
			.select()
			.from(inventoryItemTransactions)
			.where(eq(inventoryItemTransactions.transactionId, transactionId));
		if (links.length === 0) return [];
		const result: (InventoryItem & { quantity: number })[] = [];
		for (const link of links) {
			const item = await this.db
				.select()
				.from(inventoryItems)
				.where(eq(inventoryItems.id, link.inventoryItemId))
				.limit(1);
			if (item[0]) result.push({ ...item[0], quantity: link.quantity });
		}
		return result;
	}

	async getActiveInventoryItemsForTransaction(
		transactionId: string,
	): Promise<(InventoryItem & { quantity: number })[]> {
		const allItems = await this.getInventoryItemsForTransaction(transactionId);
		// Filter to only include active items (non-removed, non-legacy)
		return allItems.filter((item) => item.status === "active");
	}

	// ==================== Submission Methods ====================
	async getSubmissions(): Promise<Submission[]> {
		return this.db.select().from(submissions);
	}

	async getSubmissionById(id: string): Promise<Submission | null> {
		const result = await this.db
			.select()
			.from(submissions)
			.where(eq(submissions.id, id))
			.limit(1);
		return result[0] ?? null;
	}

	async createSubmission(submission: NewSubmission): Promise<Submission> {
		const result = await this.db
			.insert(submissions)
			.values(submission)
			.returning();
		return result[0];
	}



	async updateSubmissionStatus(
		id: string,
		status: SubmissionStatus,
	): Promise<Submission | null> {
		const result = await this.db
			.update(submissions)
			.set({ status, updatedAt: new Date() })
			.where(eq(submissions.id, id))
			.returning();
		return result[0] ?? null;
	}

	async deleteSubmission(id: string): Promise<boolean> {
		const result = await this.db
			.delete(submissions)
			.where(eq(submissions.id, id))
			.returning();
		return result.length > 0;
	}

	// ==================== Minute Methods ====================
	async getMinutes(year?: number): Promise<Minute[]> {
		if (year) {
			return this.db
				.select()
				.from(minutes)
				.where(eq(minutes.year, year))
				.orderBy(desc(minutes.date));
		}
		return this.db.select().from(minutes).orderBy(desc(minutes.date));
	}

	async getMinuteById(id: string): Promise<Minute | null> {
		const result = await this.db
			.select()
			.from(minutes)
			.where(eq(minutes.id, id))
			.limit(1);
		return result[0] ?? null;
	}

	async createMinute(minute: NewMinute): Promise<Minute> {
		const result = await this.db.insert(minutes).values(minute).returning();
		return result[0];
	}

	async updateMinute(
		id: string,
		data: Partial<Omit<NewMinute, "id">>,
	): Promise<Minute | null> {
		const result = await this.db
			.update(minutes)
			.set({ ...data, updatedAt: new Date() })
			.where(eq(minutes.id, id))
			.returning();
		return result[0] ?? null;
	}

	async deleteMinute(id: string): Promise<boolean> {
		const result = await this.db
			.delete(minutes)
			.where(eq(minutes.id, id))
			.returning();
		return result.length > 0;
	}

	// ==================== Minute Link Methods ====================
	async createMinuteLink(link: NewMinuteLink): Promise<MinuteLink> {
		const result = await this.db
			.insert(minuteLinks)
			.values(link)
			.returning();
		return result[0];
	}

	async deleteMinuteLink(id: string): Promise<boolean> {
		const result = await this.db
			.delete(minuteLinks)
			.where(eq(minuteLinks.id, id))
			.returning();
		return result.length > 0;
	}

	async getMinuteLinks(minuteId: string): Promise<MinuteLink[]> {
		return this.db
			.select()
			.from(minuteLinks)
			.where(eq(minuteLinks.minuteId, minuteId));
	}

	async getMinuteLinkByPurchaseId(purchaseId: string): Promise<MinuteLink | null> {
		const result = await this.db
			.select()
			.from(minuteLinks)
			.where(eq(minuteLinks.purchaseId, purchaseId))
			.limit(1);
		return result[0] ?? null;
	}

	async getMinuteLinkByNewsId(newsId: string): Promise<MinuteLink | null> {
		const result = await this.db
			.select()
			.from(minuteLinks)
			.where(eq(minuteLinks.newsId, newsId))
			.limit(1);
		return result[0] ?? null;
	}

	async getMinuteLinkByFaqId(faqId: string): Promise<MinuteLink | null> {
		const result = await this.db
			.select()
			.from(minuteLinks)
			.where(eq(minuteLinks.faqId, faqId))
			.limit(1);
		return result[0] ?? null;
	}

	async getMinuteLinkByInventoryItemId(
		inventoryItemId: string,
	): Promise<MinuteLink | null> {
		const result = await this.db
			.select()
			.from(minuteLinks)
			.where(eq(minuteLinks.inventoryItemId, inventoryItemId))
			.limit(1);
		return result[0] ?? null;
	}



	// ==================== Social Link Methods ====================
	async getSocialLinks(): Promise<SocialLink[]> {
		return this.db.select().from(socialLinks);
	}

	async getSocialLinkById(id: string): Promise<SocialLink | null> {
		const result = await this.db
			.select()
			.from(socialLinks)
			.where(eq(socialLinks.id, id))
			.limit(1);
		return result[0] ?? null;
	}

	async getPrimarySocialLink(): Promise<SocialLink | null> {
		const result = await this.db
			.select()
			.from(socialLinks)
			.where(eq(socialLinks.isPrimary, true))
			.limit(1);
		return result[0] ?? null;
	}

	async createSocialLink(link: NewSocialLink): Promise<SocialLink> {
		const result = await this.db.insert(socialLinks).values(link).returning();
		return result[0];
	}

	async updateSocialLink(
		id: string,
		data: Partial<Omit<NewSocialLink, "id">>,
	): Promise<SocialLink | null> {
		const result = await this.db
			.update(socialLinks)
			.set({ ...data, updatedAt: new Date() })
			.where(eq(socialLinks.id, id))
			.returning();
		return result[0] ?? null;
	}

	async deleteSocialLink(id: string): Promise<boolean> {
		const result = await this.db
			.delete(socialLinks)
			.where(eq(socialLinks.id, id))
			.returning();
		return result.length > 0;
	}

	async setPrimarySocialLink(id: string): Promise<void> {
		// First, clear isPrimary from all links
		await this.db
			.update(socialLinks)
			.set({ isPrimary: false, updatedAt: new Date() });
		// Then set the specified link as primary
		await this.db
			.update(socialLinks)
			.set({ isPrimary: true, updatedAt: new Date() })
			.where(eq(socialLinks.id, id));
	}

	// ==================== News Methods ====================
	async getNews(): Promise<News[]> {
		return this.db
			.select()
			.from(news)
			.orderBy(desc(news.createdAt));
	}

	async getNewsById(id: string): Promise<News | null> {
		const result = await this.db
			.select()
			.from(news)
			.where(eq(news.id, id))
			.limit(1);
		return result[0] ?? null;
	}

	async createNews(item: NewNews): Promise<News> {
		const result = await this.db.insert(news).values(item).returning();
		return result[0];
	}

	async updateNews(
		id: string,
		data: Partial<Omit<NewNews, "id">>,
	): Promise<News | null> {
		const result = await this.db
			.update(news)
			.set({ ...data, updatedAt: new Date() })
			.where(eq(news.id, id))
			.returning();
		return result[0] ?? null;
	}

	async deleteNews(id: string): Promise<boolean> {
		const result = await this.db
			.delete(news)
			.where(eq(news.id, id))
			.returning();
		return result.length > 0;
	}

	// ==================== FAQ Methods ====================
	async getFaqs(): Promise<Faq[]> {
		return this.db
			.select()
			.from(faq)
			.orderBy(asc(faq.sortOrder), desc(faq.createdAt));
	}

	async getFaqById(id: string): Promise<Faq | null> {
		const result = await this.db
			.select()
			.from(faq)
			.where(eq(faq.id, id))
			.limit(1);
		return result[0] ?? null;
	}

	async createFaq(item: NewFaq): Promise<Faq> {
		const result = await this.db.insert(faq).values(item).returning();
		return result[0];
	}

	async updateFaq(
		id: string,
		data: Partial<Omit<NewFaq, "id">>,
	): Promise<Faq | null> {
		const result = await this.db
			.update(faq)
			.set({ ...data, updatedAt: new Date() })
			.where(eq(faq.id, id))
			.returning();
		return result[0] ?? null;
	}

	async deleteFaq(id: string): Promise<boolean> {
		const result = await this.db
			.delete(faq)
			.where(eq(faq.id, id))
			.returning();
		return result.length > 0;
	}

	// ==================== App Settings Methods ====================
	async getSetting(key: string): Promise<string | null> {
		const result = await this.db
			.select()
			.from(appSettings)
			.where(eq(appSettings.key, key))
			.limit(1);
		return result[0]?.value ?? null;
	}

	async setSetting(
		key: string,
		value: string,
		description?: string,
	): Promise<AppSetting> {
		const existing = await this.db
			.select()
			.from(appSettings)
			.where(eq(appSettings.key, key))
			.limit(1);
		if (existing.length > 0) {
			const result = await this.db
				.update(appSettings)
				.set({ value, description, updatedAt: new Date() })
				.where(eq(appSettings.key, key))
				.returning();
			return result[0];
		}
		const result = await this.db
			.insert(appSettings)
			.values({ key, value, description })
			.returning();
		return result[0];
	}

	async getAllSettings(): Promise<AppSetting[]> {
		return this.db.select().from(appSettings);
	}

	async deleteSetting(key: string): Promise<boolean> {
		const result = await this.db
			.delete(appSettings)
			.where(eq(appSettings.key, key))
			.returning();
		return result.length > 0;
	}

	// ==================== Committee Mail Methods ====================
	async insertCommitteeMailMessage(
		message: NewCommitteeMailMessage,
	): Promise<CommitteeMailMessage> {
		const result = await this.db
			.insert(committeeMailMessages)
			.values(message)
			.returning();
		return result[0];
	}

	async getCommitteeMailMessages(
		direction: "sent" | "inbox",
		limit = 50,
		offset = 0,
	): Promise<CommitteeMailMessage[]> {
		return this.db
			.select()
			.from(committeeMailMessages)
			.where(eq(committeeMailMessages.direction, direction))
			.orderBy(desc(committeeMailMessages.date))
			.limit(limit)
			.offset(offset);
	}

	async getCommitteeMailMessageById(
		id: string,
	): Promise<CommitteeMailMessage | null> {
		const result = await this.db
			.select()
			.from(committeeMailMessages)
			.where(eq(committeeMailMessages.id, id));
		return result[0] ?? null;
	}

	async committeeMailMessageExistsByMessageId(
		messageId: string,
	): Promise<boolean> {
		const result = await this.db
			.select()
			.from(committeeMailMessages)
			.where(eq(committeeMailMessages.messageId, messageId));
		return result.length > 0;
	}

	async deleteCommitteeMailMessage(id: string): Promise<boolean> {
		const result = await this.db
			.delete(committeeMailMessages)
			.where(eq(committeeMailMessages.id, id))
			.returning();
		return result.length > 0;
	}

	async getCommitteeMailMessagesByThreadId(
		threadId: string,
	): Promise<CommitteeMailMessage[]> {
		return this.db
			.select()
			.from(committeeMailMessages)
			.where(eq(committeeMailMessages.threadId, threadId))
			.orderBy(asc(committeeMailMessages.date));
	}

	async getCommitteeMailThreads(
		direction?: "sent" | "inbox",
		limit = 50,
		offset = 0,
	): Promise<
		{
			threadId: string;
			latestMessage: CommitteeMailMessage;
			messageCount: number;
		}[]
	> {
		const conditions = direction
			? [eq(committeeMailMessages.direction, direction)]
			: [];
		const allMessages = await this.db
			.select()
			.from(committeeMailMessages)
			.where(conditions.length > 0 ? conditions[0] : undefined)
			.orderBy(desc(committeeMailMessages.date));

		const threadMap = new Map<
			string,
			{ latestMessage: CommitteeMailMessage; messageCount: number }
		>();
		for (const msg of allMessages) {
			const tid = msg.threadId || msg.id;
			const existing = threadMap.get(tid);
			if (!existing) {
				threadMap.set(tid, { latestMessage: msg, messageCount: 1 });
			} else {
				existing.messageCount++;
			}
		}

		const threads = Array.from(threadMap.entries())
			.map(([threadId, data]) => ({ threadId, ...data }))
			.sort(
				(a, b) =>
					new Date(b.latestMessage.date).getTime() -
					new Date(a.latestMessage.date).getTime(),
			)
			.slice(offset, offset + limit);

		return threads;
	}

	async getCommitteeMailMessageByMessageId(
		messageId: string,
	): Promise<CommitteeMailMessage | null> {
		const result = await this.db
			.select()
			.from(committeeMailMessages)
			.where(eq(committeeMailMessages.messageId, messageId))
			.limit(1);
		return result[0] || null;
	}

	// ==================== Mail Drafts Methods ====================
	async insertMailDraft(draft: NewMailDraft): Promise<MailDraft> {
		const result = await this.db
			.insert(mailDrafts)
			.values(draft)
			.returning();
		return result[0];
	}

	async updateMailDraft(
		id: string,
		data: Partial<Omit<NewMailDraft, "id" | "createdAt">>,
	): Promise<MailDraft | null> {
		const result = await this.db
			.update(mailDrafts)
			.set({ ...data, updatedAt: new Date() })
			.where(eq(mailDrafts.id, id))
			.returning();
		return result[0] ?? null;
	}

	async getMailDrafts(limit = 50): Promise<MailDraft[]> {
		return this.db
			.select()
			.from(mailDrafts)
			.orderBy(desc(mailDrafts.updatedAt))
			.limit(limit);
	}

	async getMailDraftById(id: string): Promise<MailDraft | null> {
		const result = await this.db
			.select()
			.from(mailDrafts)
			.where(eq(mailDrafts.id, id));
		return result[0] ?? null;
	}

	async deleteMailDraft(id: string): Promise<boolean> {
		const result = await this.db
			.delete(mailDrafts)
			.where(eq(mailDrafts.id, id))
			.returning();
		return result.length > 0;
	}

	// ==================== Message Methods ====================
	async createMessage(message: NewMessage): Promise<Message> {
		const result = await this.db
			.insert(messages)
			.values(message)
			.returning();
		return result[0];
	}

	async getMessagesByUserId(
		userId: string,
		limit?: number,
		offset?: number,
	): Promise<Message[]> {
		const query = this.db
			.select()
			.from(messages)
			.where(eq(messages.userId, userId))
			.orderBy(desc(messages.createdAt))
			.$dynamic();

		if (limit !== undefined) {
			return query.limit(limit).offset(offset ?? 0);
		}
		if (offset !== undefined) {
			return query.offset(offset);
		}
		return query;
	}

	async getUnreadMessageCount(userId: string): Promise<number> {
		const result = await this.db
			.select()
			.from(messages)
			.where(and(eq(messages.userId, userId), eq(messages.read, false)));
		return result.length;
	}

	async markMessageAsRead(messageId: string): Promise<Message | null> {
		const result = await this.db
			.update(messages)
			.set({ read: true, readAt: new Date(), updatedAt: new Date() })
			.where(eq(messages.id, messageId))
			.returning();
		return result[0] ?? null;
	}

	async markMessageAsUnread(messageId: string): Promise<Message | null> {
		const result = await this.db
			.update(messages)
			.set({ read: false, readAt: null, updatedAt: new Date() })
			.where(eq(messages.id, messageId))
			.returning();
		return result[0] ?? null;
	}

	async markAllMessagesAsRead(userId: string): Promise<number> {
		const result = await this.db
			.update(messages)
			.set({ read: true, readAt: new Date(), updatedAt: new Date() })
			.where(and(eq(messages.userId, userId), eq(messages.read, false)))
			.returning();
		return result.length;
	}

	// ==================== Fund Budget Methods ====================
	async getFundBudgets(): Promise<FundBudget[]> {
		return this.db
			.select()
			.from(fundBudgets)
			.orderBy(desc(fundBudgets.createdAt));
	}

	async getFundBudgetsByYear(year: number): Promise<FundBudget[]> {
		return this.db
			.select()
			.from(fundBudgets)
			.where(eq(fundBudgets.year, year))
			.orderBy(desc(fundBudgets.createdAt));
	}

	async getFundBudgetById(id: string): Promise<FundBudget | null> {
		const result = await this.db
			.select()
			.from(fundBudgets)
			.where(eq(fundBudgets.id, id))
			.limit(1);
		return result[0] ?? null;
	}

	async getOpenFundBudgetsByYear(year: number): Promise<FundBudget[]> {
		return this.db
			.select()
			.from(fundBudgets)
			.where(
				and(
					eq(fundBudgets.year, year),
					eq(fundBudgets.status, "open"),
				),
			)
			.orderBy(desc(fundBudgets.createdAt));
	}

	async createFundBudget(
		budget: NewFundBudget,
	): Promise<FundBudget> {
		const result = await this.db
			.insert(fundBudgets)
			.values(budget)
			.returning();
		return result[0];
	}

	async updateFundBudget(
		id: string,
		data: Partial<Omit<NewFundBudget, "id">>,
	): Promise<FundBudget | null> {
		const result = await this.db
			.update(fundBudgets)
			.set({ ...data, updatedAt: new Date() })
			.where(eq(fundBudgets.id, id))
			.returning();
		return result[0] ?? null;
	}

	async deleteFundBudget(id: string): Promise<boolean> {
		// Check if there are linked transactions
		const links = await this.db
			.select()
			.from(budgetTransactions)
			.where(eq(budgetTransactions.budgetId, id));

		if (links.length > 0) {
			return false; // Cannot delete if there are linked transactions
		}

		const result = await this.db
			.delete(fundBudgets)
			.where(eq(fundBudgets.id, id))
			.returning();
		return result.length > 0;
	}

	async linkTransactionToBudget(
		transactionId: string,
		budgetId: string,
		amount: string,
	): Promise<BudgetTransaction> {
		const result = await this.db
			.insert(budgetTransactions)
			.values({
				transactionId,
				budgetId,
				amount,
			})
			.returning();
		return result[0];
	}

	async unlinkTransactionFromBudget(
		transactionId: string,
		budgetId: string,
	): Promise<boolean> {
		const result = await this.db
			.delete(budgetTransactions)
			.where(
				and(
					eq(budgetTransactions.transactionId, transactionId),
					eq(budgetTransactions.budgetId, budgetId),
				),
			)
			.returning();
		return result.length > 0;
	}

	async getBudgetTransactions(
		budgetId: string,
	): Promise<{ transaction: Transaction; amount: string }[]> {
		const links = await this.db
			.select()
			.from(budgetTransactions)
			.where(eq(budgetTransactions.budgetId, budgetId));

		if (links.length === 0) return [];

		const result: { transaction: Transaction; amount: string }[] = [];
		for (const link of links) {
			const txResult = await this.db
				.select()
				.from(transactions)
				.where(eq(transactions.id, link.transactionId))
				.limit(1);
			if (txResult[0]) {
				result.push({
					transaction: txResult[0],
					amount: link.amount,
				});
			}
		}

		return result;
	}

	async getBudgetUsedAmount(budgetId: string): Promise<number> {
		const links = await this.db
			.select({ amount: budgetTransactions.amount })
			.from(budgetTransactions)
			.innerJoin(
				transactions,
				eq(budgetTransactions.transactionId, transactions.id),
			)
			.where(
				and(
					eq(budgetTransactions.budgetId, budgetId),
					eq(transactions.status, "complete"),
				),
			);

		return links.reduce((sum, link) => sum + parseFloat(link.amount), 0);
	}

	async getBudgetReservedAmount(budgetId: string): Promise<number> {
		const links = await this.db
			.select({ amount: budgetTransactions.amount })
			.from(budgetTransactions)
			.innerJoin(
				transactions,
				eq(budgetTransactions.transactionId, transactions.id),
			)
			.where(
				and(
					eq(budgetTransactions.budgetId, budgetId),
					eq(transactions.status, "pending"),
				),
			);

		return links.reduce((sum, link) => sum + parseFloat(link.amount), 0);
	}

	async getAvailableFundsForYear(year: number): Promise<number> {
		// Get all transactions for the year
		const yearTransactions = await this.getTransactionsByYear(year);

		// Filter out pending/declined reimbursements (same logic as treasury.tsx)
		const validTransactions = yearTransactions.filter(
			(t) =>
				!t.reimbursementStatus ||
				t.reimbursementStatus === "not_requested" ||
				t.reimbursementStatus === "approved",
		);

		// Get all transaction IDs that are linked to budgets
		// These should be excluded from expenses calculation to avoid double-counting
		const allBudgets = await this.getFundBudgetsByYear(year);
		const budgetLinkedTransactionIds = new Set<string>();
		for (const budget of allBudgets) {
			const budgetTxs = await this.getBudgetTransactions(budget.id);
			for (const { transaction } of budgetTxs) {
				budgetLinkedTransactionIds.add(transaction.id);
			}
		}

		// Calculate balance (excluding budget-linked expenses)
		const income = validTransactions
			.filter((t) => t.type === "income")
			.reduce((sum, t) => sum + parseFloat(t.amount), 0);
		const expenses = validTransactions
			.filter((t) => t.type === "expense" && !budgetLinkedTransactionIds.has(t.id))
			.reduce((sum, t) => sum + parseFloat(t.amount), 0);
		const balance = income - expenses;

		// Get open budgets for the year
		const openBudgets = await this.getOpenFundBudgetsByYear(year);

		// Calculate total reserved (budget amount - used amount)
		let totalReserved = 0;
		for (const budget of openBudgets) {
			const usedAmount = await this.getBudgetUsedAmount(budget.id);
			const remainingReserved = parseFloat(budget.amount) - usedAmount;
			totalReserved += Math.max(0, remainingReserved);
		}

		return balance - totalReserved;
	}

	async getBudgetForTransaction(
		transactionId: string,
	): Promise<{ budget: FundBudget; amount: string } | null> {
		const link = await this.db
			.select()
			.from(budgetTransactions)
			.where(eq(budgetTransactions.transactionId, transactionId))
			.limit(1);

		if (link.length === 0) return null;

		const budget = await this.getFundBudgetById(link[0].budgetId);
		if (!budget) return null;

		return {
			budget,
			amount: link[0].amount,
		};
	}

	// ==================== Poll Methods ====================
	async getPolls(year?: number): Promise<Poll[]> {
		if (year !== undefined) {
			return this.db
				.select()
				.from(polls)
				.where(eq(polls.year, year))
				.orderBy(desc(polls.createdAt));
		}
		return this.db.select().from(polls).orderBy(desc(polls.createdAt));
	}

	async getPollById(id: string): Promise<Poll | null> {
		const result = await this.db
			.select()
			.from(polls)
			.where(eq(polls.id, id))
			.limit(1);
		return result[0] ?? null;
	}

	async getActivePolls(year?: number): Promise<Poll[]> {
		if (year !== undefined) {
			return this.db
				.select()
				.from(polls)
				.where(and(eq(polls.status, "active"), eq(polls.year, year)))
				.orderBy(desc(polls.createdAt));
		}
		return this.db
			.select()
			.from(polls)
			.where(eq(polls.status, "active"))
			.orderBy(desc(polls.createdAt));
	}

	async createPoll(poll: NewPoll): Promise<Poll> {
		const result = await this.db.insert(polls).values(poll).returning();
		return result[0];
	}

	async updatePoll(
		id: string,
		data: Partial<Omit<NewPoll, "id">>,
	): Promise<Poll | null> {
		const result = await this.db
			.update(polls)
			.set({ ...data, updatedAt: new Date() })
			.where(eq(polls.id, id))
			.returning();
		return result[0] ?? null;
	}

	async deletePoll(id: string): Promise<boolean> {
		const result = await this.db
			.delete(polls)
			.where(eq(polls.id, id))
			.returning();
		return result.length > 0;
	}

	// ==================== Receipt Methods ====================
	async getReceipts(): Promise<Receipt[]> {
		return this.db
			.select()
			.from(receipts)
			.orderBy(desc(receipts.createdAt));
	}

	async getReceiptById(id: string): Promise<Receipt | null> {
		const result = await this.db
			.select()
			.from(receipts)
			.where(eq(receipts.id, id))
			.limit(1);
		return result[0] ?? null;
	}

	async getReceiptsByPurchaseId(purchaseId: string): Promise<Receipt[]> {
		return this.db
			.select()
			.from(receipts)
			.where(eq(receipts.purchaseId, purchaseId))
			.orderBy(desc(receipts.createdAt));
	}

	async getReceiptsUnlinked(): Promise<Receipt[]> {
		return this.db
			.select()
			.from(receipts)
			.where(isNull(receipts.purchaseId))
			.orderBy(desc(receipts.createdAt));
	}

	async createReceipt(receipt: NewReceipt): Promise<Receipt> {
		const result = await this.db
			.insert(receipts)
			.values(receipt)
			.returning();
		return result[0];
	}

	async updateReceipt(
		id: string,
		data: Partial<Omit<NewReceipt, "id">>,
	): Promise<Receipt | null> {
		const result = await this.db
			.update(receipts)
			.set({ ...data, updatedAt: new Date() })
			.where(eq(receipts.id, id))
			.returning();
		return result[0] ?? null;
	}

	async deleteReceipt(id: string): Promise<boolean> {
		const result = await this.db
			.delete(receipts)
			.where(eq(receipts.id, id))
			.returning();
		return result.length > 0;
	}

	// ==================== Receipt Content Methods (OCR) ====================
	async getReceiptContentByReceiptId(
		receiptId: string,
	): Promise<ReceiptContent | null> {
		const result = await this.db
			.select()
			.from(receiptContents)
			.where(eq(receiptContents.receiptId, receiptId))
			.limit(1);
		return result[0] ?? null;
	}

	async getReceiptContentsByReceiptIds(
		receiptIds: string[],
	): Promise<ReceiptContent[]> {
		if (receiptIds.length === 0) return [];
		return this.db
			.select()
			.from(receiptContents)
			.where(inArray(receiptContents.receiptId, receiptIds));
	}

	async createReceiptContent(
		content: NewReceiptContent,
	): Promise<ReceiptContent> {
		const result = await this.db
			.insert(receiptContents)
			.values(content)
			.returning();
		return result[0];
	}

	async deleteReceiptContent(id: string): Promise<boolean> {
		const result = await this.db
			.delete(receiptContents)
			.where(eq(receiptContents.id, id))
			.returning();
		return result.length > 0;
	}

	async updateReceiptContent(
		id: string,
		updates: Partial<Omit<NewReceiptContent, "id" | "receiptId">>,
	): Promise<ReceiptContent | null> {
		const result = await this.db
			.update(receiptContents)
			.set({ ...updates, updatedAt: new Date() })
			.where(eq(receiptContents.id, id))
			.returning();
		return result[0] ?? null;
	}

	async getReceiptsForPurchase(purchaseId: string): Promise<Receipt[]> {
		return this.db
			.select()
			.from(receipts)
			.where(eq(receipts.purchaseId, purchaseId));
	}

	async getIncompleteInventoryItems(): Promise<InventoryItem[]> {
		return this.db
			.select()
			.from(inventoryItems)
			.where(eq(inventoryItems.needsCompletion, true))
			.orderBy(desc(inventoryItems.createdAt));
	}

	async getAppSetting(key: string): Promise<AppSetting | null> {
		const result = await this.db
			.select()
			.from(appSettings)
			.where(eq(appSettings.key, key))
			.limit(1);
		return result[0] ?? null;
	}
}
