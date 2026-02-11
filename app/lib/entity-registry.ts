import type { RelationshipEntityType } from "~/db/schema";

export interface EntityTypeConfig {
	type: RelationshipEntityType;
	labelKey: string;
	pluralKey: string;
	icon: string;
	/** Function to generate URL for viewing the entity details */
	detailUrl: (id: string) => string;
	/** Function to generate URL for editing the entity. Since we use draft-first workflow,
	 * this is used when creating new entities (create draft -> redirect to edit page) */
	editUrl: (id: string) => string;
	/** Tailwind classes for each status */
	statusVariants: Record<string, string>;
	supportsUpload: boolean;
	supportsAIDraft: boolean;
	supportsDraft: boolean;
}

// Status variants (copied from colored-status-link-badge.tsx to avoid component imports in lib)
const PURCHASE_VARIANTS = {
	pending:
		"bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
	approved: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
	reimbursed:
		"bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
	rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
	draft:
		"border-2 border-dashed border-muted-foreground/30 bg-transparent text-muted-foreground",
};

const TRANSACTION_VARIANTS = {
	complete:
		"bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
	pending:
		"bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
	paused: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
	declined: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
	draft:
		"border-2 border-dashed border-muted-foreground/30 bg-transparent text-muted-foreground",
};

const BUDGET_VARIANTS = {
	open: "bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary",
	closed: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
	draft:
		"border-2 border-dashed border-muted-foreground/30 bg-transparent text-muted-foreground",
};

const GENERIC_VARIANTS = {
	active: "bg-secondary text-secondary-foreground",
	archived: "bg-muted text-muted-foreground",
	draft:
		"border-2 border-dashed border-muted-foreground/30 bg-transparent text-muted-foreground",
};

export const ENTITY_REGISTRY: Record<RelationshipEntityType, EntityTypeConfig> =
{
	receipt: {
		type: "receipt",
		labelKey: "common.entity_types.receipt",
		pluralKey: "treasury.receipts.title",
		icon: "receipt_long",
		detailUrl: (id) => `/treasury/receipts/${id}`,
		editUrl: (id) => `/treasury/receipts/${id}/edit`,
		statusVariants: GENERIC_VARIANTS,
		supportsUpload: true,
		supportsAIDraft: true,
		supportsDraft: true,
	},
	transaction: {
		type: "transaction",
		labelKey: "common.entity_types.transaction",
		pluralKey: "treasury.transactions.title",
		icon: "paid",
		detailUrl: (id) => `/treasury/transactions/${id}`,
		editUrl: (id) => `/treasury/transactions/${id}/edit`,
		statusVariants: TRANSACTION_VARIANTS,
		supportsUpload: false,
		supportsAIDraft: true,
		supportsDraft: true,
	},
	reimbursement: {
		type: "reimbursement",
		labelKey: "common.entity_types.reimbursement", // needing update in locales
		pluralKey: "treasury.reimbursements.title",
		icon: "request_quote",
		detailUrl: (id) => `/treasury/reimbursements/${id}`,
		editUrl: (id) => `/treasury/reimbursements/${id}/edit`,
		statusVariants: PURCHASE_VARIANTS,
		supportsUpload: false,
		supportsAIDraft: true,
		supportsDraft: true,
	},
	budget: {
		type: "budget",
		labelKey: "common.entity_types.budget",
		pluralKey: "treasury.budgets.title",
		icon: "savings",
		detailUrl: (id) => `/treasury/budgets/${id}`,
		editUrl: (id) => `/treasury/budgets/${id}/edit`,
		statusVariants: BUDGET_VARIANTS,
		supportsUpload: false,
		supportsAIDraft: true,
		supportsDraft: true,
	},
	inventory: {
		type: "inventory",
		labelKey: "common.entity_types.inventory",
		pluralKey: "inventory.title",
		icon: "inventory_2",
		detailUrl: (id) => `/inventory/${id}`,
		editUrl: (id) => `/inventory/${id}/edit`,
		statusVariants: GENERIC_VARIANTS, // Inventory items have complex status, generic for now
		supportsUpload: false,
		supportsAIDraft: true,
		supportsDraft: true,
	},
	minute: {
		type: "minute",
		labelKey: "common.entity_types.minute",
		pluralKey: "minutes.title",
		icon: "description",
		detailUrl: (id) => `/minutes/${id}`,
		editUrl: (id) => `/minutes/${id}/edit`,
		statusVariants: GENERIC_VARIANTS,
		supportsUpload: true,
		supportsAIDraft: true, // Can act as source for news/faq
		supportsDraft: true,
	},
	news: {
		type: "news",
		labelKey: "common.entity_types.news",
		pluralKey: "news.title",
		icon: "newspaper",
		detailUrl: (id) => `/news/${id}`,
		editUrl: (id) => `/news/${id}/edit`,
		statusVariants: GENERIC_VARIANTS,
		supportsUpload: false,
		supportsAIDraft: false, // Usually generated FROM minutes
		supportsDraft: true, // News can be drafts
	},
	faq: {
		type: "faq",
		labelKey: "common.entity_types.faq",
		pluralKey: "faq.title",
		icon: "help",
		detailUrl: (id) => `/faq/${id}`,
		editUrl: (id) => `/faq/${id}/edit`,
		statusVariants: GENERIC_VARIANTS,
		supportsUpload: false,
		supportsAIDraft: false,
		supportsDraft: true,
	},
	poll: {
		type: "poll",
		labelKey: "common.entity_types.poll",
		pluralKey: "polls.title",
		icon: "ballot",
		detailUrl: (id) => `/polls/${id}`,
		editUrl: (id) => `/polls/${id}/edit`,
		statusVariants: GENERIC_VARIANTS,
		supportsUpload: false,
		supportsAIDraft: false,
		supportsDraft: true,
	},
	social: {
		type: "social",
		labelKey: "common.entity_types.social",
		pluralKey: "social.header",
		icon: "share",
		detailUrl: (_id) => `/social`,
		editUrl: (id) => `/social?edit=${id}`,
		statusVariants: GENERIC_VARIANTS,
		supportsUpload: false,
		supportsAIDraft: false,
		supportsDraft: true,
	},
	event: {
		type: "event",
		labelKey: "common.entity_types.event",
		pluralKey: "events.title",
		icon: "calendar_month",
		detailUrl: (id) => `/events/${id}`,
		editUrl: (id) => `/events/${id}/edit`,
		statusVariants: GENERIC_VARIANTS,
		supportsUpload: false,
		supportsAIDraft: false,
		supportsDraft: true,
	},
	mail: {
		type: "mail",
		labelKey: "common.entity_types.mail",
		pluralKey: "mail.header",
		icon: "mail",
		detailUrl: (id) => `/mail/${id}`,
		editUrl: (id) => `/mail/${id}/reply`,
		statusVariants: GENERIC_VARIANTS,
		supportsUpload: false,
		supportsAIDraft: true, // Can act as source
		supportsDraft: true,
	},
};
