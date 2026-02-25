import type { RelationshipEntityType } from "~/db/types";

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
	/** Function to generate URL for deleting the entity */
	deleteUrl: (id: string) => string;
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
			deleteUrl: (id) => `/treasury/receipts/${id}/delete`,
			statusVariants: GENERIC_VARIANTS,
			supportsUpload: true,
			supportsAIDraft: true,
			supportsDraft: true,
		},
		transaction: {
			type: "transaction",
			labelKey: "common.entity_types.transaction",
			pluralKey: "treasury.transactions.title",
			icon: "swap_horiz",
			detailUrl: (id) => `/treasury/transactions/${id}`,
			editUrl: (id) => `/treasury/transactions/${id}/edit`,
			deleteUrl: (id) => `/treasury/transactions/${id}/delete`,
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
			deleteUrl: (id) => `/treasury/reimbursements/${id}/delete`,
			statusVariants: PURCHASE_VARIANTS,
			supportsUpload: false,
			supportsAIDraft: true,
			supportsDraft: true,
		},
		budget: {
			type: "budget",
			labelKey: "common.entity_types.budget",
			pluralKey: "treasury.budgets.title",
			icon: "bookmark",
			detailUrl: (id) => `/treasury/budgets/${id}`,
			editUrl: (id) => `/treasury/budgets/${id}/edit`,
			deleteUrl: (id) => `/treasury/budgets/${id}/delete`,
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
			deleteUrl: (id) => `/inventory/${id}/delete`,
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
			deleteUrl: (id) => `/minutes/${id}/delete`,
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
			deleteUrl: (id) => `/news/${id}/delete`,
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
			deleteUrl: (id) => `/faq/${id}/delete`,
			statusVariants: GENERIC_VARIANTS,
			supportsUpload: false,
			supportsAIDraft: false,
			supportsDraft: true,
		},
		poll: {
			type: "poll",
			labelKey: "common.entity_types.poll",
			pluralKey: "polls.title",
			icon: "poll",
			detailUrl: (id) => `/polls/${id}`,
			editUrl: (id) => `/polls/${id}/edit`,
			deleteUrl: (id) => `/polls/${id}/delete`,
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
			editUrl: (id) => `/social/${id}/edit`,
			deleteUrl: (id) => `/social/${id}/delete`,
			statusVariants: GENERIC_VARIANTS,
			supportsUpload: false,
			supportsAIDraft: false,
			supportsDraft: true,
		},
		event: {
			type: "event",
			labelKey: "common.entity_types.event",
			pluralKey: "events.title",
			icon: "event",
			detailUrl: (id) => `/events/${id}`,
			editUrl: (id) => `/events/${id}/edit`,
			deleteUrl: (id) => `/events/${id}/delete`,
			statusVariants: GENERIC_VARIANTS,
			supportsUpload: false,
			supportsAIDraft: false,
			supportsDraft: true,
		},
		submission: {
			type: "submission",
			labelKey: "common.entity_types.submission",
			pluralKey: "submissions.title",
			icon: "contact_mail",
			detailUrl: (id) => `/submissions/${id}`,
			editUrl: (id) => `/submissions/${id}/edit`,
			deleteUrl: (id) => `/submissions/${id}/delete`,
			statusVariants: GENERIC_VARIANTS,
			supportsUpload: false,
			supportsAIDraft: false,
			supportsDraft: false,
		},
		mail_thread: {
			type: "mail_thread",
			labelKey: "common.entity_types.mail_thread",
			pluralKey: "mail.header",
			icon: "mail",
			detailUrl: (id) => `/mail/thread/${id}`,
			editUrl: (_id) => `/mail`,
			deleteUrl: (_id) => `/mail`,
			statusVariants: GENERIC_VARIANTS,
			supportsUpload: false,
			supportsAIDraft: false,
			supportsDraft: true,
		},
		message: {
			type: "message",
			labelKey: "common.entity_types.message",
			pluralKey: "messages.title",
			icon: "notifications",
			detailUrl: (id) => `/messages`,
			editUrl: (id) => `/messages`,
			deleteUrl: (id) => `/messages`,
			statusVariants: GENERIC_VARIANTS,
			supportsUpload: false,
			supportsAIDraft: false,
			supportsDraft: false,
		},
	};
