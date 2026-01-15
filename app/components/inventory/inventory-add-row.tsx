import React, { useRef, useState, useEffect } from "react";
import { TableRow, TableCell } from "~/components/ui/table";
import { Input } from "~/components/ui/input";
import { Checkbox } from "~/components/ui/checkbox";
import { Tooltip, TooltipTrigger, TooltipContent } from "~/components/ui/tooltip";
import { SmartCombobox } from "~/components/ui/smart-combobox";
import { useInventory } from "./inventory-context";

export function InventoryAddRow() {
    const {
        items,
        uniqueLocations,
        uniqueCategories,
        visibleColumns,
        newItem,
        setNewItem,
        handleCreateItem,
        resetAddRow,
    } = useInventory();

    const [errors, setErrors] = useState<{ name?: boolean; location?: boolean }>({});
    const rowRef = useRef<HTMLTableRowElement>(null);

    // Handle click outside - validate and save if valid
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as Node;

            // Check if click is inside the add row
            if (rowRef.current?.contains(target)) {
                return;
            }

            // Check if click is inside a Radix popover (portal content from SmartCombobox)
            const popoverContent = (target as Element).closest?.('[data-radix-popper-content-wrapper]');
            if (popoverContent) {
                return;
            }

            // Click is outside - handle save/close
            // Use requestAnimationFrame to ensure state is up to date
            requestAnimationFrame(() => {
                // If row is empty (no name entered), just close it
                if (!newItem.name.trim() && !newItem.location.trim()) {
                    resetAddRow();
                    setErrors({});
                    return;
                }

                // Validate required fields
                const newErrors: { name?: boolean; location?: boolean } = {};
                if (!newItem.name.trim()) newErrors.name = true;
                if (!newItem.location.trim()) newErrors.location = true;

                if (Object.keys(newErrors).length > 0) {
                    setErrors(newErrors);
                    return;
                }

                // Clear errors and save
                setErrors({});
                handleCreateItem();
            });
        };

        // Use mousedown so we capture before focus changes
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [newItem, resetAddRow, handleCreateItem]);

    // Clear error when field is edited
    const clearError = (field: "name" | "location") => {
        if (errors[field]) {
            setErrors(prev => ({ ...prev, [field]: false }));
        }
    };

    return (
        <TableRow
            ref={rowRef}
            className="bg-primary/5 hover:bg-primary/10 border-b-2 border-primary/20"
        >
            {/* Empty cell for checkbox column */}
            <TableCell className="w-10">
                <span className="material-symbols-outlined text-primary text-lg">add_circle</span>
            </TableCell>
            {/* Name */}
            {visibleColumns.has("name") && (
                <TableCell>
                    <Tooltip open={errors.name}>
                        <TooltipTrigger asChild>
                            <div className={errors.name ? "ring-2 ring-red-500 rounded-md" : ""}>
                                <SmartCombobox
                                    items={items.map(i => ({ value: i.name, label: i.name }))}
                                    value={newItem.name}
                                    onValueChange={(v) => {
                                        setNewItem({ ...newItem, name: v });
                                        clearError("name");
                                    }}
                                    placeholder="Nimi..."
                                    searchPlaceholder="Etsi..."
                                    emptyText="Uusi"
                                />
                            </div>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" sideOffset={4} className="bg-red-500 text-white font-medium">
                            Pakollinen kenttä / Required field
                        </TooltipContent>
                    </Tooltip>
                </TableCell>
            )}
            {/* Location */}
            {visibleColumns.has("location") && (
                <TableCell>
                    <Tooltip open={errors.location}>
                        <TooltipTrigger asChild>
                            <div className={errors.location ? "ring-2 ring-red-500 rounded-md" : ""}>
                                <SmartCombobox
                                    items={uniqueLocations}
                                    value={newItem.location}
                                    onValueChange={(v) => {
                                        setNewItem({ ...newItem, location: v });
                                        clearError("location");
                                    }}
                                    placeholder="Sijainti..."
                                    searchPlaceholder="Etsi..."
                                    emptyText="Uusi"
                                />
                            </div>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" sideOffset={4} className="bg-red-500 text-white font-medium">
                            Pakollinen kenttä / Required field
                        </TooltipContent>
                    </Tooltip>
                </TableCell>
            )}
            {/* Category */}
            {visibleColumns.has("category") && (
                <TableCell>
                    <SmartCombobox
                        items={uniqueCategories}
                        value={newItem.category}
                        onValueChange={(v) => setNewItem({ ...newItem, category: v })}
                        placeholder="Kategoria..."
                        searchPlaceholder="Etsi..."
                        emptyText="Uusi"
                    />
                </TableCell>
            )}
            {/* Description */}
            {visibleColumns.has("description") && (
                <TableCell>
                    <Input
                        value={newItem.description}
                        onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                        placeholder="Kuvaus..."
                        className="h-9"
                    />
                </TableCell>
            )}
            {/* Updated At - show current date for new items */}
            {visibleColumns.has("updatedAt") && (
                <TableCell>
                    <span className="text-gray-500 text-xs text-nowrap">
                        {new Date().toLocaleDateString("fi-FI")}
                    </span>
                </TableCell>
            )}
            {/* Unit Value */}
            {visibleColumns.has("unitValue") && (
                <TableCell>
                    <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={newItem.value}
                        onChange={(e) => setNewItem({ ...newItem, value: e.target.value })}
                        className="h-9 w-20"
                        placeholder="€"
                    />
                </TableCell>
            )}
            {/* Quantity */}
            {visibleColumns.has("quantity") && (
                <TableCell>
                    <Input
                        type="number"
                        min="1"
                        value={newItem.quantity}
                        onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })}
                        className="h-9 w-20"
                        placeholder="Kpl"
                    />
                </TableCell>
            )}
            {/* Total Value (calculated) */}
            {visibleColumns.has("totalValue") && (
                <TableCell>
                    {parseFloat(newItem.value || "0") > 0 ? (
                        <span className="font-bold text-primary">
                            {(parseFloat(newItem.value || "0") * parseInt(newItem.quantity || "1")).toFixed(2).replace(".", ",")} €
                        </span>
                    ) : (
                        <span className="text-gray-400">-</span>
                    )}
                </TableCell>
            )}
            {/* ShowInInfoReel */}
            {visibleColumns.has("showInInfoReel") && (
                <TableCell className="text-center">
                    <Checkbox
                        checked={newItem.showInInfoReel || false}
                        onCheckedChange={(checked) => setNewItem({ ...newItem, showInInfoReel: checked === true })}
                    />
                </TableCell>
            )}
        </TableRow>
    );
}
