import { randomBytes } from "node:crypto";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getReceiptsPrefix } from "~/lib/receipts/utils";
import type {
	FileMetadata,
	ReceiptStorageAdapter,
	ReceiptsByYear,
	RenameResult,
	UploadOptions,
	UploadResult,
} from "../types";

function getBaseUrl(): string {
	if (process.env.RECEIPT_STORAGE_BASE_URL) {
		return process.env.RECEIPT_STORAGE_BASE_URL;
	}
	if (process.env.APP_URL) {
		return process.env.APP_URL;
	}
	if (process.env.VERCEL_URL) {
		return `https://${process.env.VERCEL_URL}`;
	}
	return "http://localhost:5173";
}

function getStorageDir(): string {
	return (
		process.env.RECEIPT_STORAGE_DIR || join(process.cwd(), "public", "receipts")
	);
}

function ensureDirectoryExists(filePath: string): void {
	const dir = dirname(filePath);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
}

function addRandomSuffix(pathname: string): string {
	const parts = pathname.split("/");
	const filename = parts[parts.length - 1];
	const extIndex = filename.lastIndexOf(".");
	const base = extIndex > 0 ? filename.slice(0, extIndex) : filename;
	const ext = extIndex > 0 ? filename.slice(extIndex) : "";
	const randomSuffix = randomBytes(4).toString("hex");
	const newFilename = `${base}_${randomSuffix}${ext}`;
	return [...parts.slice(0, -1), newFilename].join("/");
}

function pathnameToUrl(pathname: string): string {
	const baseUrl = getBaseUrl().replace(/\/$/, "");
	const cleanPathname = pathname.startsWith("/") ? pathname : `/${pathname}`;
	return `${baseUrl}${cleanPathname}`;
}

function pathnameToFilePath(pathname: string): string {
	const storageDir = getStorageDir();
	const prefix = getReceiptsPrefix();
	const relativePath = pathname.startsWith(prefix)
		? pathname.slice(prefix.length)
		: pathname;
	return join(storageDir, relativePath);
}

function groupReceiptsByYear(
	files: Array<{ pathname: string; url: string; mtime: Date }>,
): ReceiptsByYear[] {
	const results = new Map<string, ReceiptsByYear>();
	const prefix = getReceiptsPrefix();

	for (const file of files) {
		const pathname = file.pathname;
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
			url: file.url,
			createdTime: file.mtime.toISOString(),
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
		yearEntry.files.sort((a, b) => b.createdTime.localeCompare(a.createdTime));
	}

	return sorted;
}

function getAllReceiptFiles(): Array<{
	pathname: string;
	url: string;
	mtime: Date;
}> {
	const storageDir = getStorageDir();
	const prefix = getReceiptsPrefix();
	const files: Array<{ pathname: string; url: string; mtime: Date }> = [];

	if (!existsSync(storageDir)) {
		return files;
	}

	function walkDir(dir: string, relativePath: string = ""): void {
		const entries = readdirSync(dir, { withFileTypes: true });

		for (const entry of entries) {
			const fullPath = join(dir, entry.name);
			const relative = relativePath
				? `${relativePath}/${entry.name}`
				: entry.name;

			if (entry.isDirectory()) {
				walkDir(fullPath, relative);
			} else if (entry.isFile()) {
				const pathname = `${prefix}${relative}`;
				const stats = statSync(fullPath);
				files.push({
					pathname,
					url: pathnameToUrl(pathname),
					mtime: stats.mtime,
				});
			}
		}
	}

	walkDir(storageDir);
	return files;
}

export class FilesystemReceiptStorage implements ReceiptStorageAdapter {
	async listReceiptsByYear(): Promise<ReceiptsByYear[]> {
		const files = getAllReceiptFiles();
		return groupReceiptsByYear(files);
	}

	async getReceiptContentBase64(receiptUrl: string): Promise<string | null> {
		if (!receiptUrl) {
			return null;
		}

		try {
			// Extract pathname from URL
			const urlObj = new URL(receiptUrl);
			const pathname = urlObj.pathname;
			const filePath = pathnameToFilePath(pathname);

			if (!existsSync(filePath)) {
				return null;
			}

			const buffer = await readFile(filePath);
			return buffer.toString("base64");
		} catch (error) {
			console.error(
				"[FilesystemReceiptStorage] getReceiptContentBase64 error:",
				error,
			);
			return null;
		}
	}

	async uploadFile(
		pathname: string,
		file: File | Buffer,
		options?: UploadOptions,
	): Promise<UploadResult> {
		let finalPathname = pathname;

		if (options?.addRandomSuffix) {
			finalPathname = addRandomSuffix(pathname);
		}

		const filePath = pathnameToFilePath(finalPathname);
		ensureDirectoryExists(filePath);

		let buffer: Buffer;
		if (file instanceof File) {
			const arrayBuffer = await file.arrayBuffer();
			buffer = Buffer.from(arrayBuffer);
		} else {
			buffer = file;
		}

		writeFileSync(filePath, buffer);

		return {
			url: pathnameToUrl(finalPathname),
			pathname: finalPathname,
		};
	}

	async deleteFile(pathname: string): Promise<void> {
		const filePath = pathnameToFilePath(pathname);
		if (existsSync(filePath)) {
			unlinkSync(filePath);
		}
	}

	async renameFile(
		fromPathname: string,
		toPathname: string,
	): Promise<RenameResult> {
		const fromPath = pathnameToFilePath(fromPathname);
		const toPath = pathnameToFilePath(toPathname);

		if (!existsSync(fromPath)) {
			throw new Error(`File not found: ${fromPathname}`);
		}

		ensureDirectoryExists(toPath);
		copyFileSync(fromPath, toPath);
		unlinkSync(fromPath);

		return {
			url: pathnameToUrl(toPathname),
			pathname: toPathname,
		};
	}

	async getFileMetadata(pathname: string): Promise<FileMetadata | null> {
		try {
			const filePath = pathnameToFilePath(pathname);
			if (!existsSync(filePath)) {
				return null;
			}

			const stats = statSync(filePath);
			const ext = pathname.split(".").pop()?.toLowerCase() || "";
			const contentTypeMap: Record<string, string> = {
				pdf: "application/pdf",
				jpg: "image/jpeg",
				jpeg: "image/jpeg",
				png: "image/png",
				webp: "image/webp",
			};
			const contentType = contentTypeMap[ext] || "application/octet-stream";

			return {
				url: pathnameToUrl(pathname),
				pathname,
				contentType,
				size: stats.size,
				uploadedAt: stats.mtime,
			};
		} catch (error) {
			console.error("[FilesystemReceiptStorage] getFileMetadata error:", error);
			return null;
		}
	}
}
