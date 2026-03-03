/**
 * Backfill Mail Threads Script
 * 
 * This script scans all existing committee_mail_messages and ensures 
 * that a corresponding committee_mail_threads record exists for each
 * unique threadId. This ensures that all messages have a UUID slug 
 * for cleaner URLs.
 * 
 * Run with: bun run scripts/backfill-mail-threads.ts
 */

import "dotenv/config";
import { getDatabase } from "../app/db/server.server";

async function backfill() {
    console.log("🧵 Starting Mail Thread Backfill...\n");
    const db = getDatabase();

    try {
        // We'll use the raw postgres client for a custom query if needed,
        // but let's see if we can do it via the adapter.
        // Since the adapter doesn't have a "get all unique threadIds" method, 
        // we'll fetch messages and group them.

        console.log("📥 Fetching all mail messages...");
        // Fetch a large-ish batch or implement pagination if there are thousands.
        // For now, let's assume it fits in memory or we use the adapter's list.
        const messages = await db.getCommitteeMailMessagesBySubjectPattern(""); // Empty pattern should match all if implemented correctly

        if (messages.length === 0) {
            console.log("ℹ️ No messages found. Nothing to backfill.");
            return;
        }

        const threadMap = new Map<string, string>(); // threadId -> subject

        for (const msg of messages) {
            if (msg.threadId && !threadMap.has(msg.threadId)) {
                threadMap.set(msg.threadId, msg.subject);
            }
        }

        console.log(`🔍 Found ${threadMap.size} unique threads to process.`);

        let createdCount = 0;
        let skippedCount = 0;

        for (const [threadId, subject] of threadMap.entries()) {
            try {
                // ensureCommitteeMailThread is idempotent
                await db.ensureCommitteeMailThread(threadId, subject);
                createdCount++;
                if (createdCount % 10 === 0) {
                    process.stdout.write(".");
                }
            } catch (err) {
                console.error(`\n❌ Failed to process thread ${threadId}:`, err);
                skippedCount++;
            }
        }

        console.log(`\n\n✅ Backfill complete!`);
        console.log(`   - Processed: ${threadMap.size}`);
        console.log(`   - Ensured: ${createdCount}`);
        console.log(`   - Errors: ${skippedCount}`);

    } catch (error) {
        console.error("\n❌ Backfill failed:", error);
        process.exit(1);
    }
}

backfill();
