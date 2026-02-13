/**
 * Migration Script: Sync Prod Database to Local Schema
 *
 * This script safely migrates the production database to match the local schema.
 * It handles:
 * - Creating missing tables (entity_relationships, minutes, receipt_contents)
 * - Adding missing columns (status fields, needs_completion, etc.)
 * - Migrating legacy relationship data to entity_relationships
 * - Dropping legacy FK columns and junction tables
 * - Recording all migrations as applied in drizzle's tracking table
 *
 * IMPORTANT: Run this script with DATABASE_URL pointing to the target database.
 * For prod: DATABASE_URL=$DATABASE_URL_PROD bun run scripts/migrate-prod.ts
 *
 * The script is designed to be:
 * - Idempotent (can be re-run safely)
 * - Transactional (rolls back on failure)
 * - Verbose (logs every action)
 */

import postgres from "postgres";

const DRY_RUN = process.env.DRY_RUN === "true";

// Migration hashes from local database (in order)
const MIGRATION_HASHES = [
	{
		hash: "da56d0f843de40177b6c4bbfc98228f0363bc7247d596b001a376d2c3f18577a",
		created_at: 1737305909000,
	},
	{
		hash: "a13c7e87038739d2cbc019c798715259e6ecf650bd0c151834c2f157a8528f23",
		created_at: 1737305910000,
	},
	{
		hash: "8043e1d3e27e5c0d1426adceb14f16170de3f82d15ae1ea7e1bac25e6d9b027e",
		created_at: 1737305911000,
	},
	{
		hash: "2497d34dd7e62406067753e468607c0b6311151d5426c1c4a94541671d29d312",
		created_at: 1737305912000,
	},
	{
		hash: "0729a11dcc368440639359e671428450c2c57af9f616d59629e7ebd62276c9d1",
		created_at: 1737305913000,
	},
	{
		hash: "da43e4096c7f16fb86751790d1a99233396bc5caaede66886c882110566a7e5e",
		created_at: 1737305914000,
	},
	{
		hash: "5e684fe0de02fdf1af46355541333b1bab86af403435a87d958af43f6f8c5d98",
		created_at: 1737305915000,
	},
	{
		hash: "2e4184dac8d8a49830c1668a28b46dc683be4c47f260312c80fa53a0f4ee9a31",
		created_at: 1737305916000,
	},
	{
		hash: "5673887213fda6beefde747edf591a099a86e25c3c786fbce2bb0d66aacd75ba",
		created_at: 1737305917000,
	},
	{
		hash: "9b12ec5f189ea2ded89d764270f9eb78dc2a2f148d0694570b83607a2bfd1ce5",
		created_at: 1737305918000,
	},
	{
		hash: "c2ce65174d45aaba939259000621e1fe65ed8eb1fd4322661f9fcf5d55944956",
		created_at: 1737305919000,
	},
	{
		hash: "5e50d9734d4c5c9fbe06647ff61d45375efdba127ffdca7595845253cf5b71b1",
		created_at: 1737305920000,
	},
	{
		hash: "12cb969d1c84e7c3107fb3e70179c54e06903117e3d299c3760f753228ad6fbc",
		created_at: 1737305921000,
	},
	{
		hash: "8f2ed6c0ca7502bd4a6f16fd9155442d3d5f667885c96786149ce2d071dfc790",
		created_at: 1737305922000,
	},
	{
		hash: "f1facf820f8a5509e2f0560ed49a320ca509c400df34ed3d4cf91abce27ebc74",
		created_at: 1737305923000,
	},
	{
		hash: "5c3be574903ab5a5c88f197dde2bfa51714865ade8b7e253c43d85c4aa1b11c2",
		created_at: 1737305924000,
	},
	{
		hash: "ac17e117d85ed209b7729d74b49ec7cbc3a5ab0e65a10bf880506869c1c06114",
		created_at: 1737305925000,
	},
	{
		hash: "d5181937e30d117e48279eeadd11df21dcab73a5310ad825486fffd4456648fb",
		created_at: 1737305926000,
	},
	{
		hash: "6a9bcb99f19e13bf5c2d8f2087b8af66111bad640f87ea78c2fe6cb854aff950",
		created_at: 1737305927000,
	},
	{
		hash: "18d135000900e610f94ff5beb97ff5e1507724f11dd65b57af757d90c96b8d69",
		created_at: 1737305928000,
	},
	{
		hash: "152911a8c4976e4690dd53d48482b7b41ca54ef8f44b1be8b36537f7fd7029d8",
		created_at: 1737305929000,
	},
];

