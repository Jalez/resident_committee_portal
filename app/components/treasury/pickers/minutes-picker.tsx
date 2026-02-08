import { useTranslation } from "react-i18next";
import { TreasuryRelationActions } from "~/components/treasury/treasury-relation-actions";
import { minutesToLinkableItems } from "~/components/treasury/link-existing-selector";
import type { EntityType } from "~/lib/linking/source-context";

type MinutesPickerProps = {
    /** Recent minutes available for selection */
    recentMinutes: { id: string; name: string; year: string; url?: string }[];
    /** ID of the currently selected minute */
    selectedMinutesId: string;
    /** Name of the currently selected minute (fallback/legacy) */
    selectedMinutesName?: string | null;
    /** Callback when selection changes */
    onSelectionChange: (id: string) => void;
    /** Current path for navigation */
    currentPath?: string;
    /** Storage key for persistence */
    storageKey?: string;
    /** Source entity context (e.g., from reimbursement page) */
    sourceEntityType?: EntityType;
    sourceEntityId?: string;
    sourceEntityName?: string;
};

export function MinutesPicker({
    recentMinutes,
    selectedMinutesId,
    selectedMinutesName,
    onSelectionChange,
    currentPath,
    storageKey,
    sourceEntityType,
    sourceEntityId,
    sourceEntityName,
}: MinutesPickerProps) {
    const { t } = useTranslation();

    return (
        <TreasuryRelationActions
            label={`${t("minutes.title")} *`}
            mode="edit"
            items={selectedMinutesId ? (() => {
                // Try to find minute in recent list
                // minutesId might be "id" or "id|name"
                const realId = selectedMinutesId.split("|")[0];
                const minute = recentMinutes.find(m => m.id === realId);
                // If not found (e.g. old minute not in recent 50), use stored name or fallback
                const title = minute?.name || (selectedMinutesName || "") || realId;

                return [{
                    id: realId,
                    to: minute?.url || "#",
                    status: "linked",
                    title: title,
                    description: minute ? `${minute.year}` : undefined,
                    variantMap: { linked: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80" },
                }];
            })() : []}
            onRemove={() => onSelectionChange("")}
            addUrl={undefined}
            currentPath={currentPath}
            linkableItems={minutesToLinkableItems(recentMinutes)}
            onSelectionChange={(id) => {
                const m = recentMinutes.find(min => min.id === id);
                // Maintain legacy format "id|name" if needed
                onSelectionChange(m ? `${m.id}|${m.name}` : id);
            }}
            linkExistingLabel={t("minutes.link_existing")}
            linkExistingPlaceholder={t("minutes.select_placeholder")}
            noLinkText={t("minutes.no_link")}
            storageKey={storageKey}
            maxItems={1}

            sourceEntityType={sourceEntityType}
            sourceEntityId={sourceEntityId}
            sourceEntityName={sourceEntityName}
        />
    );
}
