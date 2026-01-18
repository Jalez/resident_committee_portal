import { useState } from "react";
import { useFetcher } from "react-router";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "~/components/ui/select";
import type { InventoryItem, Transaction, RemovalReason } from "~/db";
import { useLanguage } from "~/contexts/language-context";

interface TransactionLink {
    transaction: Transaction;
    quantity: number;
}

interface RemoveInventoryModalProps {
    item: InventoryItem;
    transactionLinks: TransactionLink[];
    isOpen: boolean;
    onClose: () => void;
}

const REMOVAL_REASONS: { value: RemovalReason; labelFi: string; labelEn: string }[] = [
    { value: "broken", labelFi: "Rikki", labelEn: "Broken" },
    { value: "used_up", labelFi: "Käytetty loppuun", labelEn: "Used up" },
    { value: "lost", labelFi: "Kadonnut", labelEn: "Lost" },
    { value: "sold", labelFi: "Myyty", labelEn: "Sold" },
    { value: "other", labelFi: "Muu", labelEn: "Other" },
];

export function RemoveInventoryModal({
    item,
    transactionLinks,
    isOpen,
    onClose,
}: RemoveInventoryModalProps) {
    const fetcher = useFetcher();
    const { language } = useLanguage();
    const [selectedRemovals, setSelectedRemovals] = useState<Map<string, number>>(new Map());
    const [reason, setReason] = useState<RemovalReason>("broken");
    const [notes, setNotes] = useState("");

    const t = (fi: string, en: string) => (language === "fi" ? fi : en);

    const totalToRemove = Array.from(selectedRemovals.values()).reduce((sum, qty) => sum + qty, 0);
    const hasTransactionLinks = transactionLinks.length > 0;

    const handleQuantityChange = (transactionId: string, maxQty: number, newQty: number) => {
        const validQty = Math.max(0, Math.min(maxQty, newQty));
        const updated = new Map(selectedRemovals);
        if (validQty === 0) {
            updated.delete(transactionId);
        } else {
            updated.set(transactionId, validQty);
        }
        setSelectedRemovals(updated);
    };

    const handleSubmit = () => {
        // Prepare removal data
        const removals = Array.from(selectedRemovals.entries()).map(([transactionId, quantity]) => ({
            transactionId,
            quantity,
        }));

        fetcher.submit(
            {
                _action: "removeItem",
                itemId: item.id,
                reason,
                notes,
                removals: JSON.stringify(removals),
                totalToRemove: String(totalToRemove),
            },
            { method: "POST" }
        );

        onClose();
    };

    const formatDate = (date: Date | string) => {
        const d = new Date(date);
        return d.toLocaleDateString(language === "fi" ? "fi-FI" : "en-US", { year: "numeric", month: "2-digit", day: "2-digit" });
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="w-full h-full max-w-none md:max-w-lg p-0 md:p-6 rounded-none md:rounded-lg overflow-y-auto flex flex-col md:block">
                <div className="p-4 md:p-0 flex-1 overflow-y-auto">
                    <DialogHeader className="mb-4 text-left">
                        <DialogTitle>{t("Poista tavaraa", "Remove Inventory Item")}</DialogTitle>
                        <DialogDescription>
                            <span className="font-medium">{item.name}</span> — {t("Nykyinen määrä", "Current quantity")}:{" "}
                            <span className="font-medium">{item.quantity}</span>
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 pb-4">
                        {hasTransactionLinks ? (
                            <>
                                <div>
                                    <Label className="text-sm font-medium">
                                        {t("Yhdistetyt tapahtumat", "Linked Transactions")}
                                    </Label>
                                    <p className="text-xs text-muted-foreground mb-2">
                                        {t(
                                            "Valitse mistä tapahtumasta poistat ja kuinka monta.",
                                            "Select from which transaction(s) to remove and how many."
                                        )}
                                    </p>
                                </div>

                                <div className="space-y-2 max-h-64 overflow-y-auto border rounded-xl bg-gray-50 dark:bg-gray-900/50 p-2">
                                    {transactionLinks.map(({ transaction, quantity }) => {
                                        const selectedQty = selectedRemovals.get(transaction.id) || 0;
                                        return (
                                            <div
                                                key={transaction.id}
                                                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 border rounded-lg bg-white dark:bg-gray-800 shadow-sm"
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-medium text-sm truncate">
                                                        {transaction.description}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {formatDate(transaction.date)} ·{" "}
                                                        {transaction.type === "expense"
                                                            ? t("Meno", "Expense")
                                                            : t("Tulo", "Income")}{" "}
                                                        · {t("Linkitetty", "Linked")}: {quantity} kpl
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-2 self-end sm:self-auto">
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="icon"
                                                        className="h-8 w-8"
                                                        onClick={() =>
                                                            handleQuantityChange(transaction.id, quantity, selectedQty - 1)
                                                        }
                                                        disabled={selectedQty === 0}
                                                    >
                                                        -
                                                    </Button>
                                                    <Input
                                                        type="number"
                                                        min={0}
                                                        max={quantity}
                                                        value={selectedQty}
                                                        onChange={(e) =>
                                                            handleQuantityChange(
                                                                transaction.id,
                                                                quantity,
                                                                parseInt(e.target.value) || 0
                                                            )
                                                        }
                                                        className="w-16 h-8 text-center"
                                                    />
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="icon"
                                                        className="h-8 w-8"
                                                        onClick={() =>
                                                            handleQuantityChange(transaction.id, quantity, selectedQty + 1)
                                                        }
                                                        disabled={selectedQty >= quantity}
                                                    >
                                                        +
                                                    </Button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </>
                        ) : (
                            <div className="p-4 border rounded-lg bg-muted/40 text-center">
                                <p className="text-sm text-muted-foreground">
                                    {t("Tähän tavaraan ei ole yhdistetty tapahtumia.", "No transactions linked to this item.")}
                                </p>
                                <p className="text-sm mt-2">
                                    {t(
                                        "Voit poistaa sen suoraan tai merkitä sen 'legacy'-tavaraksi.",
                                        "You can remove it directly or mark it as a legacy item."
                                    )}
                                </p>
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label htmlFor="reason">{t("Syy", "Reason")}</Label>
                            <Select value={reason} onValueChange={(v) => setReason(v as RemovalReason)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {REMOVAL_REASONS.map((r) => (
                                        <SelectItem key={r.value} value={r.value}>
                                            {t(r.labelFi, r.labelEn)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="notes">
                                {t("Lisätiedot (valinnainen)", "Notes (optional)")}
                            </Label>
                            <Textarea
                                id="notes"
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder={t("Lisää tarvittaessa lisätietoja...", "Add notes if necessary...")}
                                rows={2}
                            />
                        </div>

                        {totalToRemove > 0 && (
                            <div className="p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
                                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                                    {t("Poistat", "Removing")} {totalToRemove} {t("kpl", "item(s)")}
                                </p>
                                {totalToRemove >= item.quantity && (
                                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                                        {t(
                                            "Tavara merkitään poistetuksi",
                                            "Item will be marked as removed"
                                        )}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-4 md:p-0 border-t md:border-t-0 mt-auto">
                    <DialogFooter className="gap-2 sm:justify-end">
                        <Button type="button" variant="outline" onClick={onClose} className="flex-1 sm:flex-none">
                            {t("Peruuta", "Cancel")}
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            onClick={handleSubmit}
                            disabled={hasTransactionLinks && totalToRemove === 0}
                            className="flex-1 sm:flex-none"
                        >
                            {hasTransactionLinks
                                ? `${t("Poista", "Remove")} ${totalToRemove || "0"} kpl`
                                : t("Poista tavara", "Remove Item")}
                        </Button>
                    </DialogFooter>
                </div>
            </DialogContent>
        </Dialog>
    );
}
