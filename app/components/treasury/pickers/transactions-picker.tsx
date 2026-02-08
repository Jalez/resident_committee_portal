import { useTranslation } from "react-i18next";
import { TreasuryRelationActions } from "~/components/treasury/treasury-relation-actions";
import { transactionsToLinkableItems } from "~/components/treasury/link-existing-selector";
import { TREASURY_TRANSACTION_STATUS_VARIANTS } from "~/components/treasury/colored-status-link-badge";
import type { Transaction } from "~/db/schema";
import type { EntityType } from "~/lib/linking/source-context";

type TransactionsPickerProps = {
    /** Already linked transactions */
    linkedTransactions?: Transaction[] | null;
    /** Transactions available for linking */
    unlinkedTransactions: Transaction[];
    /** ID of the currently selected transaction(s). Can be string or array of strings. */
    selectedTransactionIds: string | string[];
    /** Callback when selection changes */
    onSelectionChange: (ids: string | string[]) => void;
    /** URL for creating a new transaction */
    createUrl?: string;
    /** Current path for navigation context */
    currentPath?: string;
    /** Storage key for persistence */
    storageKey?: string;
    /** Optional custom label */
    label?: string;
    /** Optional custom add label */
    addLabel?: string;
    /** Optional custom link existing label */
    linkExistingLabel?: string;
    /** Optional custom link existing placeholder */
    linkExistingPlaceholder?: string;
    /** Optional custom no link text */
    noLinkText?: string;
    /** Maximum number of items that can be linked */
    maxItems?: number;
    /** Source entity context (e.g., from receipt or reimbursement page) */
    sourceEntityType?: EntityType;
    sourceEntityId?: string;
    sourceEntityName?: string;
};

export function TransactionsPicker({
    linkedTransactions,
    unlinkedTransactions,
    selectedTransactionIds,
    onSelectionChange,
    createUrl,
    currentPath,
    storageKey,
    label,
    addLabel,
    linkExistingLabel,
    linkExistingPlaceholder,
    noLinkText,
    maxItems = 1,
    sourceEntityType,
    sourceEntityId,
    sourceEntityName,
}: TransactionsPickerProps) {
    const { t } = useTranslation();

    const selectedIds = Array.isArray(selectedTransactionIds)
        ? selectedTransactionIds
        : selectedTransactionIds
            ? [selectedTransactionIds]
            : [];

    // Determine the items to show as "selected/linked"
    const activeTransactions = selectedIds.map(id => {
        return (
            linkedTransactions?.find((t) => t.id === id) ||
            unlinkedTransactions.find((t) => t.id === id)
        );
    }).filter(Boolean) as Transaction[];

    // Variant map logic: add 'unsaved' style if needed
    const variantMap = {
        ...TREASURY_TRANSACTION_STATUS_VARIANTS,
        unsaved: "border-2 border-dashed border-muted-foreground/30 bg-transparent text-muted-foreground hover:bg-muted/10",
    };

    const items = activeTransactions.map(tx => {
        const isLinked = linkedTransactions?.some(lt => lt.id === tx.id);
        const status = isLinked ? tx.status : "unsaved";

        return {
            to: `/treasury/transactions/${tx.id}`,
            title: tx.description,
            status: status,
            description: tx.description,
            id: tx.id,
            variantMap: variantMap,
        };
    });

    const handleSelectionChange = (id: string) => {
        if (maxItems === 1) {
            onSelectionChange(id);
        } else {
            // Support multiple if maxItems > 1
            if (!selectedIds.includes(id)) {
                onSelectionChange([...selectedIds, id]);
            }
        }
    };

    const handleRemove = (id: string) => {
        if (maxItems === 1) {
            onSelectionChange("");
        } else {
            onSelectionChange(selectedIds.filter(sid => sid !== id));
        }
    };

    return (
        <TreasuryRelationActions
            label={label || t("treasury.transactions.linked")}
            mode="edit"
            items={items}
            onRemove={handleRemove}
            addUrl={createUrl}
            addLabel={addLabel || t("treasury.transactions.create")}
            currentPath={currentPath}
            withSeparator
            linkableItems={transactionsToLinkableItems(unlinkedTransactions)}
            onSelectionChange={handleSelectionChange}
            linkExistingLabel={linkExistingLabel || t("treasury.transactions.link_existing")}
            linkExistingPlaceholder={linkExistingPlaceholder || t("treasury.transactions.select_placeholder")}
            noLinkText={noLinkText || t("treasury.transactions.no_link")}
            storageKey={storageKey}
            maxItems={maxItems}

            sourceEntityType={sourceEntityType}
            sourceEntityId={sourceEntityId}
            sourceEntityName={sourceEntityName}
        />
    );
}
