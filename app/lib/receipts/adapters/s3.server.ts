import { randomBytes } from "node:crypto";
import { getReceiptsPrefix } from "~/lib/receipts/utils";
import type {
	ReceiptStorageAdapter,
	ReceiptsByYear,
	UploadOptions,
	UploadResult,
	RenameResult,
	FileMetadata,
} from "../types";

// Dynamic imports for AWS SDK - only loaded when S3 adapter is used
type S3Client = import("@aws-sdk/client-s3").S3Client;

function getS3Config() {
	const endpoint = process.env.S3_ENDPOINT;
	const region = process.env.S3_REGION || "us-east-1";
	const bucket = process.env.S3_BUCKET;
	const accessKeyId = process.env.S3_ACCESS_KEY_ID;
	const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
	const publicUrl = process.env.S3_PUBLIC_URL;
	const forcePathStyle = process.env.S3_FORCE_PATH_STYLE === "true";

	if (!bucket || !accessKeyId || !secretAccessKey) {
		throw new Error(
			"S3 configuration incomplete. Required: S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY",
		);
	}

	return {
		endpoint,
		region,
		bucket,
		accessKeyId,
		secretAccessKey,
		publicUrl,
		forcePathStyle,
	};
}

async function createS3Client(): Promise<S3Client> {
	const config = getS3Config();
	const { S3Client } = await import("@aws-sdk/client-s3");
	return new S3Client({
		region: config.region,
		endpoint: config.endpoint,
		credentials: {
			accessKeyId: config.accessKeyId,
			secretAccessKey: config.secretAccessKey,
		},
		forcePathStyle: config.forcePathStyle,
	});
}

function pathnameToKey(pathname: string): string {
	const prefix = getReceiptsPrefix();
	return pathname.startsWith(prefix) ? pathname : `${prefix}${pathname}`;
}

function keyToPathname(key: string): string {
	const prefix = getReceiptsPrefix();
	return key.startsWith(prefix) ? key : `${prefix}${key}`;
}

function getPublicUrl(key: string): string {
	const config = getS3Config();
	if (config.publicUrl) {
		const cleanUrl = config.publicUrl.replace(/\/$/, "");
		const cleanKey = key.startsWith("/") ? key : `/${key}`;
		return `${cleanUrl}${cleanKey}`;
	}

	// Fallback: generate signed URL (for private buckets)
	// Note: This requires async, so we'll handle it in the methods that need it
	return "";
}

