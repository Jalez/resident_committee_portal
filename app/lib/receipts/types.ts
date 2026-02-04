export interface ReceiptFile {
	id: string;
	name: string;
	url: string;
	createdTime: string;
}

export interface ReceiptsByYear {
	year: string;
	files: ReceiptFile[];
	folderUrl: string;
	folderId: string;
}

export interface ReceiptStorageAdapter {
	listReceiptsByYear: () => Promise<ReceiptsByYear[]>;
	getReceiptContentBase64: (
		receiptUrl: string,
	) => Promise<string | null>;
}
