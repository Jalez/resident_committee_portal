import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { users, inventoryItems, purchases, budgets, transactions, type User, type NewUser, type InventoryItem, type NewInventoryItem, type Purchase, type NewPurchase, type Budget, type NewBudget, type Transaction, type NewTransaction } from "../schema";
import type { DatabaseAdapter } from "./types";

/**
 * Standard PostgreSQL adapter using postgres.js driver
 */
export class PostgresAdapter implements DatabaseAdapter {
	private db: ReturnType<typeof drizzle>;
	private client: postgres.Sql;

	constructor(connectionString: string) {
		this.client = postgres(connectionString);
		this.db = drizzle(this.client);
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
		return this.createUser(user);
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
		const result = await this.db.delete(inventoryItems).where(eq(inventoryItems.id, id)).returning();
		return result.length > 0;
	}

	async bulkCreateInventoryItems(items: NewInventoryItem[]): Promise<InventoryItem[]> {
		if (items.length === 0) return [];
		return this.db.insert(inventoryItems).values(items).returning();
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
}
