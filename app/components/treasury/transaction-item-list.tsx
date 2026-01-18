
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "~/components/ui/dialog";
import { InventoryPicker } from "~/components/inventory-picker";
import type { InventoryItem } from "~/db";

export interface TransactionItem {
    itemId: string;
    name: string;
    quantity: number;
    unitValue: number;
}

interface TransactionItemListProps {
    items: TransactionItem[];
    onItemsChange: (items: TransactionItem[]) => void;
    availableItems: InventoryItem[];
    uniqueLocations: string[];
    uniqueCategories: string[];
    title?: string;
    description?: string;
    emptyMessage?: string;
    onAddNewItem?: (item: {
        name: string;
        quantity: number;
        location: string;
        category?: string;
        description?: string;
        value?: string;
    }) => Promise<InventoryItem | null>;
    showTotal?: boolean;
}

export function TransactionItemList({
    items,
    onItemsChange,
    availableItems,
    uniqueLocations,
    uniqueCategories,
    title = "Tavarat / Items",
    description,
    emptyMessage = "Ei valittuja tavaroita / No items selected",
    onAddNewItem,
    showTotal = true
}: TransactionItemListProps) {
    const [pickerOpen, setPickerOpen] = useState(false);

    // Calculate total
    const totalValue = items.reduce((sum, item) => sum + (item.quantity * item.unitValue), 0);

    // Handlers
    const updateQuantity = (itemId: string, qty: number) => {
        onItemsChange(items.map(i => i.itemId === itemId ? { ...i, quantity: qty } : i));
    };

    const removeItem = (itemId: string) => {
        onItemsChange(items.filter(i => i.itemId !== itemId));
    };

    const handlePickerSelectionChange = (newIds: string[]) => {
        // We need to carefully merge:
        // 1. Keep existing items (to preserve quantities)
        // 2. Add new items (default qty 1)
        // 3. Remove items not in newIds

        const nextItems: TransactionItem[] = [];

        // Setup map for O(1) lookup
        const currentMap = new Map(items.map(i => [i.itemId, i]));

        for (const id of newIds) {
            if (currentMap.has(id)) {
                nextItems.push(currentMap.get(id)!); // Keep existing with quantity
            } else {
                // Find from available
                const inventoryItem = availableItems.find(i => i.id === id);
                if (inventoryItem) {
                    nextItems.push({
                        itemId: id,
                        name: inventoryItem.name,
                        quantity: 1,
                        unitValue: parseFloat(inventoryItem.value || "0")
                    });
                }
            }
        }

        onItemsChange(nextItems);
    };

    const selectedIds = items.map(i => i.itemId);

    return (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 space-y-4">
            <div className="flex justify-between items-start">
                <div>
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <span className="material-symbols-outlined">inventory_2</span>
                        {title}
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                        {items.length === 0
                            ? emptyMessage
                            : `${items.length} tavaraa valittu / items selected`
                        }
                    </p>
                </div>
                {showTotal && totalValue > 0 && (
                    <div className="text-right">
                        <span className="block text-sm font-medium text-gray-500">Yhteensä / Total</span>
                        <span className="text-lg font-bold text-primary">
                            {totalValue.toFixed(2).replace(".", ",")} €
                        </span>
                    </div>
                )}
            </div>

            {/* List */}
            {items.length > 0 && (
                <div className="space-y-2 border-t border-gray-100 dark:border-gray-700 pt-3">
                    {items.map(item => (
                        <div key={item.itemId} className="flex justify-between items-center text-sm bg-gray-50 dark:bg-gray-900/50 p-2 rounded-lg gap-2">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                <span className="material-symbols-outlined text-gray-400 text-lg shrink-0">package_2</span>
                                <span className="truncate">{item.name}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <Input
                                    type="number"
                                    min="1"
                                    value={item.quantity}
                                    onChange={(e) => updateQuantity(item.itemId, parseInt(e.target.value) || 1)}
                                    className="w-16 h-7 text-center text-sm"
                                />
                                {item.unitValue > 0 && (
                                    <span className="text-gray-500 font-mono text-xs w-20 text-right">
                                        {(item.quantity * item.unitValue).toFixed(2).replace(".", ",")} €
                                    </span>
                                )}
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => removeItem(item.itemId)}
                                    className="h-7 w-7 p-0 text-gray-400 hover:text-red-500"
                                >
                                    <span className="material-symbols-outlined text-base">close</span>
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Picker Dialog */}
            <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
                <DialogTrigger asChild>
                    <Button
                        type="button"
                        variant="outline"
                        className="w-full border-dashed border-2 py-8 hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                        <span className="material-symbols-outlined mr-2">add_circle</span>
                        {items.length > 0 ? "Muokkaa valintaa / Edit Selection" : "Valitse tavarat / Select Items"}
                    </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-6">
                    <DialogHeader>
                        <DialogTitle>Valitse tavarat / Select Items</DialogTitle>
                        <DialogDescription>
                            {description || "Valitse listalta tai lisää uusi tavara. / Select from list or add new."}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex-1 overflow-auto min-h-0 -mx-2 px-2">
                        <InventoryPicker
                            items={availableItems}
                            uniqueLocations={uniqueLocations}
                            uniqueCategories={uniqueCategories}
                            selectedIds={selectedIds}
                            onSelectionChange={handlePickerSelectionChange}
                            onAddItem={onAddNewItem}
                            compact={false}
                            showUnlinkedBadge={true}
                        />
                    </div>
                    <div className="flex justify-end pt-4 border-t border-gray-100 dark:border-gray-700">
                        <Button onClick={() => setPickerOpen(false)}>
                            Valmis / Done
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
