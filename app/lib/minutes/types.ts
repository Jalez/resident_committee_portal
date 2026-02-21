export interface MinuteFileMetadata {
	url: string;
	pathname: string;
}

export interface UploadResult {
	url: string;
	pathname: string;
}

export interface UploadOptions {
	access: "public";
}

export interface MinuteStorageAdapter {
	uploadFile(
		pathname: string,
		file: File | Buffer,
		options?: UploadOptions,
	): Promise<UploadResult>;
	deleteFile(pathname: string): Promise<void>;
	getMinuteContentBase64(url: string): Promise<string | null>;
	listMinutes(): Promise<MinuteFileMetadata[]>;
}
