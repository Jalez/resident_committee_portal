import type { RelationshipEntityType } from "~/db/types";

export interface FieldConfig {
	type:
	| "text"
	| "number"
	| "date"
	| "select"
	| "textarea"
	| "currency"
	| "checkbox"
	| "time"
	| "hidden"
	| "url";
	labelKey?: string;
	required?: boolean;
	options?: string[] | { label: string; value: string }[];
	placeholder?: string;
	description?: string;
	className?: string;
	valueClassName?: string;
	disabled?: boolean;
	min?: string;
	max?: string;
	step?: string;
	hidden?: boolean;
}

export interface RelationshipConfig {
	maxItems?: number; // If undefined, unlimited
	labelKey?: string;
}

export interface RequiredRelationshipConfig {
	/** The entity type that must be linked */
	type: RelationshipEntityType;
	/** Minimum number of items required (default: 1) */
	minItems?: number;
	/** Human-readable reason why this is required */
	reasonKey?: string;
}

/**
 * Entity definition configuration
 * Defines the structure/metadata of entities, safe for client-side use.
 */
export interface EntityDefinition {
	/** Entity type from the relationship system */
	type: RelationshipEntityType;

	/** Permission prefix for CRUD operations (e.g. "faq" → "faq:read", "faq:update", etc.) */
	permissionPrefix: string;

	/** Required fields for validation */
	requiredFields: string[];

	/** Default redirect after successful update (if no returnUrl) */
	defaultRedirect: string | ((id: string) => string);

	/** Fields to check for draft auto-publish */
	draftAutoPublishFields?: string[];

	/** Support for permissionOrSelf pattern (e.g. treasury items) */
	supportsPermissionOrSelf?: boolean;

	/** Field name that stores the creator user ID (for permissionOrSelf) */
	createdByField?: string;

	/** Field configurations for forms */
	fields?: Record<string, FieldConfig>;

	/** Relationship configurations */
	relationships?: Partial<Record<RelationshipEntityType, RelationshipConfig>>;

	/** Required relationships for certain actions (e.g., sending reimbursement email) */
	requiredRelationships?: RequiredRelationshipConfig[];
}

export const ENTITY_DEFINITIONS: Record<
	RelationshipEntityType,
	EntityDefinition
