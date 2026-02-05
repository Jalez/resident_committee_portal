import { copy, del, head, list, put } from "@vercel/blob";
import { getReceiptsPrefix } from "~/lib/receipts/utils";
import type {
	ReceiptStorageAdapter,
	ReceiptsByYear,
	UploadOptions,
	UploadResult,
	RenameResult,
	FileMetadata,
} from "../types";

type ListedBlob = {
	url: string;
	pathname: string;
	uploadedAt?: string | Date;
};

function normalizeUploadedAt(uploadedAt?: string | Date): string {
	if (!uploadedAt) {
		return new Date().toISOString();
	}
	return new Date(uploadedAt).toISOString();
}

async function listAllReceiptBlobs(): Promise<ListedBlob[]> {
	const prefix = getReceiptsPrefix();
	const blobs: ListedBlob[] = [];
	let cursor: string | undefined;

	do {
		const response = await list({
			prefix,
			cursor,
			limit: 1000,
		});
		blobs.push(...(response.blobs as ListedBlob[]));
		cursor = response.cursor || undefined;
	} while (cursor);

	return blobs;
}

function groupReceiptsByYear(blobs: ListedBlob[]): ReceiptsByYear[] {
	const results = new Map<string, ReceiptsByYear>();
	const prefix = getReceiptsPrefix();

	for (const blob of blobs) {
		const pathname = blob.pathname || "";
		if (!pathname.startsWith(prefix)) {
			continue;
		}

		const parts = pathname.split("/").filter(Boolean);
		if (parts.length < 3) {
			continue;
		}

		const year = parts[1];
		if (!/^\d{4}$/.test(year)) {
			continue;
		}

		const name = parts[parts.length - 1] || "receipt";
		const entry = results.get(year) || {
			year,
			files: [],
			folderUrl: "#",
			folderId: "",
		};

		entry.files.push({
			id: pathname,
			name,
			url: blob.url,
			createdTime: normalizeUploadedAt(blob.uploadedAt),
		});

		results.set(year, entry);
	}

	const currentYear = new Date().getFullYear().toString();
	if (!results.has(currentYear)) {
		results.set(currentYear, {
			year: currentYear,
			files: [],
			folderUrl: "#",
			folderId: "",
		});
	}

	const sorted = Array.from(results.values()).sort(
		(a, b) => parseInt(b.year, 10) - parseInt(a.year, 10),
	);

	for (const yearEntry of sorted) {
		yearEntry.files.sort(
			(a, b) => b.createdTime.localeCompare(a.createdTime),
		);
	}

	return sorted;
}

export class VercelBlobReceiptStorage implements ReceiptStorageAdapter {
	async listReceiptsByYear(): Promise<ReceiptsByYear[]> {
		// No server-side cache: in-memory cache doesn't work reliably in serverless
		// (each instance has its own cache, and onUploadCompleted may run on a different instance).
		// Vercel Blob list() is fast enough to fetch fresh on each request.
		const blobs = await listAllReceiptBlobs();
		return groupReceiptsByYear(blobs);
	}

	async getReceiptContentBase64(receiptUrl: string): Promise<string | null> {
		if (!receiptUrl) {
			return null;
		}

		try {
			const response = await fetch(receiptUrl);
			if (!response.ok) {
				console.error(
					`[receiptStorage] Failed to download receipt: ${response.status}`,
				);
				return null;
			}

			const arrayBuffer = await response.arrayBuffer();
			return Buffer.from(arrayBuffer).toString("base64");
		} catch (error) {
			console.error("[receiptStorage] Download error:", error);
			return null;
		}
	}

	async uploadFile(
		pathname: string,
		file: File | Buffer,
		options?: UploadOptions,
	): Promise<UploadResult> {
		const blob = await put(pathname, file, {
			access: options?.access || "public",
			addRandomSuffix: options?.addRandomSuffix ?? true,
		});

		return {
			url: blob.url,
			pathname: blob.pathname,
		};
	}

	async deleteFile(pathname: string): Promise<void> {
		await del(pathname);
	}

	async renameFile(
		fromPathname: string,
		toPathname: string,
	): Promise<RenameResult> {
		const result = await copy(fromPathname, toPathname, {
			access: "public",
		});
		await del(fromPathname);

		return {
			url: result.url,
			pathname: result.pathname,
		};
	}

	async getFileMetadata(pathname: string): Promise<FileMetadata | null> {
		try {
			const meta = await head(pathname);
			return {
				url: meta.url,
				pathname: meta.pathname,
				contentType: meta.contentType,
				size: meta.size,
				uploadedAt: meta.uploadedAt,
			};
		} catch (error) {
			console.error("[VercelBlobReceiptStorage] getFileMetadata error:", error);
			return null;
		}
	}
}
