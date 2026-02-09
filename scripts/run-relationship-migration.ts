import fs from "node:fs";
import path from "node:path";

import dotenv from "dotenv";
import postgres from "postgres";

dotenv.config();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error("Missing DATABASE_URL in .env.");
	process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1 });

const splitStatements = (sqlText: string): string[] => {
	const trimmed = sqlText.trim();
	if (!trimmed) {
		return [];
	}

	if (trimmed.includes("--> statement-breakpoint")) {
		return trimmed
			.split(/\s*--> statement-breakpoint\s*/g)
			.map((statement) => statement.trim())
			.filter(Boolean);
	}

	return trimmed
		.split(";")
		.map((statement) => statement.trim())
		.filter(Boolean);
};

const isIgnorableError = (error: unknown) => {
	if (!error || typeof error !== "object") {
		return false;
	}

	const code = (error as { code?: string }).code;
	return code === "42701" || code === "42P07" || code === "42710";
};

const runStatements = async (label: string, sqlText: string) => {
	const statements = splitStatements(sqlText);
	if (!statements.length) {
		return;
	}

	console.log(`\n==> ${label} (${statements.length} statements)`);
	for (const statement of statements) {
		try {
			await sql.unsafe(statement);
		} catch (error) {
			if (isIgnorableError(error)) {
				console.warn("Skipping already-applied statement.");
				continue;
			}

			throw error;
		}
	}
};

const readSqlFile = (relativePath: string) =>
	fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

const run = async () => {
	try {
		await runStatements(
			"Apply 0022_add_draft_status",
			readSqlFile("drizzle/0022_add_draft_status.sql"),
		);

		await runStatements(
			"Apply 0023_nice_the_executioner",
			readSqlFile("drizzle/0023_nice_the_executioner.sql"),
		);

		await runStatements(
			"Apply 0024_add_entity_relationships",
			readSqlFile("drizzle/0024_add_entity_relationships.sql"),
		);

		await runStatements(
			"Migrate legacy relationships",
			`
				INSERT INTO entity_relationships (id, relation_a_type, relation_a_id, relation_b_type, relation_b_id, created_by, created_at)
				SELECT 
					gen_random_uuid(),
					'transaction',
					t.id,
					'reimbursement',
					t.purchase_id,
					NULL,
					NOW()
				FROM transactions t
				WHERE t.purchase_id IS NOT NULL
				  AND NOT EXISTS (
					SELECT 1 FROM entity_relationships er
					WHERE er.relation_a_type = 'transaction' 
					  AND er.relation_a_id = t.id 
					  AND er.relation_b_type = 'reimbursement'
				  );

				INSERT INTO entity_relationships (id, relation_a_type, relation_a_id, relation_b_type, relation_b_id, created_by, created_at)
				SELECT 
					gen_random_uuid(),
					'receipt',
					r.id,
					'reimbursement',
					r.purchase_id,
					NULL,
					NOW()
				FROM receipts r
				WHERE r.purchase_id IS NOT NULL
				  AND NOT EXISTS (
					SELECT 1 FROM entity_relationships er
					WHERE er.relation_a_type = 'receipt' 
					  AND er.relation_a_id = r.id 
					  AND er.relation_b_type = 'reimbursement'
				  );
			`,
		);

		await runStatements(
			"Apply 0025_remove_legacy_relationships",
			readSqlFile("drizzle/0025_remove_legacy_relationships.sql"),
		);

		console.log("\n==> Verification");
		const verificationRows = await sql.unsafe(`
			SELECT 'transactions.purchase_id exists' as check_name, 
			       COUNT(*) as result 
			FROM information_schema.columns 
			WHERE table_name = 'transactions' AND column_name = 'purchase_id'
			UNION ALL
			SELECT 'receipts.purchase_id exists', 
			       COUNT(*) 
			FROM information_schema.columns 
			WHERE table_name = 'receipts' AND column_name = 'purchase_id'
			UNION ALL
			SELECT 'inventory_item_transactions exists', 
			       COUNT(*) 
			FROM information_schema.tables 
			WHERE table_name = 'inventory_item_transactions'
			UNION ALL
			SELECT 'budget_transactions exists', 
			       COUNT(*) 
			FROM information_schema.tables 
			WHERE table_name = 'budget_transactions'
			UNION ALL
			SELECT 'minute_links exists', 
			       COUNT(*) 
			FROM information_schema.tables 
			WHERE table_name = 'minute_links'
			UNION ALL
			SELECT 'entity_relationships count', 
			       COUNT(*)::int 
			FROM entity_relationships;
		`);

		console.table(verificationRows);
	} finally {
		await sql.end({ timeout: 5 });
	}
};

run().catch((error) => {
	console.error("Migration failed:", error);
	process.exit(1);
});
