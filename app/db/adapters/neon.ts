import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import { users, type User, type NewUser } from "../schema";
import type { DatabaseAdapter } from "./types";

/**
 * Neon PostgreSQL database adapter using Drizzle ORM
 * Uses serverless HTTP connection (ideal for Vercel Edge/Serverless)
 */
export class NeonAdapter implements DatabaseAdapter {
	private db: ReturnType<typeof drizzle>;

	constructor(connectionString: string) {
		const sql = neon(connectionString);
		this.db = drizzle(sql);
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
				// Don't overwrite role and apartment if they exist
				...(user.role && { role: user.role }),
				...(user.apartmentNumber && { apartmentNumber: user.apartmentNumber }),
			});
			return updated!;
		}
		return this.createUser(user);
	}
}
