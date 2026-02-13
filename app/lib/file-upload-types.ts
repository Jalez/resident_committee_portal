export type FileEntityType = "receipt" | "minute" | "avatar";

export interface FileTypeConfig {
	extensions: readonly string[];
	mimeTypes: readonly string[];
	maxSizeMB?: number;
}

export const FILE_TYPE_CONFIGS: Record<FileEntityType, FileTypeConfig> = {
	receipt: {
		extensions: [".pdf", ".jpg", ".jpeg", ".png", ".webp"],
		mimeTypes: [
			"application/pdf",
			"image/jpeg",
			"image/png",
			"image/webp",
		],
		maxSizeMB: 10,
	},
	minute: {
		extensions: [".pdf", ".doc", ".docx", ".txt"],
		mimeTypes: [
			"application/pdf",
			"application/msword",
			"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
			"text/plain",
		],
		maxSizeMB: 20,
	},
	avatar: {
		extensions: [".jpg", ".jpeg", ".png", ".webp"],
		mimeTypes: ["image/jpeg", "image/png", "image/webp"],
		maxSizeMB: 5,
	},
} as const;

export interface FileUploadResult {
	url: string;
	pathname: string;
	name?: string;
}

export interface FileUploadError {
	error: string;
	allowedTypes?: string;
	message?: string;
}

export function isAllowedExtension(
	entityType: FileEntityType,
	extension: string,
): boolean {
	const config = FILE_TYPE_CONFIGS[entityType];
	const ext = extension.startsWith(".") ? extension : `.${extension}`;
	return config.extensions.includes(ext.toLowerCase() as any);
}

export function isAllowedMimeType(
	entityType: FileEntityType,
	mimeType: string,
): boolean {
	const config = FILE_TYPE_CONFIGS[entityType];
	return config.mimeTypes.includes(mimeType as any);
}

export function getAllowedExtensionsString(entityType: FileEntityType): string {
	return FILE_TYPE_CONFIGS[entityType].extensions.join(", ");
}

export function getAllowedMimeTypesString(entityType: FileEntityType): string {
	return FILE_TYPE_CONFIGS[entityType].mimeTypes.join(", ");
}