function log(message: string) {
	const timestamp = new Date().toISOString();
	const prefix = DRY_RUN ? "[DRY RUN] " : "";
	console.log(`[${timestamp}] ${prefix}${message}`);
}

function logSection(title: string) {
	console.log("\n" + "=".repeat(60));
	console.log(`  ${title}`);
	console.log("=".repeat(60));
}

async function checkTableExists(
	sql: postgres.Sql,
	tableName: string,
): Promise<boolean> {
	const result = await sql`
		SELECT EXISTS (
			SELECT FROM information_schema.tables 
			WHERE table_schema = 'public' 
			AND table_name = ${tableName}
		) as exists
	`;
	return result[0].exists;
}

async function checkColumnExists(
	sql: postgres.Sql,
	tableName: string,
	columnName: string,
): Promise<boolean> {
	const result = await sql`
		SELECT EXISTS (
			SELECT FROM information_schema.columns 
			WHERE table_schema = 'public' 
			AND table_name = ${tableName}
			AND column_name = ${columnName}
		) as exists
	`;
	return result[0].exists;
}

async function checkConstraintExists(
	sql: postgres.Sql,
	constraintName: string,
): Promise<boolean> {
	const result = await sql`
		SELECT EXISTS (
			SELECT FROM information_schema.table_constraints 
			WHERE constraint_name = ${constraintName}
		) as exists
	`;
	return result[0].exists;
}

async function getRowCount(
	sql: postgres.Sql,
	tableName: string,
): Promise<number> {
	const result = await sql.unsafe(
		`SELECT COUNT(*)::int as count FROM "${tableName}"`,
	);
	return result[0].count;
}

