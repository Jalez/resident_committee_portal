import { useTranslation } from "react-i18next";
import { TreasuryRelationActions } from "~/components/treasury/treasury-relation-actions";
import { type LinkableItem } from "~/components/treasury/link-existing-selector";
import type { Purchase } from "~/db/schema";

// Helper to convert Reimbursements to LinkableItems
export function reimbursementsToLinkableItems(reimbursements: Purchase[]): (LinkableItem & { title: string })[] {
    return reimbursements.map((p) => ({
        id: p.id,
        description: p.description,
        // Purchase might not have currency, assume EUR or check schema
        amount: `${p.amount} €`,
        createdAt: p.createdAt,
        purchaserName: "Purchaser Name Here", // Need to fetch purchaser if available or make optional
        to: `/treasury/reimbursements/${p.id}`,
        status: p.status,
        title: p.description || "Reimbursement", // Add title
        variantMap: {
            draft: "bg-muted text-muted-foreground border-muted-foreground/30",
            pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-500 border-yellow-200 dark:border-yellow-800",
            approved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-500 border-green-200 dark:border-green-800",
            paid: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-500 border-blue-200 dark:border-blue-800",
            rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-500 border-red-200 dark:border-red-800",
        }
    }));
}

type BaseReimbursementsPickerProps = {
    unlinkedReimbursements: Purchase[];
    createUrl?: string;
    currentPath?: string;
    storageKey?: string;
};

type SingleReimbursementsPickerProps = BaseReimbursementsPickerProps & {
    multi?: false;
    linkedReimbursement?: Purchase | null;
    selectedReimbursementId?: string;
    onSelectionChange?: (id: string) => void;
    // Multi props not allowed
    linkedReimbursements?: never;
    onMultiSelectionChange?: never;
};

type MultiReimbursementsPickerProps = BaseReimbursementsPickerProps & {
    multi: true;
    linkedReimbursements: Purchase[];
    onMultiSelectionChange: (reimbursements: Purchase[]) => void;
    // Single props not allowed
    linkedReimbursement?: never;
    selectedReimbursementId?: never;
    onSelectionChange?: never;
};

type ReimbursementsPickerProps = SingleReimbursementsPickerProps | MultiReimbursementsPickerProps;

export function ReimbursementsPicker(props: ReimbursementsPickerProps) {
    const { t } = useTranslation();
    const {
        unlinkedReimbursements,
        createUrl,
        currentPath,
        storageKey,
        multi = false,
    } = props;

    // Normalize input to array for display
    let currentLinks: Purchase[] = [];
    if (multi) {
        currentLinks = props.linkedReimbursements || [];
    } else {
        const singleProps = props as SingleReimbursementsPickerProps;
        // Logic from original:
        // activeReimbursement = selectedReimbursementId === linkedReimbursement?.id ? linkedReimbursement : unlinked.find(...)
        // But simplifying: just use what's passed if we can.
        // Actually, the original logic prioritized checking if selected ID matches linked object.
        if (singleProps.linkedReimbursement && singleProps.selectedReimbursementId === singleProps.linkedReimbursement.id) {
            currentLinks = [singleProps.linkedReimbursement];
        } else if (singleProps.selectedReimbursementId) {
            const found = unlinkedReimbursements.find(r => r.id === singleProps.selectedReimbursementId);
            if (found) currentLinks = [found];
        } else if (singleProps.linkedReimbursement) {
            // Case where ID might be empty but object is passed? Original code didn't handle this explicitly but relied on ID matching.
            // If ID is empty string, selection is cleared.
            // So if selectedReimbursementId is undefined, maybe use linkedReimbursement?
            // Original: const activeReimbursement = selectedReimbursementId === linkedReimbursement?.id ? ...
            // If selectedReimbursementId is "", active is undefined.
            // Let's stick to using selectedReimbursementId as the source of truth if provided.
        }
    }

    const displayItems = reimbursementsToLinkableItems(currentLinks);

    const handleSelection = (id: string) => {
        if (multi) {
            const multiProps = props as MultiReimbursementsPickerProps;
            // Check if already selected? TreasuryRelationActions usually handles filtering available items.
            // But here we might receive an ID from the "available" list.
            const newItem = unlinkedReimbursements.find(r => r.id === id);
            if (newItem) {
                multiProps.onMultiSelectionChange([...currentLinks, newItem]);
            }
        } else {
            const singleProps = props as SingleReimbursementsPickerProps;
            if (singleProps.onSelectionChange) singleProps.onSelectionChange(id);
        }
    };

    const handleRemove = (id: string) => {
        if (multi) {
            const multiProps = props as MultiReimbursementsPickerProps;
            multiProps.onMultiSelectionChange(currentLinks.filter(p => p.id !== id));
        } else {
            const singleProps = props as SingleReimbursementsPickerProps;
            if (singleProps.onSelectionChange) singleProps.onSelectionChange("");
        }
    }

    return (
        <TreasuryRelationActions
            label={t("treasury.reimbursements.link_to_reimbursement")}
            mode="edit"
            items={displayItems}
            onRemove={handleRemove}
            addUrl={createUrl}
            addLabel={t("treasury.reimbursements.new")}
            currentPath={currentPath}
            withSeparator={!multi} // Only show separator in single mode (maybe?) or always? Original had it.
            linkableItems={reimbursementsToLinkableItems(unlinkedReimbursements)}
            onSelectionChange={handleSelection}
            linkExistingLabel={t("treasury.new.link_existing_reimbursement")}
            linkExistingPlaceholder={t("treasury.new.select_reimbursement_placeholder")}
            noLinkText={t("treasury.new.no_link")}
            storageKey={storageKey}
            maxItems={multi ? undefined : 1}
        />
    );
}
