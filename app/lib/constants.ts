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
export const RECEIPT_ALLOWED_TYPES = [
	".pdf",
] as const;
export const RECEIPT_ALLOWED_MIME_TYPES = [
	"application/pdf",
] as const;
