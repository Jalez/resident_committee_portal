import type { RelationshipEntityType } from "~/db/types";
import { ENTITY_REGISTRY } from "./entity-registry";

export const TREASURY_PURCHASE_STATUS_VARIANTS: Record<string, string> = {
	pending:
		"bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
	approved: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
	reimbursed:
		"bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
	rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
	draft: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
};

export const TREASURY_TRANSACTION_STATUS_VARIANTS: Record<string, string> = {
	complete:
		"bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
	pending:
		"bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
	paused: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
	declined: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
	draft: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
};

export const TREASURY_RECEIPT_STATUS_VARIANTS: Record<string, string> = {
	active:
		"bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
	draft: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
	archived: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

export const TREASURY_BUDGET_STATUS_VARIANTS: Record<string, string> = {
	open: "bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary",
	closed: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
	draft: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
};

export const INVENTORY_STATUS_VARIANTS: Record<string, string> = {
	active:
		"bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
	draft: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
	removed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
	legacy: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

export const MINUTE_STATUS_VARIANTS: Record<string, string> = {
	active:
		"bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
	draft: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
	archived: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

export const EVENT_STATUS_VARIANTS: Record<string, string> = {
	active:
		"bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
	draft: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
	cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
	completed: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
};

export const NEWS_STATUS_VARIANTS: Record<string, string> = {
	active:
		"bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
	draft: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
	archived: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

export const POLL_STATUS_VARIANTS: Record<string, string> = {
	active:
		"bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
	closed: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
	draft: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
};

export const SOCIAL_STATUS_VARIANTS: Record<string, string> = {
	active:
		"bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
	draft: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
	archived: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

export const FAQ_STATUS_VARIANTS: Record<string, string> = {
	active:
		"bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
	draft: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
	archived: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

export const DEFAULT_STATUS_VARIANT =
	"bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300";

export interface RelationTypeConfig {
	icon: string;
	route: string;
	labelKey: string;
	statusVariantMap: Record<string, string>;
	getName: (entity: unknown) => string;
	getStatus: (entity: unknown) => string | null;
}

function getEntityName(entity: unknown, field: string): string {
	if (!entity || typeof entity !== "object") return "—";
	const record = entity as Record<string, unknown>;
	return String(record[field] ?? "—");
}

function getEntityStatus(entity: unknown): string | null {
	if (!entity || typeof entity !== "object") return null;
	const record = entity as Record<string, unknown>;
	const status = record.status;
	return typeof status === "string" ? status : null;
}

export const RELATION_CONFIG: Record<
	RelationshipEntityType,
	RelationTypeConfig
> = {
	receipt: {
		icon: ENTITY_REGISTRY.receipt.icon,
		route: "/treasury/receipts",
		labelKey: "common.relation_types.receipt",
		statusVariantMap: TREASURY_RECEIPT_STATUS_VARIANTS,
		getName: (entity) => getEntityName(entity, "name"),
		getStatus: getEntityStatus,
	},
	transaction: {
		icon: ENTITY_REGISTRY.transaction.icon,
		route: "/treasury/transactions",
		labelKey: "common.relation_types.transaction",
		statusVariantMap: TREASURY_TRANSACTION_STATUS_VARIANTS,
		getName: (entity) => getEntityName(entity, "description"),
		getStatus: getEntityStatus,
	},
	reimbursement: {
		icon: ENTITY_REGISTRY.reimbursement.icon,
		route: "/treasury/reimbursements",
		labelKey: "common.relation_types.reimbursement",
		statusVariantMap: TREASURY_PURCHASE_STATUS_VARIANTS,
		getName: (entity) => {
			if (!entity || typeof entity !== "object") return "—";
			const record = entity as Record<string, unknown>;
			return String(record.description ?? record.purchaserName ?? "—");
		},
		getStatus: getEntityStatus,
	},
	budget: {
		icon: ENTITY_REGISTRY.budget.icon,
		route: "/treasury/budgets",
		labelKey: "common.relation_types.budget",
		statusVariantMap: TREASURY_BUDGET_STATUS_VARIANTS,
		getName: (entity) => getEntityName(entity, "name"),
		getStatus: getEntityStatus,
	},
	inventory: {
		icon: ENTITY_REGISTRY.inventory.icon,
		route: "/inventory",
		labelKey: "common.relation_types.inventory",
		statusVariantMap: INVENTORY_STATUS_VARIANTS,
		getName: (entity) => getEntityName(entity, "name"),
		getStatus: getEntityStatus,
	},
	minute: {
		icon: ENTITY_REGISTRY.minute.icon,
		route: "/minutes",
		labelKey: "common.relation_types.minute",
		statusVariantMap: MINUTE_STATUS_VARIANTS,
		getName: (entity) => getEntityName(entity, "title"),
		getStatus: getEntityStatus,
	},
	news: {
		icon: ENTITY_REGISTRY.news.icon,
		route: "/news",
		labelKey: "common.relation_types.news",
		statusVariantMap: NEWS_STATUS_VARIANTS,
		getName: (entity) => getEntityName(entity, "title"),
		getStatus: getEntityStatus,
	},
	faq: {
		icon: ENTITY_REGISTRY.faq.icon,
		route: "/faq",
		labelKey: "common.relation_types.faq",
		statusVariantMap: FAQ_STATUS_VARIANTS,
		getName: (entity) => getEntityName(entity, "question"),
		getStatus: getEntityStatus,
	},
	poll: {
		icon: ENTITY_REGISTRY.poll.icon,
		route: "/polls",
		labelKey: "common.relation_types.poll",
		statusVariantMap: POLL_STATUS_VARIANTS,
		getName: (entity) => getEntityName(entity, "name"),
		getStatus: getEntityStatus,
	},
	social: {
		icon: ENTITY_REGISTRY.social.icon,
		route: "/social",
		labelKey: "common.relation_types.social",
		statusVariantMap: SOCIAL_STATUS_VARIANTS,
		getName: (entity) => getEntityName(entity, "name"),
		getStatus: getEntityStatus,
	},
	mail: {
		icon: ENTITY_REGISTRY.mail.icon,
		route: "/mail/messages",
		labelKey: "common.relation_types.mail",
		statusVariantMap: {},
		getName: (entity) => getEntityName(entity, "subject"),
		getStatus: () => null,
	},
	event: {
		icon: ENTITY_REGISTRY.event.icon,
		route: "/events",
		labelKey: "common.relation_types.event",
		statusVariantMap: EVENT_STATUS_VARIANTS,
		getName: (entity) => getEntityName(entity, "title"),
		getStatus: getEntityStatus,
	},
	submission: {
		icon: ENTITY_REGISTRY.submission.icon,
		route: "/submissions",
		labelKey: "common.relation_types.submission",
		statusVariantMap: {},
		getName: (entity) => getEntityName(entity, "name"),
		getStatus: (entity) => {
			if (!entity || typeof entity !== "object") return null;
			const record = entity as Record<string, unknown>;
			const status = record.status;
			if (typeof status !== "string") return null;
			// Extract English part for variant matching
			const parts = status.split(" / ");
			return parts[1]?.toLowerCase() || parts[0]?.toLowerCase() || null;
		},
	},
	message: {
		icon: "notifications",
		route: "/messages",
		labelKey: "common.relation_types.message",
		statusVariantMap: {},
		getName: (entity) => getEntityName(entity, "title"),
		getStatus: () => null,
	},
};

export function getStatusVariant(
	entityType: RelationshipEntityType,
	status: string | null,
): string {
	const config = RELATION_CONFIG[entityType];
	if (!status || !config.statusVariantMap[status]) {
		return DEFAULT_STATUS_VARIANT;
	}
	return config.statusVariantMap[status];
}
