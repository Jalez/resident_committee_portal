import { NeonAdapter } from "./adapters/neon";
import { PostgresAdapter } from "./adapters/postgres";
import type { DatabaseAdapter } from "./adapters/types";

// Re-export types and schema
export * from "./schema";
export * from "./adapters/types";
export { NeonAdapter } from "./adapters/neon";
export { PostgresAdapter } from "./adapters/postgres";

/**
 * Supported database providers
 * - postgres: Standard PostgreSQL (recommended for local dev)
 * - neon: Neon serverless PostgreSQL (recommended for Vercel production)
 */
export type DatabaseProvider = "postgres" | "neon";

/**
 * Configuration for database connection
 */
interface DatabaseConfig {
	provider: DatabaseProvider;
	connectionString: string;
}

/**
 * Create a database adapter based on configuration
 * This factory function allows easy switching between database providers
 */
export function createDatabaseAdapter(config: DatabaseConfig): DatabaseAdapter {
	switch (config.provider) {
		case "postgres":
			return new PostgresAdapter(config.connectionString);
		case "neon":
			return new NeonAdapter(config.connectionString);
		default:
			throw new Error(`Unsupported database provider: ${config.provider}`);
	}
}

// Singleton instance for the application
let dbInstance: DatabaseAdapter | null = null;

/**
 * Get the database instance
 * Uses environment variables for configuration
 * 
 * Required env vars:
 * - DATABASE_URL: PostgreSQL connection string
 * - DATABASE_PROVIDER: (optional) "postgres" | "neon" (default: "postgres" in dev, "neon" in prod)
 */
export function getDatabase(): DatabaseAdapter {
	if (dbInstance) {
		return dbInstance;
	}

	const connectionString = process.env.DATABASE_URL;
	if (!connectionString) {
		throw new Error("DATABASE_URL environment variable is required");
	}

	// Default to postgres for local dev, neon for production
	const defaultProvider = process.env.NODE_ENV === "production" ? "neon" : "postgres";
	const provider = (process.env.DATABASE_PROVIDER as DatabaseProvider) || defaultProvider;

	dbInstance = createDatabaseAdapter({
		provider,
		connectionString,
	});

	return dbInstance;
}

/**
 * Reset the database instance (useful for testing)
 */
export function resetDatabase(): void {
	dbInstance = null;
}