async function generatePublicUrl(key: string, client: S3Client): Promise<string> {
	const config = getS3Config();
	if (config.publicUrl) {
		return getPublicUrl(key);
	}

	// Generate signed URL for private buckets
	const { GetObjectCommand } = await import("@aws-sdk/client-s3");
	const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
	const command = new GetObjectCommand({
		Bucket: config.bucket,
		Key: key,
	});
	const url = await getSignedUrl(client, command, { expiresIn: 3600 });
	return url;
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

function groupReceiptsByYear(
	objects: Array<{ key: string; url: string; lastModified: Date }>,
): ReceiptsByYear[] {
	const results = new Map<string, ReceiptsByYear>();
	const prefix = getReceiptsPrefix();

	for (const obj of objects) {
		const pathname = keyToPathname(obj.key);
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
			url: obj.url,
			createdTime: obj.lastModified.toISOString(),
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

async function listAllReceiptObjects(client: S3Client): Promise<
	Array<{ key: string; url: string; lastModified: Date }>
> {
	const config = getS3Config();
	const { ListObjectsV2Command } = await import("@aws-sdk/client-s3");
	const prefix = pathnameToKey(getReceiptsPrefix());
	const objects: Array<{ key: string; url: string; lastModified: Date }> = [];
	let continuationToken: string | undefined;

	do {
		const command = new ListObjectsV2Command({
			Bucket: config.bucket,
			Prefix: prefix,
			ContinuationToken: continuationToken,
			MaxKeys: 1000,
		});

		const response = await client.send(command);
		if (response.Contents) {
			for (const obj of response.Contents) {
				if (obj.Key && obj.LastModified) {
					const url = await generatePublicUrl(obj.Key, client);
					objects.push({
						key: obj.Key,
						url,
						lastModified: obj.LastModified,
					});
				}
			}
		}
		continuationToken = response.NextContinuationToken;
	} while (continuationToken);

	return objects;
}

export class S3ReceiptStorage implements ReceiptStorageAdapter {
	private clientPromise: Promise<S3Client>;

	constructor() {
		this.clientPromise = createS3Client();
	}

	private async getClient(): Promise<S3Client> {
		return this.clientPromise;
	}

	async listReceiptsByYear(): Promise<ReceiptsByYear[]> {
		const client = await this.getClient();
		const objects = await listAllReceiptObjects(client);
		return groupReceiptsByYear(objects);
	}

	async getReceiptContentBase64(receiptUrl: string): Promise<string | null> {
		if (!receiptUrl) {
			return null;
		}

		try {
			const { GetObjectCommand } = await import("@aws-sdk/client-s3");
			const client = await this.getClient();
			// Extract key from URL
			const urlObj = new URL(receiptUrl);
			const pathname = urlObj.pathname;
			const key = pathnameToKey(pathname);

			const config = getS3Config();
			const command = new GetObjectCommand({
				Bucket: config.bucket,
				Key: key,
			});

			const response = await client.send(command);
			if (!response.Body) {
				return null;
			}

			const arrayBuffer = await response.Body.transformToByteArray();
			return Buffer.from(arrayBuffer).toString("base64");
		} catch (error) {
			console.error("[S3ReceiptStorage] getReceiptContentBase64 error:", error);
			return null;
		}
	}

	async uploadFile(
		pathname: string,
		file: File | Buffer,
		options?: UploadOptions,
	): Promise<UploadResult> {
		const { PutObjectCommand } = await import("@aws-sdk/client-s3");
		const client = await this.getClient();
		let finalPathname = pathname;

		if (options?.addRandomSuffix) {
			finalPathname = addRandomSuffix(pathname);
		}

		const key = pathnameToKey(finalPathname);
		const config = getS3Config();

		let buffer: Buffer;
		if (file instanceof File) {
			const arrayBuffer = await file.arrayBuffer();
			buffer = Buffer.from(arrayBuffer);
		} else {
			buffer = file;
		}

		// Detect content type from file extension
		const ext = finalPathname.split(".").pop()?.toLowerCase() || "";
		const contentTypeMap: Record<string, string> = {
			pdf: "application/pdf",
			jpg: "image/jpeg",
			jpeg: "image/jpeg",
			png: "image/png",
			webp: "image/webp",
		};
		const contentType = contentTypeMap[ext] || "application/octet-stream";

		const command = new PutObjectCommand({
			Bucket: config.bucket,
			Key: key,
			Body: buffer,
			ContentType: contentType,
			ACL: options?.access === "public" ? "public-read" : undefined,
		});

		await client.send(command);

		const url = await generatePublicUrl(key, client);

		return {
			url,
			pathname: finalPathname,
		};
	}

	async deleteFile(pathname: string): Promise<void> {
		const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
		const client = await this.getClient();
		const key = pathnameToKey(pathname);
		const config = getS3Config();

		const command = new DeleteObjectCommand({
			Bucket: config.bucket,
			Key: key,
		});

		await client.send(command);
	}

	async renameFile(
		fromPathname: string,
		toPathname: string,
	): Promise<RenameResult> {
		const { HeadObjectCommand, CopyObjectCommand } = await import("@aws-sdk/client-s3");
		const client = await this.getClient();
		const fromKey = pathnameToKey(fromPathname);
		const toKey = pathnameToKey(toPathname);
		const config = getS3Config();

		// Check if source exists
		const headCommand = new HeadObjectCommand({
			Bucket: config.bucket,
			Key: fromKey,
		});

		try {
			await client.send(headCommand);
		} catch {
			throw new Error(`File not found: ${fromPathname}`);
		}

		// Copy object
		const copyCommand = new CopyObjectCommand({
			Bucket: config.bucket,
			CopySource: `${config.bucket}/${fromKey}`,
			Key: toKey,
		});

		await client.send(copyCommand);

		// Delete original
		await this.deleteFile(fromPathname);

		const url = await generatePublicUrl(toKey, client);

		return {
			url,
			pathname: toPathname,
		};
	}

	async getFileMetadata(pathname: string): Promise<FileMetadata | null> {
		try {
			const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
			const client = await this.getClient();
			const key = pathnameToKey(pathname);
			const config = getS3Config();

			const command = new HeadObjectCommand({
				Bucket: config.bucket,
				Key: key,
			});

			const response = await client.send(command);
			const url = await generatePublicUrl(key, client);

			return {
				url,
				pathname,
				contentType: response.ContentType || "application/octet-stream",
				size: response.ContentLength,
				uploadedAt: response.LastModified,
			};
		} catch (error) {
			console.error("[S3ReceiptStorage] getFileMetadata error:", error);
			return null;
		}
	}
}
