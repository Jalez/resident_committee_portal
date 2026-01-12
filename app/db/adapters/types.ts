import type { User, NewUser } from "../schema";

/**
 * Database adapter interface
 * Implement this interface to support different database backends
 */
export interface DatabaseAdapter {
	/**
	 * Find a user by their email address
	 */
	findUserByEmail(email: string): Promise<User | null>;

	/**
	 * Find a user by their ID
	 */
	findUserById(id: string): Promise<User | null>;

	/**
	 * Create a new user
	 */
	createUser(user: NewUser): Promise<User>;

	/**
	 * Update an existing user
	 */
	updateUser(id: string, data: Partial<Omit<NewUser, "id">>): Promise<User | null>;

	/**
	 * Delete a user by ID
	 */
	deleteUser(id: string): Promise<boolean>;

	/**
	 * Get all users (with optional pagination)
	 */
	getAllUsers(limit?: number, offset?: number): Promise<User[]>;

	/**
	 * Find or create a user by email (upsert-like behavior)
	 * Useful for OAuth flows where user might already exist
	 */
	upsertUser(user: NewUser): Promise<User>;
}
