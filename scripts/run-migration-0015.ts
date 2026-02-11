import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
	console.error("DATABASE_URL environment variable is required");
	process.exit(1);
}

async function runMigration() {
	if (!DATABASE_URL) {
		throw new Error("DATABASE_URL is required");
	}
	const sql = postgres(DATABASE_URL);

	try {
		console.log("Reading migration file...");
		const migrationPath = join(
			process.cwd(),
			"drizzle",
			"0015_rename_treasury_permissions.sql",
		);
		const migrationSQL = readFileSync(migrationPath, "utf-8");

		console.log("Executing migration...");
		await sql.unsafe(migrationSQL);

		console.log("✓ Migration completed successfully!");
	} catch (error) {
		console.error("✗ Migration failed:", error);
		process.exit(1);
	} finally {
		await sql.end();
	}
}

runMigration();
