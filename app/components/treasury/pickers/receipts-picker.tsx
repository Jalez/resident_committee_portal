import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { TreasuryRelationActions } from "~/components/treasury/treasury-relation-actions";
import { receiptsToLinkableItems } from "~/components/treasury/link-existing-selector";
import type { EntityType } from "~/lib/linking/source-context";

export type ReceiptLink = {
    id: string;
    name: string;
    url: string;
};

type ReceiptsPickerProps = {
    /** Receipts grouped by year */
    receiptsByYear: { year: string; files: { id: string; name: string; url: string; createdTime: string }[] }[];
    /** Currently selected receipts */
    selectedReceipts: ReceiptLink[];
    /** Callback when selection changes */
    onSelectionChange: (receipts: ReceiptLink[]) => void;
    /** Callback for uploading a new receipt */
    onUpload?: (file: File) => Promise<ReceiptLink | null>;
    /** Current path for navigation context */
    currentPath?: string;
    /** Storage key for persistence */
    storageKey?: string;
    /** OCR subtitles keyed by receipt ID (pathname) */
    receiptSubtitles?: Record<string, string>;
    /** Source entity context (e.g., from reimbursement page) */
    sourceEntityType?: EntityType;
    sourceEntityId?: string;
    sourceEntityName?: string;
};

export function ReceiptsPicker({
    receiptsByYear,
    selectedReceipts,
    onSelectionChange,
    onUpload,
    currentPath,
    storageKey,
    receiptSubtitles,
    sourceEntityType,
    sourceEntityId,
    sourceEntityName,
}: ReceiptsPickerProps) {
    const { t } = useTranslation();
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Helper to handle file selection
    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && onUpload) {
            const newReceipt = await onUpload(file);
            if (newReceipt) {
                onSelectionChange([...selectedReceipts, newReceipt]);
            }
            // Reset input
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    return (
        <>
            <TreasuryRelationActions
                label={t("treasury.receipts.title")}
                mode="edit"
                // Map selectedReceipts to LinkableItem format for display
                items={selectedReceipts.map(r => ({
                    id: r.id,
                    to: r.url,
                    title: r.name,
                    description: r.name,
                    status: "linked",
                    variantMap: { linked: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80" },
                    subtitle: receiptSubtitles?.[r.id] || null,
                }))}
                onRemove={(id) => onSelectionChange(selectedReceipts.filter(r => r.id !== id))}

                // Upload handling
                onAdd={onUpload ? () => fileInputRef.current?.click() : undefined}
                addLabel={t("treasury.receipts.upload_new")}

                currentPath={currentPath}

                // Link existing handling
                linkableItems={receiptsToLinkableItems(receiptsByYear).filter(
                    // Filter out already selected ones
                    item => !selectedReceipts.find(sel => sel.id === item.id)
                )}
                onSelectionChange={(id) => {
                    // Find the full receipt object from the ID
                    const flatReceipts = receiptsByYear.flatMap(y => y.files);
                    const match = flatReceipts.find(r => r.id === id);
                    if (match) {
                        onSelectionChange([...selectedReceipts, {
                            id: match.id,
                            name: match.name,
                            url: match.url,
                        }]);
                    }
                }}
                linkExistingLabel={t("treasury.receipts.link_existing")}
                linkExistingPlaceholder={t("treasury.receipts.select_placeholder")}
                noLinkText={t("treasury.receipts.no_link")}
                storageKey={storageKey}

                sourceEntityType={sourceEntityType}
                sourceEntityId={sourceEntityId}
                sourceEntityName={sourceEntityName}
            />

            {/* Hidden file input for uploads */}
            {onUpload && (
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={handleFileChange}
                />
            )}
        </>
    );
}
