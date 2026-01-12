import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { users, type User, type NewUser } from "../schema";
import type { DatabaseAdapter } from "./types";

/**
 * Standard PostgreSQL adapter using postgres.js driver
 * Ideal for local development or self-hosted PostgreSQL
 */
export class PostgresAdapter implements DatabaseAdapter {
	private db: ReturnType<typeof drizzle>;
	private client: postgres.Sql;

	constructor(connectionString: string) {
		this.client = postgres(connectionString);
		this.db = drizzle(this.client);
	}

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
			.values({
				...user,
				email: user.email.toLowerCase(),
			})
			.returning();
		return result[0];
	}

	async updateUser(
		id: string,
		data: Partial<Omit<NewUser, "id">>
	): Promise<User | null> {
		const result = await this.db
			.update(users)
			.set({
				...data,
				email: data.email?.toLowerCase(),
				updatedAt: new Date(),
			})
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
		return this.db.select().from(users).limit(limit).offset(offset);
	}

	async upsertUser(user: NewUser): Promise<User> {
		const existing = await this.findUserByEmail(user.email);
		if (existing) {
			const updated = await this.updateUser(existing.id, {
				name: user.name,
				...(user.role && { role: user.role }),
				...(user.apartmentNumber && { apartmentNumber: user.apartmentNumber }),
			});
			return updated!;
		}
		return this.createUser(user);
	}
}
