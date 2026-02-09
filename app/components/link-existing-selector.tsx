import type { Purchase, Transaction } from "~/db/schema";

import {
	TREASURY_PURCHASE_STATUS_VARIANTS,
	TREASURY_TRANSACTION_STATUS_VARIANTS,
} from "~/components/colored-status-link-badge";

export type LinkableItem = {
	id: string;
	title?: string;
	description: string | null;
	amount?: string;
	createdAt?: Date;
	// Purchase-specific
	purchaserName?: string;
	/** URL to view the item details */
	viewLink?: string;
	/** Route to view the item */
	to: string;
	status: string;
	variantMap: Record<string, string>;
};

/**
 * Helper to convert Purchase array to LinkableItem array
 */
export function purchasesToLinkableItems(purchases: Purchase[]): LinkableItem[] {
	return purchases.map((p) => ({
		id: p.id,
		description: p.description,
		amount: p.amount,
		createdAt: p.createdAt,
		purchaserName: p.purchaserName,
		viewLink: `/treasury/reimbursements/${p.id}`,
		to: `/treasury/reimbursements/${p.id}`,
		status: p.status,
		variantMap: TREASURY_PURCHASE_STATUS_VARIANTS,
	}));
}

/**
 * Helper to convert minutes to LinkableItems
 */
// Helper to convert receipts to LinkableItems
export function receiptsToLinkableItems(receiptsByYear: { year: string; files: { id: string; name: string; url: string; createdTime: string }[] }[]): LinkableItem[] {
	return receiptsByYear.flatMap((yearGroup) =>
		yearGroup.files.map((file) => ({
			id: file.id, // file.id is the pathname/storage path usually
			description: `${file.name}`,
			to: file.url,
			status: "linked",
			// Use year as additional info in description or similar? 
			// LinkableItem doesn't have a specific "year" field but description works.
			variantMap: { linked: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80" },
		}))
	);
}

export function minutesToLinkableItems(minutes: { id: string; name: string; year: string; url?: string }[]): LinkableItem[] {
	return minutes.map((m) => ({
		id: m.id,
		description: m.name,
		to: m.url || "#",
		status: "linked", // Minutes don't really have status, use generic
		variantMap: { linked: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80" },
	}));
}

/**
 * Helper to convert Transaction array to LinkableItem array
 */
export function transactionsToLinkableItems(
	transactions: Transaction[],
): LinkableItem[] {
	return transactions.map((t) => ({
		id: t.id,
		description: t.description,
		amount: t.amount,
		createdAt: t.createdAt,
		viewLink: `/treasury/transactions/${t.id}`,
		to: `/treasury/transactions/${t.id}`,
		status: t.status,
		variantMap: TREASURY_TRANSACTION_STATUS_VARIANTS,
	}));
}
