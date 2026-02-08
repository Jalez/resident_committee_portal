import { useTranslation } from "react-i18next";
import {
    TreasuryRelationActions,
    type TreasuryRelationItem,
} from "~/components/treasury/treasury-relation-actions";
import type { LinkableItem } from "~/components/treasury/link-existing-selector";
import type { EntityType } from "~/lib/linking/source-context";

type BudgetOption = {
    id: string;
    name: string;
    remainingAmount: number;
};

interface BudgetPickerProps {
    /** specific budget currently linked */
    linkedBudget?: BudgetOption;
    /** list of budgets available to link */
    availableBudgets: BudgetOption[];
    /** current selection ID (controlled) */
    selectedBudgetId: string;
    onSelectionChange: (id: string) => void;
    /** path for navigation state */
    currentPath?: string;
    /** key for session storage */
    storageKey?: string;
    /** Source entity context (e.g., from transaction page) */
    sourceEntityType?: EntityType;
    sourceEntityId?: string;
    sourceEntityName?: string;
}

export function BudgetPicker({
    linkedBudget,
    availableBudgets,
    selectedBudgetId,
    onSelectionChange,
    currentPath,
    storageKey,
    sourceEntityType,
    sourceEntityId,
    sourceEntityName,
}: BudgetPickerProps) {
    const { t } = useTranslation();

    // Convert linked budget to display item
    // We use `linkedBudget` prop if passed, but `selectedBudgetId` drives the selection state.
    // If `selectedBudgetId` matches `linkedBudget.id`, we show it.
    // Actually, `linkedBudget` from DB might differ from `selectedBudgetId` (form state).
    // We should find the budget details from `availableBudgets` or `linkedBudget` based on `selectedBudgetId`.

    const selectedBudget =
        (linkedBudget?.id === selectedBudgetId ? linkedBudget : undefined) ||
        availableBudgets.find((b) => b.id === selectedBudgetId);

    const items: TreasuryRelationItem[] = selectedBudget
        ? [
            {
                id: selectedBudget.id,
                to: `/treasury/budgets/${selectedBudget.id}`,
                title: selectedBudget.name,
                description: `${t("treasury.budgets.remaining")}: ${selectedBudget.remainingAmount.toFixed(2).replace(".", ",")} €`,
                status: "linked",
                variantMap: { linked: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80" },
            },
        ]
        : [];

    // Linkable items for dropdown
    const linkableItems = availableBudgets.map((budget) => ({
        id: budget.id,
        title: budget.name,
        description: `${t("treasury.budgets.remaining")}: ${budget.remainingAmount.toFixed(2).replace(".", ",")} €`,
        amount: budget.remainingAmount.toFixed(2),
        to: `/treasury/budgets/${budget.id}`,
        status: "open",
        variantMap: { open: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-green-200 dark:border-green-800" },
    }));

    return (
        <TreasuryRelationActions
            label={t("treasury.new.link_budget")}
            mode="edit"
            items={items}
            onRemove={() => onSelectionChange("")}

            // Linking
            linkableItems={linkableItems}
            onSelectionChange={onSelectionChange}
            linkExistingLabel={t("treasury.new.link_existing_budget")}

            currentPath={currentPath}
            storageKey={storageKey}
            maxItems={1}

            sourceEntityType={sourceEntityType}
            sourceEntityId={sourceEntityId}
            sourceEntityName={sourceEntityName}
        />
    );
}