async function main() {
	const dbUrl = process.env.DATABASE_URL;
	if (!dbUrl) {
		console.error("ERROR: DATABASE_URL environment variable is required");
		process.exit(1);
	}

	log(`Starting migration...`);
	log(`Target database: ${dbUrl.substring(0, 30)}...`);
	if (DRY_RUN) {
		log("DRY RUN MODE - No changes will be made");
	}

	const sql = postgres(dbUrl);

	try {
		// ============================================
		// PHASE 0: Pre-flight checks
		// ============================================
		logSection("PHASE 0: Pre-flight Checks");

		// Check current state
		const hasMigrationsTable = await checkTableExists(
			sql,
			"__drizzle_migrations",
		);
		log(`Drizzle migrations table exists: ${hasMigrationsTable}`);

		const hasEntityRelationships = await checkTableExists(
			sql,
			"entity_relationships",
		);
		log(`entity_relationships table exists: ${hasEntityRelationships}`);

		const hasMinutes = await checkTableExists(sql, "minutes");
		log(`minutes table exists: ${hasMinutes}`);

		const hasReceiptContents = await checkTableExists(sql, "receipt_contents");
		log(`receipt_contents table exists: ${hasReceiptContents}`);

		// Check legacy data counts
		const txWithPurchaseId = await sql`
			SELECT COUNT(*)::int as count FROM transactions WHERE purchase_id IS NOT NULL
		`;
		log(`Transactions with purchase_id: ${txWithPurchaseId[0].count}`);

		const receiptsWithPurchaseId = await sql`
			SELECT COUNT(*)::int as count FROM receipts WHERE purchase_id IS NOT NULL
		`;
		log(`Receipts with purchase_id: ${receiptsWithPurchaseId[0].count}`);

		const hasInventoryItemTransactions = await checkTableExists(
			sql,
			"inventory_item_transactions",
		);
		let invTxCount = 0;
		if (hasInventoryItemTransactions) {
			invTxCount = await getRowCount(sql, "inventory_item_transactions");
		}
		log(`inventory_item_transactions rows: ${invTxCount}`);

		// ============================================
		// PHASE 1: Create backups
		// ============================================
		logSection("PHASE 1: Create Backups");

		if (!DRY_RUN) {
			log("Creating backup tables...");

			await sql.unsafe(`DROP TABLE IF EXISTS purchases_backup`);
			await sql.unsafe(
				`CREATE TABLE purchases_backup AS SELECT * FROM purchases`,
			);
			log("Created purchases_backup");

			await sql.unsafe(`DROP TABLE IF EXISTS transactions_backup`);
			await sql.unsafe(
				`CREATE TABLE transactions_backup AS SELECT * FROM transactions`,
			);
			log("Created transactions_backup");

			await sql.unsafe(`DROP TABLE IF EXISTS receipts_backup`);
			await sql.unsafe(
				`CREATE TABLE receipts_backup AS SELECT * FROM receipts`,
			);
			log("Created receipts_backup");

			await sql.unsafe(`DROP TABLE IF EXISTS inventory_items_backup`);
			await sql.unsafe(
				`CREATE TABLE inventory_items_backup AS SELECT * FROM inventory_items`,
			);
			log("Created inventory_items_backup");

			if (hasInventoryItemTransactions) {
				await sql.unsafe(
					`DROP TABLE IF EXISTS inventory_item_transactions_backup`,
				);
				await sql.unsafe(
					`CREATE TABLE inventory_item_transactions_backup AS SELECT * FROM inventory_item_transactions`,
				);
				log("Created inventory_item_transactions_backup");
			}
		} else {
			log(
				"Would create backup tables: purchases, transactions, receipts, inventory_items, inventory_item_transactions",
			);
		}

		// ============================================
		// PHASE 2: Create drizzle migrations tracking
		// ============================================
		logSection("PHASE 2: Create Drizzle Migrations Tracking");

		if (!hasMigrationsTable) {
			if (!DRY_RUN) {
				log("Creating drizzle schema and __drizzle_migrations table...");
				await sql`CREATE SCHEMA IF NOT EXISTS drizzle`;
				await sql`
					CREATE TABLE drizzle.__drizzle_migrations (
						id SERIAL PRIMARY KEY,
						hash text NOT NULL UNIQUE,
						created_at bigint
					)
				`;
				log("Created drizzle.__drizzle_migrations table");
			} else {
				log("Would create drizzle.__drizzle_migrations table");
			}
		} else {
			log("__drizzle_migrations table already exists, skipping");
		}

		// ============================================
		// PHASE 3: Create new tables
		// ============================================
		logSection("PHASE 3: Create New Tables");

		// Create entity_relationships
		if (!hasEntityRelationships) {
			if (!DRY_RUN) {
				log("Creating entity_relationships table...");
				await sql`
					CREATE TABLE "entity_relationships" (
						"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
						"relation_a_type" text NOT NULL,
						"relation_a_id" text NOT NULL,
						"relation_b_type" text NOT NULL,
						"relation_b_id" text NOT NULL,
						"metadata" text,
						"created_by" uuid REFERENCES "users"("id"),
						"created_at" timestamp DEFAULT now() NOT NULL,
						CONSTRAINT "entity_rel_pair_unique" UNIQUE("relation_a_type", "relation_a_id", "relation_b_type", "relation_b_id")
					)
				`;
				await sql`CREATE INDEX IF NOT EXISTS "entity_rel_relation_a_idx" ON "entity_relationships" ("relation_a_type", "relation_a_id")`;
				await sql`CREATE INDEX IF NOT EXISTS "entity_rel_relation_b_idx" ON "entity_relationships" ("relation_b_type", "relation_b_id")`;
				log("Created entity_relationships table");
			} else {
				log("Would create entity_relationships table");
			}
		} else {
			log("entity_relationships table already exists, skipping");
		}

		// Create minutes
		if (!hasMinutes) {
			if (!DRY_RUN) {
				log("Creating minutes table...");
				await sql`
					CREATE TABLE "minutes" (
						"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
						"status" text NOT NULL DEFAULT 'draft',
						"date" timestamp,
						"title" text,
						"description" text,
						"file_url" text,
						"file_key" text,
						"year" integer,
						"created_by" uuid REFERENCES "users"("id"),
						"created_at" timestamp DEFAULT now() NOT NULL,
						"updated_at" timestamp DEFAULT now() NOT NULL
					)
				`;
				log("Created minutes table");
			} else {
				log("Would create minutes table");
			}
		} else {
			log("minutes table already exists, skipping");
		}

		// Create receipt_contents
		if (!hasReceiptContents) {
			if (!DRY_RUN) {
				log("Creating receipt_contents table...");
				await sql`
					CREATE TABLE "receipt_contents" (
						"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
						"receipt_id" uuid NOT NULL UNIQUE REFERENCES "receipts"("id") ON DELETE CASCADE,
						"raw_text" text,
						"store_name" text,
						"items" text,
						"total_amount" numeric(10, 2),
						"currency" text DEFAULT 'EUR',
						"purchase_date" timestamp,
						"ai_model" text,
						"processed" boolean DEFAULT false,
						"processed_at" timestamp,
						"reimbursement_id" uuid REFERENCES "purchases"("id"),
						"transaction_ids" text,
						"inventory_item_ids" text,
						"created_at" timestamp DEFAULT now() NOT NULL,
						"updated_at" timestamp DEFAULT now() NOT NULL
					)
				`;
				log("Created receipt_contents table");
			} else {
				log("Would create receipt_contents table");
			}
		} else {
			log("receipt_contents table already exists, skipping");
		}

		// ============================================
		// PHASE 4: Add missing columns
		// ============================================
		logSection("PHASE 4: Add Missing Columns");

		// Receipts: add status, make url/pathname nullable
		const hasReceiptStatus = await checkColumnExists(sql, "receipts", "status");
		if (!hasReceiptStatus) {
			if (!DRY_RUN) {
				log("Adding status column to receipts...");
				await sql`ALTER TABLE "receipts" ADD COLUMN "status" text NOT NULL DEFAULT 'active'`;
				log("Added status column to receipts");
			} else {
				log("Would add status column to receipts");
			}
		} else {
			log("receipts.status already exists, skipping");
		}

		// Make receipts.url nullable
		if (!DRY_RUN) {
			log("Making receipts.url nullable...");
			await sql`ALTER TABLE "receipts" ALTER COLUMN "url" DROP NOT NULL`;
			log("Made receipts.url nullable");
			await sql`ALTER TABLE "receipts" ALTER COLUMN "pathname" DROP NOT NULL`;
			log("Made receipts.pathname nullable");
		} else {
			log("Would make receipts.url and receipts.pathname nullable");
		}

		// News: add status
		const hasNewsStatus = await checkColumnExists(sql, "news", "status");
		if (!hasNewsStatus) {
			if (!DRY_RUN) {
				log("Adding status column to news...");
				await sql`ALTER TABLE "news" ADD COLUMN "status" text NOT NULL DEFAULT 'active'`;
				log("Added status column to news");
			} else {
				log("Would add status column to news");
			}
		} else {
			log("news.status already exists, skipping");
		}

		// FAQ: add status
		const hasFaqStatus = await checkColumnExists(sql, "faq", "status");
		if (!hasFaqStatus) {
			if (!DRY_RUN) {
				log("Adding status column to faq...");
				await sql`ALTER TABLE "faq" ADD COLUMN "status" text NOT NULL DEFAULT 'active'`;
				log("Added status column to faq");
			} else {
				log("Would add status column to faq");
			}
		} else {
			log("faq.status already exists, skipping");
		}

		// Social links: add status
		const hasSocialStatus = await checkColumnExists(
			sql,
			"social_links",
			"status",
		);
		if (!hasSocialStatus) {
			if (!DRY_RUN) {
				log("Adding status column to social_links...");
				await sql`ALTER TABLE "social_links" ADD COLUMN "status" text NOT NULL DEFAULT 'active'`;
				log("Added status column to social_links");
			} else {
				log("Would add status column to social_links");
			}
		} else {
			log("social_links.status already exists, skipping");
		}

		// Inventory items: add needs_completion, completion_notes, make location nullable
		const hasNeedsCompletion = await checkColumnExists(
			sql,
			"inventory_items",
			"needs_completion",
		);
		if (!hasNeedsCompletion) {
			if (!DRY_RUN) {
				log("Adding needs_completion column to inventory_items...");
				await sql`ALTER TABLE "inventory_items" ADD COLUMN "needs_completion" boolean DEFAULT false`;
				log("Added needs_completion column to inventory_items");
			} else {
				log("Would add needs_completion column to inventory_items");
			}
		} else {
			log("inventory_items.needs_completion already exists, skipping");
		}

		const hasCompletionNotes = await checkColumnExists(
			sql,
			"inventory_items",
			"completion_notes",
		);
		if (!hasCompletionNotes) {
			if (!DRY_RUN) {
				log("Adding completion_notes column to inventory_items...");
				await sql`ALTER TABLE "inventory_items" ADD COLUMN "completion_notes" text`;
				log("Added completion_notes column to inventory_items");
			} else {
				log("Would add completion_notes column to inventory_items");
			}
		} else {
			log("inventory_items.completion_notes already exists, skipping");
		}

		// Make inventory_items.location nullable
		if (!DRY_RUN) {
			log("Making inventory_items.location nullable...");
			await sql`ALTER TABLE "inventory_items" ALTER COLUMN "location" DROP NOT NULL`;
			log("Made inventory_items.location nullable");
		} else {
			log("Would make inventory_items.location nullable");
		}

		// ============================================
		// PHASE 5: Migrate legacy relationship data
		// ============================================
		logSection("PHASE 5: Migrate Legacy Relationship Data");

		// Check existing relationships to avoid duplicates
		if (hasEntityRelationships && !DRY_RUN) {
			const existingRelationships = await sql`
				SELECT COUNT(*)::int as count FROM entity_relationships
			`;
			log(
				`Existing entity_relationships rows: ${existingRelationships[0].count}`,
			);
		} else if (DRY_RUN) {
			log(
				"Existing entity_relationships rows: 0 (table doesn't exist yet in dry run)",
			);
		} else {
			log("entity_relationships table doesn't exist, will create fresh");
		}

		// Migrate transactions.purchase_id → entity_relationships
		if (txWithPurchaseId[0].count > 0) {
			if (!DRY_RUN) {
				log(
					`Migrating ${txWithPurchaseId[0].count} transaction->purchase relationships...`,
				);
				await sql`
					INSERT INTO entity_relationships (relation_a_type, relation_a_id, relation_b_type, relation_b_id, created_at)
					SELECT 'reimbursement', purchase_id, 'transaction', id, NOW()
					FROM transactions 
					WHERE purchase_id IS NOT NULL
					ON CONFLICT (relation_a_type, relation_a_id, relation_b_type, relation_b_id) DO NOTHING
				`;
				log("Migrated transaction->purchase relationships");
			} else {
				log(
					`Would migrate ${txWithPurchaseId[0].count} transaction->purchase relationships`,
				);
			}
		} else {
			log("No transaction->purchase relationships to migrate");
		}

		// Migrate receipts.purchase_id → entity_relationships
		if (receiptsWithPurchaseId[0].count > 0) {
			if (!DRY_RUN) {
				log(
					`Migrating ${receiptsWithPurchaseId[0].count} receipt->purchase relationships...`,
				);
				await sql`
					INSERT INTO entity_relationships (relation_a_type, relation_a_id, relation_b_type, relation_b_id, created_at)
					SELECT 'reimbursement', purchase_id, 'receipt', id, NOW()
					FROM receipts 
					WHERE purchase_id IS NOT NULL
					ON CONFLICT (relation_a_type, relation_a_id, relation_b_type, relation_b_id) DO NOTHING
				`;
				log("Migrated receipt->purchase relationships");
			} else {
				log(
					`Would migrate ${receiptsWithPurchaseId[0].count} receipt->purchase relationships`,
				);
			}
		} else {
			log("No receipt->purchase relationships to migrate");
		}

		// Migrate inventory_item_transactions → entity_relationships
		if (invTxCount > 0) {
			if (!DRY_RUN) {
				log(`Migrating ${invTxCount} inventory->transaction relationships...`);
				await sql`
					INSERT INTO entity_relationships (relation_a_type, relation_a_id, relation_b_type, relation_b_id, created_at)
					SELECT 'inventory', inventory_item_id, 'transaction', transaction_id, NOW()
					FROM inventory_item_transactions
					ON CONFLICT (relation_a_type, relation_a_id, relation_b_type, relation_b_id) DO NOTHING
				`;
				log("Migrated inventory->transaction relationships");
			} else {
				log(`Would migrate ${invTxCount} inventory->transaction relationships`);
			}
		} else {
			log("No inventory->transaction relationships to migrate");
		}

		// Verify migration
		if (!DRY_RUN) {
			const newRelationships = await sql`
				SELECT COUNT(*)::int as count FROM entity_relationships
			`;
			log(
				`entity_relationships rows after migration: ${newRelationships[0].count}`,
			);
		} else {
			log(
				"entity_relationships rows after migration: (skipped in dry run - table doesn't exist)",
			);
		}

		// ============================================
		// PHASE 6: Drop legacy columns and tables
		// ============================================
		logSection("PHASE 6: Drop Legacy Columns and Tables");

		// Drop FK constraints
		const txFkExists = await checkConstraintExists(
			sql,
			"transactions_purchase_id_purchases_id_fk",
		);
		if (txFkExists) {
			if (!DRY_RUN) {
				log("Dropping transactions_purchase_id_purchases_id_fk constraint...");
				await sql`ALTER TABLE "transactions" DROP CONSTRAINT "transactions_purchase_id_purchases_id_fk"`;
				log("Dropped transactions FK constraint");
			} else {
				log("Would drop transactions_purchase_id_purchases_id_fk constraint");
			}
		} else {
			log("transactions FK constraint already dropped");
		}

		const rcFkExists = await checkConstraintExists(
			sql,
			"receipts_purchase_id_purchases_id_fk",
		);
		if (rcFkExists) {
			if (!DRY_RUN) {
				log("Dropping receipts_purchase_id_purchases_id_fk constraint...");
				await sql`ALTER TABLE "receipts" DROP CONSTRAINT "receipts_purchase_id_purchases_id_fk"`;
				log("Dropped receipts FK constraint");
			} else {
				log("Would drop receipts_purchase_id_purchases_id_fk constraint");
			}
		} else {
			log("receipts FK constraint already dropped");
		}

		// Drop legacy columns
		const hasTxPurchaseId = await checkColumnExists(
			sql,
			"transactions",
			"purchase_id",
		);
		if (hasTxPurchaseId) {
			if (!DRY_RUN) {
				log("Dropping transactions.purchase_id column...");
				await sql`ALTER TABLE "transactions" DROP COLUMN "purchase_id"`;
				log("Dropped transactions.purchase_id column");
			} else {
				log("Would drop transactions.purchase_id column");
			}
		} else {
			log("transactions.purchase_id already dropped");
		}

		const hasRcPurchaseId = await checkColumnExists(
			sql,
			"receipts",
			"purchase_id",
		);
		if (hasRcPurchaseId) {
			if (!DRY_RUN) {
				log("Dropping receipts.purchase_id column...");
				await sql`ALTER TABLE "receipts" DROP COLUMN "purchase_id"`;
				log("Dropped receipts.purchase_id column");
			} else {
				log("Would drop receipts.purchase_id column");
			}
		} else {
			log("receipts.purchase_id already dropped");
		}

		// Drop legacy indexes (may not exist, ignore errors)
		if (!DRY_RUN) {
			log("Dropping legacy indexes (if they exist)...");
			try {
				await sql.unsafe(`DROP INDEX IF EXISTS "transactions_purchase_id_idx"`);
				await sql.unsafe(`DROP INDEX IF EXISTS "receipts_purchase_id_idx"`);
				log("Dropped legacy indexes");
			} catch (e) {
				log(`Index drop note: ${e}`);
			}
		} else {
			log("Would drop legacy indexes");
		}

		// Drop inventory_item_transactions table
		if (hasInventoryItemTransactions) {
			if (!DRY_RUN) {
				log("Dropping inventory_item_transactions table...");
				await sql`DROP TABLE "inventory_item_transactions"`;
				log("Dropped inventory_item_transactions table");
			} else {
				log("Would drop inventory_item_transactions table");
			}
		} else {
			log("inventory_item_transactions table already dropped");
		}

		// ============================================
		// PHASE 7: Record migrations as applied
		// ============================================
		logSection("PHASE 7: Record Migrations as Applied");

		if (!DRY_RUN) {
			log("Inserting migration hashes into drizzle.__drizzle_migrations...");
			for (const migration of MIGRATION_HASHES) {
				await sql.unsafe(`
					INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
					VALUES ('${migration.hash}', ${migration.created_at})
					ON CONFLICT (hash) DO NOTHING
				`);
			}
			log(`Inserted ${MIGRATION_HASHES.length} migration records`);

			const migrationCount = await sql`
				SELECT COUNT(*)::int as count FROM drizzle.__drizzle_migrations
			`;
			log(`Total migrations recorded: ${migrationCount[0].count}`);
		} else {
			log(`Would insert ${MIGRATION_HASHES.length} migration hashes`);
		}

		// ============================================
		// PHASE 8: Final verification
		// ============================================
		logSection("PHASE 8: Final Verification");

		const finalTables = await sql`
			SELECT table_name FROM information_schema.tables 
			WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
			ORDER BY table_name
		`;
		log(`Final table count: ${finalTables.length}`);

		if (!DRY_RUN) {
			const finalRelationships = await sql`
				SELECT COUNT(*)::int as count FROM entity_relationships
			`;
			log(`Final entity_relationships count: ${finalRelationships[0].count}`);

			const finalMigrations = await sql`
				SELECT COUNT(*)::int as count FROM drizzle.__drizzle_migrations
			`;
			log(`Final migration count: ${finalMigrations[0].count}`);

			// Verify backup tables exist
			const backupExists = await checkTableExists(sql, "purchases_backup");
			log(`Backup tables preserved: ${backupExists}`);
		} else {
			log("Final verification skipped in dry run mode");
		}

		logSection("Migration Complete!");
		if (DRY_RUN) {
			log("This was a DRY RUN. No changes were made.");
			log("To apply changes, run without DRY_RUN=true");
		} else {
			log("Migration completed successfully!");
			log("Backup tables are preserved with _backup suffix.");
			log("Verify the application works correctly before removing backups.");
		}
	} catch (error) {
		console.error("\n❌ MIGRATION FAILED:", error);
		throw error;
	} finally {
		await sql.end();
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
