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
		| "hidden";
	labelKey?: string; // If not provided, inferred from entity prefix + field name
	required?: boolean; // Defaults to false
	options?: string[] | { label: string; value: string }[];
	placeholder?: string;
	description?: string;
	className?: string; // Wrapper class
	valueClassName?: string; // Class for the input itself
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
		requiredFields: ["description", "category", "amount"],
		defaultRedirect: (id) => `/treasury/transactions/${id}?success=updated`,
		draftAutoPublishFields: ["description", "category", "amount"],
		fields: {
			description: { type: "text", required: true },
			category: {
				type: "select",
				required: true,
				// Options will be populated by the component or loader if dynamic
			},
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
			notes: { type: "textarea" },
			minutesId: { type: "hidden" },
			minutesName: { type: "hidden" },
		},
		defaultRedirect: (id) =>
			`/treasury/reimbursements?year=${new Date().getFullYear()}&success=Reimbursement updated`,
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
			value: { type: "currency" },
			purchasedAt: { type: "date" },
			showInInfoReel: { type: "checkbox" },
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
			externalUrl: { type: "text", required: true },
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
	social: {} as any,
	mail: {
		type: "mail",
		permissionPrefix: "committee",
		requiredFields: [],
		defaultRedirect: "/mail",
	},
};
