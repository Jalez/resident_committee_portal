import type { ReceiptLink } from "~/lib/treasury/receipt-validation";
import { getDatabase } from "~/db";
import { FilesystemReceiptStorage } from "./adapters/filesystem.server";
import { VercelBlobReceiptStorage } from "./adapters/vercel-blob.server";
import type { ReceiptStorageAdapter, ReceiptsByYear } from "./types";

export type ReceiptStorageProvider = "vercel-blob" | "filesystem";

function receiptToFile(receipt: { pathname: string; name: string | null; url: string; createdAt: Date }) {
	const filename = receipt.pathname.split("/").pop() || "receipt";
	return {
		id: receipt.pathname,
		name: receipt.name || filename,
		url: receipt.url,
		createdTime: new Date(receipt.createdAt).toISOString(),
	};
}

function groupReceiptsByYear(
	receipts: Array<{ pathname: string; name: string | null; url: string; createdAt: Date }>,
): ReceiptsByYear[] {
	const byYear = new Map<string, ReceiptsByYear>();
	for (const r of receipts) {
		const match = r.pathname.match(/receipts\/(\d{4})/);
		const year = match ? match[1] : new Date(r.createdAt).getFullYear().toString();
		const entry = byYear.get(year) || {
			year,
			files: [],
			folderUrl: "#",
			folderId: "",
		};
		entry.files.push(receiptToFile(r));
		byYear.set(year, entry);
	}
	const currentYear = new Date().getFullYear().toString();
	if (!byYear.has(currentYear)) {
		byYear.set(currentYear, {
			year: currentYear,
			files: [],
			folderUrl: "#",
			folderId: "",
		});
	}
	return Array.from(byYear.values()).sort(
		(a, b) => parseInt(b.year, 10) - parseInt(a.year, 10),
	);
}

interface ReceiptStorageConfig {
	provider: ReceiptStorageProvider;
}

export function createReceiptStorage(
	config: ReceiptStorageConfig,
): ReceiptStorageAdapter {
	switch (config.provider) {
		case "vercel-blob":
			return new VercelBlobReceiptStorage();
		case "filesystem":
			return new FilesystemReceiptStorage();
		default:
			throw new Error(`Unsupported receipt storage provider: ${config.provider}`);
	}
}

let storageInstance: ReceiptStorageAdapter | null = null;

export function getReceiptStorage(): ReceiptStorageAdapter {
	if (storageInstance) {
		return storageInstance;
	}

	const provider =
		(process.env.RECEIPT_STORAGE_PROVIDER as ReceiptStorageProvider) ||
		"vercel-blob";

	storageInstance = createReceiptStorage({ provider });
	return storageInstance;
}

export function resetReceiptStorage(): void {
	storageInstance = null;
}

export async function getReceiptsByYear(): Promise<ReceiptsByYear[]> {
	return getReceiptStorage().listReceiptsByYear();
}

export async function getUnconnectedReceiptsByYear(): Promise<ReceiptsByYear[]> {
	const db = getDatabase();
	const allReceipts = await db.getReceipts();
	
	// Get all relationships to find which receipts are linked to purchases
	const relationships = await db.getEntityRelationships("reimbursement", "all");
	const linkedReceiptIds = new Set<string>();
	for (const rel of relationships) {
		if (rel.relationBType === "receipt") {
			linkedReceiptIds.add(rel.relationBId);
		} else if (rel.relationAType === "receipt") {
			linkedReceiptIds.add(rel.relationId);
		}
	}
	
	// Filter out linked receipts and drafts (receipts without pathname/url)
	const unlinked = allReceipts.filter(r => !linkedReceiptIds.has(r.id));
	const activeReceipts = unlinked.filter(r => r.pathname && r.url) as Array<{
		pathname: string;
		name: string | null;
		url: string;
		createdAt: Date;
	}>;
	return groupReceiptsByYear(activeReceipts);
}

export async function getReceiptsForPurchaseEdit(
	purchaseId: string,
): Promise<ReceiptsByYear[]> {
	const db = getDatabase();
	
	// Get all receipts
	const allReceipts = await db.getReceipts();
	
	// Get receipts linked to this purchase via entity relationships
	const relationships = await db.getEntityRelationships("reimbursement", purchaseId);
	const linkedReceiptIds = new Set<string>();
	for (const rel of relationships) {
		if (rel.relationBType === "receipt") {
			linkedReceiptIds.add(rel.relationBId);
		} else if (rel.relationAType === "receipt") {
			linkedReceiptIds.add(rel.relationId);
		}
	}
	
	// Include: (1) receipts linked to this purchase, (2) unlinked receipts
	const merged = allReceipts.filter(r => linkedReceiptIds.has(r.id) || !Array.from(linkedReceiptIds).some(id => allReceipts.find(ar => ar.id === id)?.id === r.id));
	
	// Filter out drafts and dedupe by pathname
	const seen = new Set<string>();
	const unique = merged.filter((r) => {
		if (!r.pathname || !r.url) return false; // Skip drafts
		if (seen.has(r.pathname)) return false;
		seen.add(r.pathname);
		return true;
	}) as Array<{
		pathname: string;
		name: string | null;
		url: string;
		createdAt: Date;
	}>;
	return groupReceiptsByYear(unique);
}

export async function getReceiptContentBase64(
	receipt: ReceiptLink,
): Promise<string | null> {
	return getReceiptStorage().getReceiptContentBase64(receipt.url);
}

export type { ReceiptsByYear } from "./types";
export { buildReceiptPath } from "./utils";
