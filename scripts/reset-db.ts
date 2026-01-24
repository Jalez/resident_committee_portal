/**
 * Database Reset Script
 *
 * 1. Drops and recreates the public schema (wiping all data)
 * 2. Pushes the Drizzle schema to the database
 * 3. Seeds the initial RBAC roles
 *
 * Run with: bun run scripts/reset-db.ts
 */

import "dotenv/config";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
	console.error("❌ DATABASE_URL environment variable is required");
	process.exit(1);
}

const sql = postgres(connectionString);

async function reset() {
	console.log("🔥 Starting Database Reset...\n");

	try {
		// 1. Drop and recreate schema
		console.log("🗑️  Dropping all data...");
		await sql`DROP SCHEMA public CASCADE`;
		await sql`CREATE SCHEMA public`;
		console.log("   ✓ Public schema recreated");

		// 2. Push schema
		console.log("\n🏗️  Pushing schema to database...");
		const proc = Bun.spawn(["bun", "run", "db:push"], {
			stdout: "inherit",
			stderr: "inherit",
		});
		await proc.exited;

		if (proc.exitCode !== 0) {
			throw new Error("Schema push failed");
		}
		console.log("   ✓ Schema applied");

		// 3. Seed RBAC
		console.log("\n🌱 Seeding initial roles...");
		const seedProc = Bun.spawn(["bun", "run", "scripts/seed-rbac.ts"], {
			stdout: "inherit",
			stderr: "inherit",
		});
		await seedProc.exited;

		if (seedProc.exitCode !== 0) {
			throw new Error("RBAC seed failed");
		}

		console.log("\n✨ Database successfully reset to pure state!");
		console.log(
			"   The next user to log in with ADMIN_EMAIL will be auto-assigned the Admin role.",
		);
	} catch (error) {
		console.error("\n❌ Reset failed:", error);
		process.exit(1);
	} finally {
		await sql.end();
	}
}

// Confirmation prompt
console.log("⚠️  WARNING: This will DESTROY ALL DATA in the database!");
console.log("   Database:", connectionString.split("@")[1]); // Hide credentials
console.log("\nPress Ctrl+C to cancel in 3 seconds...");

setTimeout(() => {
	reset();
}, 3000);
