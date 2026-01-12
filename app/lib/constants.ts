// Shared constants that can be used on both client and server

export const SUBMISSION_STATUSES = [
	"Uusi / New",
	"Käsittelyssä / In Progress",
	"Hyväksytty / Approved",
	"Hylätty / Rejected",
	"Valmis / Done",
] as const;

export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];
