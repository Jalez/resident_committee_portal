import { del } from "@vercel/blob";
import { getMinuteStorage } from "~/lib/minutes/storage.server";
import { getReceiptStorage } from "~/lib/receipts/server";
import type { FileEntityType, FileUploadResult, FileUploadError } from "./file-upload-types";
import {
	FILE_TYPE_CONFIGS,
	isAllowedExtension,
	isAllowedMimeType,
	getAllowedExtensionsString,
} from "./file-upload-types";
import { buildReceiptPath } from "./receipts/utils";
import { buildMinutePath } from "./minutes/utils";
import { getAvatarsPrefix } from "./avatars/utils";

export interface EntityWithFile {
	id: string;
	fileUrl?: string | null;
	fileKey?: string | null;
	url?: string | null;
	pathname?: string | null;
}

export function getStorageAdapter(entityType: FileEntityType) {
	switch (entityType) {
		case "receipt":
			return getReceiptStorage();
		case "minute":
			return getMinuteStorage();
		case "avatar":
			return null;
		default:
			throw new Error(`Unknown entity type: ${entityType}`);
	}
}

export function getEntityPrefix(entityType: FileEntityType): string {
	switch (entityType) {
		case "receipt":
			return "receipts/";
		case "minute":
			return "minutes/";
		case "avatar":
			return getAvatarsPrefix();
		default:
			throw new Error(`Unknown entity type: ${entityType}`);
	}
}

export function buildEntityPath(
	entityType: FileEntityType,
	year: string,
	filename: string,
	description?: string,
	date?: Date,
): string {
	switch (entityType) {
		case "receipt":
			return buildReceiptPath(year, filename, description || "kuitti", date);
		case "minute":
			return buildMinutePath(year, filename);
		case "avatar":
			throw new Error("Avatar paths should be built directly with userId");
		default:
			throw new Error(`Unknown entity type: ${entityType}`);
	}
}

export function buildAvatarPath(userId: string, extension: string): string {
	return `${getAvatarsPrefix()}${userId}.${extension.replace(/^\./, "")}`;
}

export function extractYearFromPath(pathname: string | null | undefined): string {
	if (!pathname) return new Date().getFullYear().toString();
	const match = pathname.match(/\/(\d{4})\//);
	return match ? match[1] : new Date().getFullYear().toString();
}

export async function handleFileUpload(options: {
	formData: FormData;
	entityType: FileEntityType;
	entity: EntityWithFile;
	name?: string;
	year?: string;
}): Promise<FileUploadResult | FileUploadError> {
	const { formData, entityType, entity, name, year } = options;

	const file = formData.get("file") as File | null;
	const tempUrl = formData.get("tempUrl") as string | null;
	const tempPathname = formData.get("tempPathname") as string | null;

	const currentYear = year || extractYearFromPath(entity.fileKey || entity.pathname);

	let nextUrl = entity.fileUrl || entity.url || null;
	let nextPathname = entity.fileKey || entity.pathname || null;
	let nextName = name?.trim() || null;

	if (tempUrl && tempPathname) {
		nextUrl = tempUrl;
		nextPathname = tempPathname;
	} else if (file) {
		const ext = `.${file.name.split(".").pop()?.toLowerCase()}`;
		if (!isAllowedExtension(entityType, ext)) {
			return {
				error: "invalid_file_type",
				allowedTypes: getAllowedExtensionsString(entityType),
			};
		}
		if (!isAllowedMimeType(entityType, file.type)) {
			return {
				error: "invalid_file_type",
				allowedTypes: getAllowedExtensionsString(entityType),
			};
		}

		const storage = getStorageAdapter(entityType);
		if (!storage) {
			return { error: "storage_not_available" };
		}

		const pathname = buildEntityPath(entityType, currentYear, file.name, nextName || "file");

		const uploadResult = await storage.uploadFile(pathname, file, {
			access: "public",
			addRandomSuffix: true,
		});
		nextUrl = uploadResult.url;
		nextPathname = uploadResult.pathname;
		if (!name?.trim()) {
			nextName = file.name;
		}
	}

	return {
		url: nextUrl || "",
		pathname: nextPathname || "",
		name: nextName || undefined,
	};
}

export async function deleteOldFile(
	entityType: FileEntityType,
	oldPathname: string | null | undefined,
): Promise<void> {
	if (!oldPathname) return;

	try {
		await del(oldPathname);
	} catch (error) {
		console.error(`[deleteOldFile] Failed to delete ${oldPathname}:`, error);
	}
}

export function validateFile(
	entityType: FileEntityType,
	file: File,
): FileUploadError | null {
	const ext = `.${file.name.split(".").pop()?.toLowerCase()}`;

	if (!isAllowedExtension(entityType, ext)) {
		return {
			error: "invalid_file_type",
			allowedTypes: getAllowedExtensionsString(entityType),
		};
	}

	if (!isAllowedMimeType(entityType, file.type)) {
		return {
			error: "invalid_file_type",
			allowedTypes: getAllowedExtensionsString(entityType),
		};
	}

	const config = FILE_TYPE_CONFIGS[entityType];
	if (config.maxSizeMB && file.size > config.maxSizeMB * 1024 * 1024) {
		return {
			error: "file_too_large",
			message: `File size exceeds ${config.maxSizeMB}MB limit`,
		};
	}

	return null;
}

export async function uploadTempFile(
	entityType: FileEntityType,
	file: File,
	year?: string,
): Promise<FileUploadResult | FileUploadError> {
	const validationError = validateFile(entityType, file);
	if (validationError) return validationError;

	const storage = getStorageAdapter(entityType);
	if (!storage) {
		return { error: "storage_not_available" };
	}

	const currentYear = year || new Date().getFullYear().toString();
	const pathname = buildEntityPath(entityType, currentYear, file.name, "temp");

	try {
		const result = await storage.uploadFile(pathname, file, {
			access: "public",
			addRandomSuffix: true,
		});

		return {
			url: result.url,
			pathname: result.pathname,
		};
	} catch (error) {
		console.error("[uploadTempFile] Error:", error);
		return {
			error: "upload_failed",
			message: error instanceof Error ? error.message : "Upload failed",
		};
	}
}

export async function deleteTempFile(
	pathname: string,
	entityType: FileEntityType,
): Promise<{ success: boolean; error?: string }> {
	if (!pathname) {
		return { success: false, error: "Pathname is required" };
	}

	const prefix = getEntityPrefix(entityType);
	if (!pathname.startsWith(prefix)) {
		return { success: false, error: "Invalid pathname for entity type" };
	}

	try {
		await del(pathname);
		return { success: true };
	} catch (error) {
		console.error("[deleteTempFile] Error:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : "Delete failed",
		};
	}
}
