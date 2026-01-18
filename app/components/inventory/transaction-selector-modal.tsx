import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { useState } from "react";

interface Transaction {
    id: string;
    description: string;
    date: Date;
    amount: string;
    category: string | null;
}

interface TransactionSelectorModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    transactions: Transaction[];
    onSelect: (transaction: Transaction) => void;
}

export function TransactionSelectorModal({
    open,
    onOpenChange,
    transactions,
    onSelect,
}: TransactionSelectorModalProps) {
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const handleConfirm = () => {
        const selected = transactions.find(t => t.id === selectedId);
        if (selected) {
            onSelect(selected);
            onOpenChange(false);
        }
    };

    // Filter to inventory category transactions
    const inventoryTransactions = transactions.filter(t => t.category === "inventory");

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-xl">
                <DialogHeader>
                    <DialogTitle>Valitse tapahtuma / Select Transaction</DialogTitle>
                </DialogHeader>

                <div className="py-4">
                    <p className="text-sm text-gray-500 mb-4">
                        Valitse tapahtuma, johon haluat lisätä valitut tavarat.
                        <br />
                        <span className="text-gray-400">Select a transaction to add the selected items to.</span>
                    </p>

                    {inventoryTransactions.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            <span className="material-symbols-outlined text-4xl mb-2">inbox</span>
                            <p>Ei sopivia tapahtumia</p>
                            <p className="text-sm text-gray-400">No suitable transactions found</p>
                        </div>
                    ) : (
                        <div className="space-y-2 max-h-[300px] overflow-y-auto">
                            {inventoryTransactions.map(transaction => (
                                <button
                                    key={transaction.id}
                                    type="button"
                                    onClick={() => setSelectedId(transaction.id)}
                                    className={`w-full text-left p-3 rounded-lg border transition-colors ${selectedId === transaction.id
                                            ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                                            : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                                        }`}
                                >
                                    <div className="flex justify-between items-start">
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium text-gray-900 dark:text-white truncate">
                                                {transaction.description}
                                            </p>
                                            <p className="text-sm text-gray-500">
                                                {new Date(transaction.date).toLocaleDateString("fi-FI")}
                                            </p>
                                        </div>
                                        <div className="text-right shrink-0 ml-4">
                                            <p className="font-mono font-bold text-primary">
                                                {parseFloat(transaction.amount).toFixed(2).replace(".", ",")} €
                                            </p>
                                            <p className="text-xs text-gray-400 font-mono">
                                                {transaction.id.slice(0, 8)}
                                            </p>
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Peruuta / Cancel
                    </Button>
                    <Button onClick={handleConfirm} disabled={!selectedId}>
                        Valitse / Select
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
