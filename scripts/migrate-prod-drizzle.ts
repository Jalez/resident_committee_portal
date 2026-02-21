/**
 * Run Drizzle migrations against the production database.
 *
 * Usage: bun run scripts/migrate-prod-drizzle.ts
 *
 * Reads DATABASE_URL_PROD from .env and runs all pending drizzle migrations.
 */

import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL_PROD;
if (!url) {
	console.error("DATABASE_URL_PROD is not set in .env");
	process.exit(1);
}

console.log(`Connecting to prod: ${url.substring(0, 40)}...`);

const sql = postgres(url, { max: 1 });
const db = drizzle(sql);

try {
	console.log("Running migrations...");
	await migrate(db, { migrationsFolder: "./drizzle" });
	console.log("Migrations completed successfully!");
} catch (error) {
	console.error("Migration failed:", error);
	process.exit(1);
} finally {
	await sql.end();
}
