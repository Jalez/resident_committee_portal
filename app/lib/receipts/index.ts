import type { ReceiptLink } from "~/lib/treasury/receipt-validation";
import { VercelBlobReceiptStorage } from "./adapters/vercel-blob.server";
import type { ReceiptStorageAdapter, ReceiptsByYear } from "./types";

export type ReceiptStorageProvider = "vercel-blob";

interface ReceiptStorageConfig {
	provider: ReceiptStorageProvider;
}

export function createReceiptStorage(
	config: ReceiptStorageConfig,
): ReceiptStorageAdapter {
	switch (config.provider) {
		case "vercel-blob":
			return new VercelBlobReceiptStorage();
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

export async function getReceiptContentBase64(
	receipt: ReceiptLink,
): Promise<string | null> {
	return getReceiptStorage().getReceiptContentBase64(receipt.url);
}

export type { ReceiptsByYear } from "./types";
export { buildReceiptPath } from "./utils";
