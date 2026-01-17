#!/usr/bin/env bun
/**
 * One-time migration script to sync transaction reimbursementStatus
 * with their linked purchase status.
 * 
 * Run with: bun run scripts/sync-transaction-status.ts
 */

import { getDatabase, type PurchaseStatus, type ReimbursementStatus, type TransactionStatus } from "../app/db";

async function syncTransactionStatuses() {
    const db = getDatabase();

    // Get all purchases
    const purchases = await db.getPurchases();
    console.log(`Found ${purchases.length} purchases to check`);

    let updatedCount = 0;

    for (const purchase of purchases) {
        // Find linked transaction
        const transaction = await db.getTransactionByPurchaseId(purchase.id);

        if (!transaction) {
            console.log(`  No transaction found for purchase ${purchase.id}`);
            continue;
        }

        // Map purchase status to reimbursement status and transaction status
        let expectedReimbursementStatus: ReimbursementStatus = "requested";
        let expectedTransactionStatus: TransactionStatus = "pending";

        if (purchase.status === "approved" || purchase.status === "reimbursed") {
            expectedReimbursementStatus = "approved";
            expectedTransactionStatus = "complete";
        } else if (purchase.status === "rejected") {
            expectedReimbursementStatus = "declined";
            expectedTransactionStatus = "declined";
        } else if (purchase.status === "pending") {
            expectedReimbursementStatus = "requested";
            expectedTransactionStatus = "pending";
        }

        // Check if transaction needs update
        if (transaction.reimbursementStatus !== expectedReimbursementStatus ||
            transaction.status !== expectedTransactionStatus) {
            console.log(`  Updating transaction ${transaction.id}:`);
            console.log(`    status: ${transaction.status} -> ${expectedTransactionStatus}`);
            console.log(`    reimbursementStatus: ${transaction.reimbursementStatus} -> ${expectedReimbursementStatus}`);
            await db.updateTransaction(transaction.id, {
                reimbursementStatus: expectedReimbursementStatus,
                status: expectedTransactionStatus
            });
            updatedCount++;
        }
    }

    console.log(`\nDone! Updated ${updatedCount} transactions.`);
}

syncTransactionStatuses().catch(console.error);
