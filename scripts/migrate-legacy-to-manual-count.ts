/**
 * Migration script to convert legacy items to use manualCount
 * 
 * This script finds all items with status='legacy' and converts them:
 * - Sets manualCount = quantity (all units are marked as no-transaction)
 * - Changes status back to 'active'
 * 
 * Run with: bun scripts/migrate-legacy-to-manual-count.ts
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import { inventoryItems } from "../app/db/schema";

async function migrateLegacyItems() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        throw new Error("DATABASE_URL environment variable not set");
    }

    const sql = neon(connectionString);
    const db = drizzle(sql);

    console.log("Finding legacy items...");

    // Find all legacy items
    const legacyItems = await db.select()
        .from(inventoryItems)
        .where(eq(inventoryItems.status, "legacy"));

    console.log(`Found ${legacyItems.length} legacy items to migrate`);

    for (const item of legacyItems) {
        console.log(`Migrating: ${item.name} (qty: ${item.quantity})`);

        // Set manualCount = quantity and status = active
        await db.update(inventoryItems)
            .set({
                manualCount: item.quantity,
                status: "active",
                updatedAt: new Date(),
            })
            .where(eq(inventoryItems.id, item.id));

        console.log(`  ✓ Migrated: manualCount=${item.quantity}, status=active`);
    }

    console.log("\nMigration complete!");
    console.log(`Migrated ${legacyItems.length} items from legacy to manualCount`);
}

migrateLegacyItems()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error("Migration failed:", err);
        process.exit(1);
    });
