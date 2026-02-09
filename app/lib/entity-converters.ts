import type {
    InventoryItem,
    Purchase,
    Receipt,
    Transaction,
    Minute,
    News,
    Faq,
    FundBudget,
    RelationshipEntityType,
} from "~/db/schema";
import type { TreasuryRelationItem } from "~/components/relation-actions";
import type { LinkableItem } from "~/components/link-existing-selector";
import { ENTITY_REGISTRY } from "./entity-registry";

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
    | Faq;

/**
 * Helper to get a consistent display title for any entity
 */
export function getEntityTitle(type: RelationshipEntityType, entity: AnyEntity): string {
    if (!entity) return "Unknown";

    switch (type) {
        case "receipt":
            return (entity as Receipt).name || (entity as Receipt).description || "Untitled Receipt";
        case "transaction":
            return (entity as Transaction).description;
        case "reimbursement":
            return (
                (entity as Purchase).description ||
                (entity as Purchase).minutesName ||
                "Untitled Reimbursement"
            );
        case "budget":
            return (entity as FundBudget).name;
        case "inventory":
            return (entity as InventoryItem).name;
        case "minute":
            return (entity as Minute).date
                ? `${new Date((entity as Minute).date!).toLocaleDateString()} - ${(entity as Minute).title || "Minutes"}`
                : (entity as Minute).title || "Draft Minutes";
        case "news":
            return (entity as News).title;
        case "faq":
            return (entity as Faq).question;
        default:
            return "Unknown Entity";
    }
}

/**
 * Helper to get a consistent status for any entity
 */
export function getEntityStatus(type: RelationshipEntityType, entity: AnyEntity): string {
    if (!entity) return "unknown";

    // Most entities have a 'status' field, but some might not or have different names
    // Check if 'status' property exists
    if ('status' in entity && typeof (entity as any).status === 'string') {
        return (entity as any).status;
    }

    return "active"; // Default fallback
}

/**
 * Converts any entity to the format required by TreasuryRelationActions (RelationActions)
 */
export function entityToRelationItem(
    type: RelationshipEntityType,
    entity: AnyEntity
): TreasuryRelationItem {
    const config = ENTITY_REGISTRY[type];
    const title = getEntityTitle(type, entity);
    const status = getEntityStatus(type, entity);

    let description: string | null = null;
    let subtitle: string | null = null;

    // Type-specific descriptions
    if (type === "transaction") {
        const t = entity as Transaction;
        subtitle = `${parseFloat(t.amount).toFixed(2)} € | ${new Date(t.date).toLocaleDateString()}`;
    } else if (type === "reimbursement") {
        const p = entity as Purchase;
        subtitle = `${parseFloat(p.amount).toFixed(2)} € | ${p.purchaserName}`;
    } else if (type === "receipt") {
        // Receipt might use pathname as ID but let's use the DB ID
        // URL is handled by detailUrl
    }

    return {
        id: entity.id,
        to: config.detailUrl(entity.id), // Use detail URL (e.g. /treasury/transactions/123)
        title: title,
        status: status,
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
    entity: AnyEntity
): LinkableItem {
    const config = ENTITY_REGISTRY[type];
    const title = getEntityTitle(type, entity);
    const status = getEntityStatus(type, entity);

    let description: string | null = null;
    let amount: string | undefined = undefined;
    let purchaserName: string | undefined = undefined;
    let createdAt: Date | undefined = entity.createdAt;

    if (type === "transaction") {
        const t = entity as Transaction;
        amount = parseFloat(t.amount).toFixed(2) + " €";
        description = t.description;
        createdAt = t.date;
    } else if (type === "reimbursement") {
        const p = entity as Purchase;
        amount = parseFloat(p.amount).toFixed(2) + " €";
        description = p.description;
        purchaserName = p.purchaserName;
    } else if (type === "budget") {
        const b = entity as FundBudget;
        amount = parseFloat(b.amount).toFixed(2) + " €";
        description = b.description;
    } else if (type === "inventory") {
        const i = entity as InventoryItem;
        description = i.description;
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
