import { useTranslation } from "react-i18next";
import {
    TreasuryRelationActions,
    type TreasuryRelationItem,
} from "~/components/treasury/treasury-relation-actions";
import type { LinkableItem } from "~/components/treasury/link-existing-selector";
import type { InventoryItem } from "~/db/schema";
import type { EntityType } from "~/lib/linking/source-context";

export type InventoryPickerItem = {
    itemId: string;
    name: string;
    quantity: number;
    unitValue: number;
};

// Helper to convert available InventoryItems to LinkableItems
function inventoryToLinkableItems(items: InventoryItem[]): LinkableItem[] {
    return items.map((item) => {
        const isIncomplete = item.needsCompletion || !item.location;
        const locationDisplay = item.location || "Location TBD";

        return {
            id: item.id,
            title: `${item.name}${isIncomplete ? " ⚠️" : ""} (${locationDisplay})`,
            description: item.name,
            amount: item.value && item.value !== "0"
                ? `${parseFloat(item.value).toFixed(2).replace(".", ",")} €`
                : undefined,
            to: `/inventory/${item.id}`,
            status: isIncomplete ? "incomplete" : "available",
            variantMap: {
                available: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
                incomplete: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 border-yellow-200",
            },
        };
    });
}

type InventoryPickerProps = {
    /** Currently linked items */
    linkedItems: InventoryPickerItem[];
    /** Items available for selection (all items) */
    availableItems: InventoryItem[];
    /** Callback when selection changes (includes existing + new additions) */
    onSelectionChange: (items: InventoryPickerItem[]) => void;
    /** URL to navigate to when creating a new inventory item */
    createUrl?: string;
    /** Current path for navigation */
    currentPath?: string;
    /** Storage key for persistence */
    storageKey?: string;
    /** Source entity context (e.g., from transaction page) */
    sourceEntityType?: EntityType;
    sourceEntityId?: string;
    sourceEntityName?: string;
};

export function InventoryPicker({
    linkedItems,
    availableItems,
    onSelectionChange,
    createUrl = "/inventory/new",
    currentPath,
    storageKey,
    sourceEntityType,
    sourceEntityId,
    sourceEntityName,
}: InventoryPickerProps) {
    const { t } = useTranslation();

    // Map to TreasuryRelationItem for display badges
    const displayItems: TreasuryRelationItem[] = linkedItems.map((item) => ({
        id: item.itemId,
        to: `/inventory/${item.itemId}`,
        title: `${item.name} (${item.quantity} kpl)`,
        description: item.unitValue > 0
            ? `${(item.unitValue * item.quantity).toFixed(2).replace(".", ",")} €`
            : undefined,
        status: "linked",
        variantMap: { linked: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80" },
    }));

    // Filter out already-linked items from the linkable list
    const linkedIds = new Set(linkedItems.map((i) => i.itemId));
    const unlinkedItems = availableItems.filter((item) => !linkedIds.has(item.id));

    // Handle linking an existing item by ID
    const handleLinkExisting = (id: string) => {
        const inventoryItem = availableItems.find((i) => i.id === id);
        if (!inventoryItem) return;

        const newItem: InventoryPickerItem = {
            itemId: id,
            name: inventoryItem.name,
            quantity: 1,
            unitValue: parseFloat(inventoryItem.value || "0"),
        };

        onSelectionChange([...linkedItems, newItem]);
    };

    return (
        <TreasuryRelationActions
            label={t("inventory.link_inventory_item")}
            mode="edit"
            items={displayItems}
            onRemove={(id) => onSelectionChange(linkedItems.filter((i) => i.itemId !== id))}
            addUrl={createUrl}
            addLabel={t("treasury.new.add_item")}
            currentPath={currentPath}
            storageKey={storageKey}
            linkableItems={inventoryToLinkableItems(unlinkedItems)}
            onSelectionChange={handleLinkExisting}
            linkExistingLabel={t("common.actions.link_existing")}

            sourceEntityType={sourceEntityType}
            sourceEntityId={sourceEntityId}
            sourceEntityName={sourceEntityName}
        />
    );
}
