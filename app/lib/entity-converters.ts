import type { LinkableItem } from "~/components/link-existing-selector";
import type { TreasuryRelationItem } from "~/components/relation-actions";
import type {
	CommitteeMailMessage,
	Faq,
	FundBudget,
	InventoryItem,
	Minute,
	News,
	Poll,
	Purchase,
	Receipt,
	SocialLink,
	Transaction,
} from "~/db/schema";
import type { RelationshipEntityType } from "~/db/types";
import { ENTITY_REGISTRY } from "./entity-registry";
import { formatDate } from "./format-utils";

/**
 * Union type for all possible entity objects
 */
export type AnyEntity =
	| Receipt
	| Transaction
	| Purchase
	| FundBudget
	| InventoryItem
	| Minute
	| News
	| Faq
	| Poll
	| SocialLink
	| CommitteeMailMessage
	| {
		id: string;
		summary: string;
		title?: string;
		name?: string;
		description?: string;
		status?: string;
		createdAt?: Date;
		start?: { dateTime: string; date: string };
	};

/**
 * Helper to get a consistent display title for any entity
 */
export function getEntityTitle(
	type: RelationshipEntityType,
	entity: AnyEntity,
): string {
	if (!entity) return "Unknown";

	switch (type) {
		case "receipt":
			return (
				(entity as any).name ||
				(entity as any).description ||
				"Untitled Receipt"
			);
		case "transaction":
			return (entity as any).description;
		case "reimbursement":
			return (
				(entity as any).description ||
				(entity as any).minutesName ||
				"Untitled Reimbursement"
			);
		case "budget":
			return (entity as any).name;
		case "inventory":
			return (entity as any).name;
		case "minute":
			return (entity as any).date
				? `${formatDate(new Date((entity as any).date!))} - ${(entity as any).title || "Minutes"}`
				: (entity as any).title || "Draft Minutes";
		case "news":
			return (entity as any).title;
		case "faq":
			return (entity as any).question;
		case "poll":
			return (entity as any).name;
		case "social":
			return (entity as any).name;
		case "mail":
			return (entity as any).subject || "Draft email";
		case "event":
			return (
				(entity as any).summary || (entity as any).title || "Untitled Event"
			);
		default:
			return "Unknown Entity";
	}
}

/**
 * Helper to get a consistent status for any entity
 */
export function getEntityStatus(
	type: RelationshipEntityType,
	entity: AnyEntity,
): string {
	if (!entity) return "unknown";

	// Mail drafts do not have a status field in DB, but should behave like draft entities.
	if (type === "mail") {
		const record = entity as Record<string, unknown>;
		if ("draftType" in record) {
			return "draft";
		}
	}

	// Most entities have a 'status' field, but some might not or have different names
	// Check if 'status' property exists
	if ("status" in entity && typeof (entity as any).status === "string") {
		return (entity as any).status;
	}

	return "active"; // Default fallback
}

/**
 * Converts any entity to the format required by TreasuryRelationActions (RelationActions)
 * @param currentPath - If provided, draft entities will link to their edit page with a returnUrl query param
 */
export function entityToRelationItem(
	type: RelationshipEntityType,
	entity: AnyEntity,
	currentPath?: string,
): TreasuryRelationItem {
	const config = ENTITY_REGISTRY[type];
	const title = getEntityTitle(type, entity);
	const status = getEntityStatus(type, entity);

	const description: string | null = null;
	let subtitle: string | null = null;

	// Type-specific descriptions
	if (type === "transaction") {
		const t = entity as Transaction;
		subtitle = `${parseFloat(t.amount || "0").toFixed(2)} € | ${formatDate(new Date(t.date))}`;
	} else if (type === "reimbursement") {
		const p = entity as Purchase;
		subtitle = `${parseFloat(p.amount || "0").toFixed(2)} € | ${p.purchaserName}`;
	}

	// Link to edit page for drafts, detail page otherwise
	// Always include returnUrl when currentPath is provided so user can navigate back
	let targetUrl =
		status === "draft"
			? config.editUrl(entity.id)
			: config.detailUrl(entity.id);
	if (currentPath) {
		targetUrl += `?returnUrl=${encodeURIComponent(currentPath)}`;
	}

	return {
		id: entity.id,
		to: targetUrl,
		title: title,
		status: status,
		icon: config.icon,
		variantMap: config.statusVariants,
		description: description,
		subtitle: subtitle,
	};
}

/**
 * Converts any entity to the format required by LinkableItemSelector
 */
export function entityToLinkableItem(
	type: RelationshipEntityType,
	entity: AnyEntity,
): LinkableItem {
	const config = ENTITY_REGISTRY[type];
	const title = getEntityTitle(type, entity);
	const status = getEntityStatus(type, entity);

	let description: string | null = null;
	let amount: string | undefined;
	let purchaserName: string | undefined;
	let createdAt: Date | undefined = (entity as any).createdAt;

	if (type === "transaction") {
		const t = entity as Transaction;
		amount = `${parseFloat(t.amount || "0").toFixed(2)} €`;
		description = t.description;
		createdAt = t.date;
	} else if (type === "reimbursement") {
		const p = entity as Purchase;
		amount = `${parseFloat(p.amount || "0").toFixed(2)} €`;
		description = p.description;
		purchaserName = p.purchaserName;
	} else if (type === "budget") {
		const b = entity as FundBudget;
		amount = `${parseFloat(b.amount || "0").toFixed(2)} €`;
		description = b.description;
	} else if (type === "inventory") {
		const i = entity as InventoryItem;
		description = i.description;
	} else if (type === "news") {
		description = (entity as any).content?.slice(0, 100);
	} else if (type === "faq") {
		description = (entity as any).answer?.slice(0, 100);
	} else if (type === "mail") {
		const m = entity as any;
		description =
			m.bodyText || m.bodyHtml?.replace(/<[^>]+>/g, "").slice(0, 100);
		purchaserName = m.fromName || m.fromAddress;
		createdAt = m.date;
	} else if (type === "event") {
		const e = entity as any;
		description = e.description?.slice(0, 100);
		createdAt = e.start?.dateTime
			? new Date(e.start.dateTime)
			: e.start?.date
				? new Date(e.start.date)
				: undefined;
	}

	return {
		id: entity.id,
		title: title,
		description: description || title,
		amount,
		createdAt,
		purchaserName,
		to: config.detailUrl(entity.id),
		viewLink: config.detailUrl(entity.id),
		status: status,
		variantMap: config.statusVariants,
	};
}