> = {
	faq: {
		type: "faq",
		permissionPrefix: "faq",
		requiredFields: ["question", "answer"],
		defaultRedirect: "/faq",
		draftAutoPublishFields: ["question", "answer"],
		fields: {
			question: { type: "text", required: true },
			answer: { type: "textarea", required: true },
			questionSecondary: { type: "text" },
			answerSecondary: { type: "textarea" },
			sortOrder: { type: "number" },
		},
	},

	news: {
		type: "news",
		permissionPrefix: "news",
		requiredFields: ["title", "content"],
		defaultRedirect: "/news",
		draftAutoPublishFields: ["title", "content"],
		fields: {
			title: { type: "text", required: true },
			summary: { type: "text" }, // Short summary
			content: { type: "textarea", required: true },
			titleSecondary: { type: "text" },
			summarySecondary: { type: "text" },
			contentSecondary: { type: "textarea" },
			status: {
				type: "select",
				options: [
					{ value: "draft", label: "Draft" },
					{ value: "published", label: "Published" },
					{ value: "archived", label: "Archived" },
				],
			},
		},
		relationships: {
			message: {},
		},
	},

	minute: {
		type: "minute",
		permissionPrefix: "minutes",
		requiredFields: ["title", "date"],
		defaultRedirect: "/minutes",
		draftAutoPublishFields: ["title", "date"],
		fields: {
			date: { type: "date", required: true },
			title: { type: "text", required: true },
			description: { type: "textarea" },
		},
		relationships: {
			reimbursement: {},
			inventory: {},
		},
	},

	budget: {
		type: "budget",
		permissionPrefix: "treasury:budgets",
		requiredFields: ["name", "amount"],
		defaultRedirect: (id) => `/treasury/budgets/${id}?success=updated`,
		draftAutoPublishFields: ["name", "amount"],
		fields: {
			name: { type: "text", required: true },
			description: { type: "textarea" },
			amount: { type: "currency", required: true },
		},
		relationships: {
			transaction: {},
		},
		supportsPermissionOrSelf: true,
		createdByField: "createdBy",
	},

	transaction: {
		type: "transaction",
		permissionPrefix: "treasury:transactions",
		requiredFields: ["description", "amount"],
		defaultRedirect: (id) => `/treasury/transactions/${id}?success=updated`,
		draftAutoPublishFields: ["description", "amount"],
		fields: {
			description: { type: "text", required: true },
			amount: { type: "currency", required: true },
			status: {
				type: "select",
				options: [
					{ value: "pending", label: "Pending" },
					{ value: "complete", label: "Complete" },
					{ value: "paused", label: "Paused" },
					{ value: "declined", label: "Declined" },
				],
			},
			reimbursementStatus: { type: "hidden" },
			notes: { type: "textarea" },
		},
		relationships: {
			budget: { maxItems: 1 },
			reimbursement: { maxItems: 1 },
			inventory: {}, // Unlimited
		},
		supportsPermissionOrSelf: true,
		createdByField: "createdBy",
	},

	reimbursement: {
		type: "reimbursement",
		permissionPrefix: "treasury:reimbursements",
		requiredFields: ["purchaserName", "bankAccount", "amount", "description"],
		fields: {
			purchaserName: { type: "text", required: true },
			bankAccount: { type: "text", required: true },
			amount: { type: "currency", required: true },
			description: { type: "textarea", required: true },
			year: {
				type: "select",
				required: true,
			},
			notes: { type: "textarea", required: false },
			minutesId: { type: "hidden" },
			minutesName: { type: "hidden" },
			status: {
				type: "select",
				options: [
					{ value: "pending", label: "Pending" },
					{ value: "approved", label: "Approved" },
					{ value: "reimbursed", label: "Reimbursed" },
					{ value: "rejected", label: "Rejected" },
				],
			},
		},
		relationships: {
			receipt: {},
			transaction: { maxItems: 1 },
			minute: { maxItems: 1 },
			budget: {},
			inventory: {},
			news: {},
			faq: {},
			poll: {},
			social: {},
			event: {},
			mail_thread: {},
			message: {},
		},
		requiredRelationships: [
			{
				type: "receipt",
				minItems: 1,
				reasonKey: "treasury.reimbursements.required_receipt_reason",
			},
			{
				type: "minute",
				minItems: 1,
				reasonKey: "treasury.reimbursements.required_minute_reason",
			},
		],
		defaultRedirect: (id) => `/treasury/reimbursements/${id}?success=updated`,
		draftAutoPublishFields: [
			"description",
			"amount",
			"purchaserName",
			"bankAccount",
		],
		supportsPermissionOrSelf: true,
		createdByField: "createdBy",
	},

	receipt: {
		type: "receipt",
		permissionPrefix: "treasury:receipts",
		requiredFields: ["name"],
		defaultRedirect: "/treasury/receipts",
		supportsPermissionOrSelf: true,
		createdByField: "createdBy",
		fields: {
			name: { type: "text", required: true },
			description: { type: "textarea" },
		},
		relationships: {
			reimbursement: { maxItems: 1 },
			transaction: {},
			inventory: {},
		},
	},

	inventory: {
		type: "inventory",
		permissionPrefix: "inventory",
		requiredFields: ["name", "quantity", "location"],
		defaultRedirect: "/inventory",
		fields: {
			name: { type: "text", required: true },
			quantity: { type: "number", required: true, min: "0" },
			location: { type: "text", required: true },
			category: { type: "text" },
			description: { type: "textarea" },
			status: {
				type: "select",
				options: [
					{ value: "active", label: "Active" },
					{ value: "removed", label: "Removed" },
					{ value: "legacy", label: "Legacy" },
				],
			},
			purchasedAt: { type: "date" },
			showInInfoReel: { type: "checkbox" },
		},
		relationships: {
			transaction: {},
		},
	},

	poll: {
		type: "poll",
		permissionPrefix: "polls",
		requiredFields: ["status"],
		defaultRedirect: "/polls",
		fields: {
			name: { type: "text", required: true },
			description: { type: "textarea" },
			externalUrl: { type: "url", required: true },
			status: {
				type: "select",
				options: [
					{ value: "draft", label: "Draft" },
					{ value: "active", label: "Active" },
					{ value: "closed", label: "Closed" },
				],
			},
			deadlineDate: { type: "date" },
			deadlineTime: { type: "time" },
			analyticsSheetId: { type: "select" },
		},
		relationships: {
			minute: {},
			news: {},
			transaction: {},
		},
	},

	event: {
		type: "event",
		permissionPrefix: "events",
		requiredFields: [],
		defaultRedirect: "/events",
		fields: {
			title: { type: "text", required: true },
			description: { type: "textarea" },
			location: { type: "text" },
			isAllDay: { type: "checkbox" },
			startDate: { type: "date", required: true },
			startTime: { type: "time" },
			endDate: { type: "date" },
			endTime: { type: "time" },
			attendees: { type: "textarea" },
		},
		relationships: {
			minute: {},
			news: {},
			transaction: {},
		},
	},
	submission: {
		type: "submission",
		permissionPrefix: "submissions",
		requiredFields: ["name", "message"],
		defaultRedirect: "/submissions",
		fields: {
			name: { type: "text", required: true },
			email: { type: "text", required: true },
			apartmentNumber: { type: "text" },
			type: {
				type: "select",
				options: [
					{ value: "committee", label: "Committee" },
					{ value: "events", label: "Events" },
					{ value: "purchases", label: "Purchases" },
					{ value: "questions", label: "Questions" },
				],
			},
			message: { type: "textarea", required: true },
			status: {
				type: "select",
				options: [
					{ value: "Uusi / New", label: "New" },
					{ value: "Käsittelyssä / In Progress", label: "In Progress" },
					{ value: "Hyväksytty / Approved", label: "Approved" },
					{ value: "Hylätty / Rejected", label: "Rejected" },
					{ value: "Valmis / Done", label: "Done" },
				],
			},
		},
	},
	social: {} as any,
	message: {
		type: "message",
		permissionPrefix: "messages",
		requiredFields: [],
		defaultRedirect: "/messages",
		relationships: {
			reimbursement: { maxItems: 1 },
			news: { maxItems: 1 },
		},
	},
	mail_thread: {
		type: "mail_thread",
		permissionPrefix: "committee",
		requiredFields: [],
		defaultRedirect: "/mail",
		relationships: {
			receipt: {},
			transaction: {},
			reimbursement: {},
			budget: {},
			inventory: {},
			minute: {},
			news: {},
			faq: {},
			poll: {},
			social: {},
			event: {},
			submission: {},
			message: {},
		},
	},
};
