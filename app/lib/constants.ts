// Shared constants that can be used on both client and server

export const SUBMISSION_STATUSES = [
	"Uusi / New",
	"Käsittelyssä / In Progress",
	"Hyväksytty / Approved",
	"Hylätty / Rejected",
	"Valmis / Done",
] as const;

export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

// Receipt upload constants
export const RECEIPT_MAX_SIZE_BYTES = 500 * 1024; // 500KB - easily adjustable
export const RECEIPT_MAX_SIZE_MB = RECEIPT_MAX_SIZE_BYTES / (1024 * 1024);
export const RECEIPT_ALLOWED_TYPES = [
	".pdf",
	".jpg",
	".jpeg",
	".png",
	".webp",
] as const;
export const RECEIPT_ALLOWED_MIME_TYPES = [
	"application/pdf",
	"image/jpeg",
	"image/png",
	"image/webp",
] as const;
