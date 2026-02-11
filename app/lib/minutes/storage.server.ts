import fs from "node:fs/promises";
import path from "node:path";
import { del, list, put } from "@vercel/blob";
import type {
	MinuteStorageAdapter,
	UploadOptions,
	UploadResult,
} from "./types";
import { getMinutesPrefix } from "./utils";

// ==========================================
// Vercel Blob Adapter
// ==========================================
export class VercelBlobMinuteStorage implements MinuteStorageAdapter {
	async uploadFile(
		pathname: string,
		file: File | Buffer,
		options?: UploadOptions,
	): Promise<UploadResult> {
		const blob = await put(pathname, file, {
			access: "public",
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

	async getMinuteContentBase64(fileUrl: string): Promise<string | null> {
		if (!fileUrl) {
			return null;
		}

		try {
			const response = await fetch(fileUrl);
			if (!response.ok) {
				console.error(
					`[minuteStorage] Failed to download minute: ${response.status}`,
				);
				return null;
			}

			const arrayBuffer = await response.arrayBuffer();
			return Buffer.from(arrayBuffer).toString("base64");
		} catch (error) {
			console.error("[minuteStorage] Download error:", error);
			return null;
		}
	}

	async listMinutes(): Promise<{ url: string; pathname: string }[]> {
		const { blobs } = await list({ prefix: getMinutesPrefix() });
		return blobs.map((b) => ({
			url: b.url,
			pathname: b.pathname,
		}));
	}
}

// ==========================================
// Filesystem Adapter (Local Dev)
// ==========================================
export class FilesystemMinuteStorage implements MinuteStorageAdapter {
	private uploadDir = path.join(process.cwd(), "public/uploads");

	private async ensureDir(dir: string) {
		try {
			await fs.access(dir);
		} catch {
			await fs.mkdir(dir, { recursive: true });
		}
	}

	async uploadFile(
		pathname: string,
		file: File | Buffer,
		options?: UploadOptions,
	): Promise<UploadResult> {
		const fullPath = path.join(this.uploadDir, pathname);
		const dir = path.dirname(fullPath);
		await this.ensureDir(dir);

		let finalPath = fullPath;
		let finalPathname = pathname;

		if (options?.addRandomSuffix) {
			const ext = path.extname(pathname);
			const base = path.basename(pathname, ext);
			const random = Math.random().toString(36).substring(2, 8);
			const newFilename = `${base}-${random}${ext}`;
			finalPath = path.join(dir, newFilename);
			finalPathname = path.join(path.dirname(pathname), newFilename);
		}

		// Convert File to Buffer if needed
		let buffer: Buffer;
		if (Buffer.isBuffer(file)) {
			buffer = file;
		} else {
			const arrayBuffer = await file.arrayBuffer();
			buffer = Buffer.from(arrayBuffer);
		}

		await fs.writeFile(finalPath, buffer);

		return {
			url: `/uploads/${finalPathname}`,
			pathname: finalPathname,
		};
	}

	async deleteFile(pathname: string): Promise<void> {
		const fullPath = path.join(this.uploadDir, pathname);
		try {
			await fs.unlink(fullPath);
		} catch (error) {
			console.error(
				`[FilesystemMinuteStorage] Failed to delete ${fullPath}`,
				error,
			);
		}
	}

	async getMinuteContentBase64(fileUrl: string): Promise<string | null> {
		const relative = fileUrl.replace(/^\/uploads\//, "");
		const fullPath = path.join(this.uploadDir, relative);
		try {
			const buffer = await fs.readFile(fullPath);
			return buffer.toString("base64");
		} catch (error) {
			console.error(
				`[FilesystemMinuteStorage] Failed to read ${fullPath}`,
				error,
			);
			return null;
		}
	}

	async listMinutes(): Promise<{ url: string; pathname: string }[]> {
		const prefix = getMinutesPrefix();
		const fullPrefixPath = path.join(this.uploadDir, prefix);

		try {
			await this.ensureDir(fullPrefixPath);
			const entries = await fs.readdir(fullPrefixPath, {
				recursive: true,
				withFileTypes: true,
			});

			return entries
				.filter((e) => e.isFile())
				.map((e) => {
					const relativePath = path.relative(
						this.uploadDir,
						path.join(e.parentPath, e.name),
					);
					// ensure forward slashes
					const normalizedPath = relativePath.split(path.sep).join("/");
					return {
						url: `/uploads/${normalizedPath}`,
						pathname: normalizedPath,
					};
				});
		} catch (error) {
			console.error("[FilesystemMinuteStorage] List error:", error);
			return [];
		}
	}
}

// ==========================================
// Factory
// ==========================================
let storageInstance: MinuteStorageAdapter | null = null;

export function getMinuteStorage(): MinuteStorageAdapter {
	if (storageInstance) {
		return storageInstance;
	}

	// Default to filesystem in dev if not configured?
	// Or reuse RECEIPT_STORAGE_PROVIDER env var logic or a new one?
	// Receipts uses `process.env.RECEIPT_STORAGE_PROVIDER`.
	// Let's use `process.env.BLOB_STORAGE_PROVIDER` or fallback to receipts one.
	// Or just check required env vars for Vercel Blob.
	// Receipts logic: (process.env.RECEIPT_STORAGE_PROVIDER as ...) || "vercel-blob"

	const provider =
		(process.env.RECEIPT_STORAGE_PROVIDER as "vercel-blob" | "filesystem") ||
		"vercel-blob";

	if (provider === "filesystem") {
		storageInstance = new FilesystemMinuteStorage();
	} else {
		storageInstance = new VercelBlobMinuteStorage();
	}

	return storageInstance;
}
