import "dotenv/config";
import { readMigrationFiles } from "drizzle-orm/migrator";
import postgres from "postgres";

type JournalEntry = {
	idx: number;
	version: string;
	when: number;
	tag: string;
	breakpoints: boolean;
};

type Journal = {
	version: string;
	dialect: string;
	entries: JournalEntry[];
};

function parseArgs() {
	const args = process.argv.slice(2);
	return {
		execute: args.includes("--execute"),
		urlEnv:
			args.find((a) => a.startsWith("--url-env="))?.split("=")[1] ||
			"DATABASE_URL",
	};
}

async function ensureMigrationsTable(sql: postgres.Sql) {
	await sql`CREATE SCHEMA IF NOT EXISTS drizzle`;
	await sql`
		CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
			id SERIAL PRIMARY KEY,
			hash text NOT NULL UNIQUE,
			created_at bigint
		)
	`;
}

async function main() {
	const { execute, urlEnv } = parseArgs();
	const url = process.env[urlEnv];

	if (!url) {
		console.error(`Missing ${urlEnv} environment variable`);
		process.exit(1);
	}

	const migrations = readMigrationFiles({ migrationsFolder: "./drizzle" });
	const journal = (await import("../drizzle/meta/_journal.json")) as Journal;
	const tagByWhen = new Map<number, string>(
		journal.entries.map((e) => [e.when, e.tag]),
	);

	const sql = postgres(url, { max: 1 });

	try {
		await ensureMigrationsTable(sql);

		const existing = await sql.unsafe<
			Array<{ id: number; hash: string; created_at: number | null }>
		>(
			`SELECT id, hash, created_at
			 FROM drizzle.__drizzle_migrations
			 ORDER BY created_at ASC NULLS FIRST, id ASC`,
		);

		const existingHashes = new Set(existing.map((row) => row.hash));

		const missing = migrations
			.filter((m) => !existingHashes.has(m.hash))
			.map((m) => ({
				hash: m.hash,
				createdAt: Number(m.folderMillis),
				tag: tagByWhen.get(Number(m.folderMillis)) || "(unknown tag)",
			}))
			.sort((a, b) => a.createdAt - b.createdAt);

		if (missing.length === 0) {
			console.log("Migration history is aligned. No missing hashes.");
			return;
		}

		console.log(`Found ${missing.length} missing migration hash entries:\n`);
		for (const m of missing) {
			console.log(`- ${m.tag} (${m.createdAt})`);
		}

		if (!execute) {
			console.log(
				"\nDry run only. Re-run with --execute to insert missing hashes.",
			);
			console.log(
				`Example: bun run scripts/repair-migration-history.ts --execute --url-env=${urlEnv}`,
			);
			return;
		}

		for (const m of missing) {
			await sql`
				INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
				SELECT ${m.hash}, ${m.createdAt}
				WHERE NOT EXISTS (
					SELECT 1
					FROM drizzle.__drizzle_migrations
					WHERE hash = ${m.hash}
				)
			`;
			console.log(`Inserted: ${m.tag} (${m.createdAt})`);
		}

		console.log("\nDone. Missing migration history entries were inserted.");
		console.log("Now run: bun run db:migrate");
	} finally {
		await sql.end();
	}
}

main().catch((error) => {
	console.error("repair-migration-history failed:", error);
	process.exit(1);
});
