/**
 * Migration script: mail → mail_thread relationships
 *
 * This script:
 * 1. Creates committee_mail_threads records from distinct threadIds in committee_mail_messages
 * 2. Assigns threadId to mail_drafts based on their replyToMessageId's parent thread
 * 3. Auto-deletes orphaned mail_drafts (no threadId and no valid parent message)
 * 4. Migrates entity_relationships: swap "mail" → "mail_thread", change IDs to threadIds
 * 5. Deduplicates resulting identical relations
 * 6. Removes unmigrated "mail" relations
 *
 * Safe to re-run (idempotent).
 */

import dotenv from "dotenv";
import postgres from "postgres";

dotenv.config();

const databaseUrl = process.env.DATABASE_URL_PROD || process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error("Missing DATABASE_URL_PROD or DATABASE_URL in .env.");
	process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1 });

async function run() {
	try {
		// ── Step 1: Create committee_mail_threads from existing messages ──
		console.log("\n==> Step 1: Creating committee_mail_threads from messages");

		const threadsCreated = await sql`
			INSERT INTO committee_mail_threads (id, subject, created_at, updated_at)
			SELECT DISTINCT ON (m.thread_id)
				m.thread_id,
				m.subject,
				MIN(m.created_at) OVER (PARTITION BY m.thread_id),
				NOW()
			FROM committee_mail_messages m
			WHERE m.thread_id IS NOT NULL
			ON CONFLICT (id) DO UPDATE SET
				updated_at = NOW()
			RETURNING id
		`;
		console.log(`  Created/updated ${threadsCreated.length} thread records`);

		// ── Step 2: Assign threadId to mail_drafts ──
		console.log("\n==> Step 2: Assigning threadId to mail_drafts");

		// For drafts with replyToMessageId — look up the parent message's threadId
		const draftsUpdated = await sql`
			UPDATE mail_drafts d
			SET thread_id = m.thread_id
			FROM committee_mail_messages m
			WHERE d.reply_to_message_id = m.id::text
			  AND d.thread_id IS NULL
			  AND m.thread_id IS NOT NULL
		`;
		console.log(`  Updated ${draftsUpdated.count} drafts with threadId from reply parent`);

		// For drafts with forwardFromMessageId — look up the forwarded message's threadId
		const forwardDraftsUpdated = await sql`
			UPDATE mail_drafts d
			SET thread_id = m.thread_id
			FROM committee_mail_messages m
			WHERE d.forward_from_message_id = m.id::text
			  AND d.thread_id IS NULL
			  AND m.thread_id IS NOT NULL
		`;
		console.log(`  Updated ${forwardDraftsUpdated.count} drafts with threadId from forwarded message`);

		// ── Step 3: Auto-delete orphaned drafts ──
		console.log("\n==> Step 3: Auto-deleting orphaned drafts");

		const orphanedDrafts = await sql`
			DELETE FROM mail_drafts
			WHERE thread_id IS NULL
			  AND (reply_to_message_id IS NULL OR NOT EXISTS (
				SELECT 1 FROM committee_mail_messages m WHERE m.id::text = mail_drafts.reply_to_message_id
			  ))
			  AND (forward_from_message_id IS NULL OR NOT EXISTS (
				SELECT 1 FROM committee_mail_messages m WHERE m.id::text = mail_drafts.forward_from_message_id
			  ))
			  AND subject IS NULL
			  AND body IS NULL
			RETURNING id
		`;
		console.log(`  Deleted ${orphanedDrafts.length} orphaned empty drafts`);

		// ── Step 4: Migrate entity_relationships ──
		console.log("\n==> Step 4: Migrating entity_relationships from 'mail' to 'mail_thread'");

		// 4a: Migrate relations where mail is on the A side (relation_a_type = 'mail')
		// The relation_a_id points to a message ID or draft ID — need to resolve to threadId
		const migratedA = await sql`
			UPDATE entity_relationships er
			SET relation_a_type = 'mail_thread',
			    relation_a_id = m.thread_id
			FROM committee_mail_messages m
			WHERE er.relation_a_type = 'mail'
			  AND er.relation_a_id = m.id::text
			  AND m.thread_id IS NOT NULL
		`;
		console.log(`  Migrated ${migratedA.count} A-side relations (message → thread)`);

		// 4b: Migrate relations where mail is on the B side (relation_b_type = 'mail')
		const migratedB = await sql`
			UPDATE entity_relationships er
			SET relation_b_type = 'mail_thread',
			    relation_b_id = m.thread_id
			FROM committee_mail_messages m
			WHERE er.relation_b_type = 'mail'
			  AND er.relation_b_id = m.id::text
			  AND m.thread_id IS NOT NULL
		`;
		console.log(`  Migrated ${migratedB.count} B-side relations (message → thread)`);

		// 4c: Try to migrate draft-based relations (where the ID is a draft ID)
		const migratedDraftA = await sql`
			UPDATE entity_relationships er
			SET relation_a_type = 'mail_thread',
			    relation_a_id = d.thread_id
			FROM mail_drafts d
			WHERE er.relation_a_type = 'mail'
			  AND er.relation_a_id = d.id::text
			  AND d.thread_id IS NOT NULL
		`;
		console.log(`  Migrated ${migratedDraftA.count} A-side relations (draft → thread)`);

		const migratedDraftB = await sql`
			UPDATE entity_relationships er
			SET relation_b_type = 'mail_thread',
			    relation_b_id = d.thread_id
			FROM mail_drafts d
			WHERE er.relation_b_type = 'mail'
			  AND er.relation_b_id = d.id::text
			  AND d.thread_id IS NOT NULL
		`;
		console.log(`  Migrated ${migratedDraftB.count} B-side relations (draft → thread)`);

		// ── Step 5: Deduplicate ──
		console.log("\n==> Step 5: Deduplicating relationships");

		const duplicatesRemoved = await sql`
			DELETE FROM entity_relationships
			WHERE id IN (
				SELECT id FROM (
					SELECT id,
						ROW_NUMBER() OVER (
							PARTITION BY relation_a_type, relation_a_id, relation_b_type, relation_b_id
							ORDER BY created_at ASC
						) as rn
					FROM entity_relationships
					WHERE relation_a_type = 'mail_thread' OR relation_b_type = 'mail_thread'
				) sub
				WHERE sub.rn > 1
			)
			RETURNING id
		`;
		console.log(`  Removed ${duplicatesRemoved.length} duplicate relationships`);

		// ── Step 6: Remove unmigrated 'mail' relations ──
		console.log("\n==> Step 6: Removing unmigrated 'mail' relations");

		const unmigrated = await sql`
			SELECT id, relation_a_type, relation_a_id, relation_b_type, relation_b_id
			FROM entity_relationships
			WHERE relation_a_type = 'mail' OR relation_b_type = 'mail'
		`;

		if (unmigrated.length > 0) {
			console.log(`  Found ${unmigrated.length} unmigrated 'mail' relations:`);
			for (const row of unmigrated) {
				console.log(`    ${row.id}: ${row.relation_a_type}:${row.relation_a_id} ↔ ${row.relation_b_type}:${row.relation_b_id}`);
			}

			const deleted = await sql`
				DELETE FROM entity_relationships
				WHERE relation_a_type = 'mail' OR relation_b_type = 'mail'
				RETURNING id
			`;
			console.log(`  Deleted ${deleted.length} unmigrated relations`);
		} else {
			console.log("  No unmigrated 'mail' relations found");
		}

		// ── Verification ──
		console.log("\n==> Verification");

		const stats = await sql`
			SELECT 'committee_mail_threads' as table_name, COUNT(*)::int as count FROM committee_mail_threads
			UNION ALL
			SELECT 'mail_thread relationships', COUNT(*)::int FROM entity_relationships WHERE relation_a_type = 'mail_thread' OR relation_b_type = 'mail_thread'
			UNION ALL
			SELECT 'remaining mail relationships', COUNT(*)::int FROM entity_relationships WHERE relation_a_type = 'mail' OR relation_b_type = 'mail'
			UNION ALL
			SELECT 'drafts with threadId', COUNT(*)::int FROM mail_drafts WHERE thread_id IS NOT NULL
			UNION ALL
			SELECT 'drafts without threadId', COUNT(*)::int FROM mail_drafts WHERE thread_id IS NULL
		`;
		console.table(stats);

		console.log("\n==> Migration complete!");
	} finally {
		await sql.end({ timeout: 5 });
	}
}

run().catch((error) => {
	console.error("Migration failed:", error);
	process.exit(1);
});
