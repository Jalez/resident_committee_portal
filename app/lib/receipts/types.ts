export interface ReceiptFile {
	id: string;
	name: string;
	url: string;
	createdTime: string;
}

export type ReceiptStorageProvider = "vercel-blob" | "filesystem";

export interface ReceiptsByYear {
	year: string;
	files: ReceiptFile[];
	folderUrl: string;
	folderId: string;
}

export interface UploadOptions {
	access?: "public" | "private";
}

export interface UploadResult {
	url: string;
	pathname: string;
}

export interface RenameResult {
	url: string;
	pathname: string;
}

export interface FileMetadata {
	url: string;
	pathname: string;
	contentType: string;
	size?: number;
	uploadedAt?: Date | string;
}

export interface ReceiptStorageAdapter {
	listReceiptsByYear: () => Promise<ReceiptsByYear[]>;
	getReceiptContentBase64: (receiptUrl: string) => Promise<string | null>;
	uploadFile: (
		pathname: string,
		file: File | Buffer,
		options?: UploadOptions,
	) => Promise<UploadResult>;
	deleteFile: (pathname: string) => Promise<void>;
	renameFile: (
		fromPathname: string,
		toPathname: string,
	) => Promise<RenameResult>;
	getFileMetadata: (pathname: string) => Promise<FileMetadata | null>;
}
