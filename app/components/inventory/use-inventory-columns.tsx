import { Form } from "react-router";
import { type ColumnDef } from "@tanstack/react-table";
import type { InventoryItem } from "~/db";
import { Input } from "~/components/ui/input";
import { Checkbox } from "~/components/ui/checkbox";
import { EditableCell } from "~/components/ui/editable-cell";
import type { ColumnKey } from "./inventory-constants";

interface UseInventoryColumnsProps {
    visibleColumns: Set<ColumnKey>;
    isStaff: boolean;
    onInlineEdit: (itemId: string, field: string, value: string) => void;
    // New props for combobox options
    uniqueLocations: string[];
    uniqueCategories: string[];
    itemNames: string[];
}

export function useInventoryColumns({
    visibleColumns,
    isStaff,
    onInlineEdit,
    uniqueLocations,
    uniqueCategories,
    itemNames,
}: UseInventoryColumnsProps): ColumnDef<InventoryItem>[] {
    // Build columns - order: name, location, category, description, updatedAt, unitValue, quantity, totalValue, showInInfoReel
    const columns: ColumnDef<InventoryItem>[] = [];

    if (visibleColumns.has("name")) {
        columns.push({
            accessorKey: "name",
            header: "Nimi / Name",
            cell: ({ row }) => (
                <EditableCell
                    value={row.getValue("name")}
                    onSave={(v) => onInlineEdit(row.original.id, "name", v)}
                    disabled={!isStaff}
                    items={itemNames}
                />
            ),
        });
    }

    if (visibleColumns.has("location")) {
        columns.push({
            accessorKey: "location",
            header: "Sijainti / Location",
            cell: ({ row }) => (
                <EditableCell
                    value={row.getValue("location") || ""}
                    onSave={(v) => onInlineEdit(row.original.id, "location", v)}
                    disabled={!isStaff}
                    items={uniqueLocations}
                />
            ),
        });
    }

    if (visibleColumns.has("category")) {
        columns.push({
            accessorKey: "category",
            header: "Kategoria / Category",
            cell: ({ row }) => (
                <EditableCell
                    value={row.getValue("category") || ""}
                    onSave={(v) => onInlineEdit(row.original.id, "category", v)}
                    disabled={!isStaff}
                    items={uniqueCategories}
                />
            ),
        });
    }

    if (visibleColumns.has("description")) {
        columns.push({
            accessorKey: "description",
            header: "Kuvaus / Description",
            cell: ({ row }) => (
                <EditableCell
                    value={row.getValue("description") || ""}
                    onSave={(v) => onInlineEdit(row.original.id, "description", v)}
                    disabled={!isStaff}
                />
            ),
        });
    }

    if (visibleColumns.has("updatedAt")) {
        columns.push({
            accessorKey: "updatedAt",
            header: "Päivitetty / Updated",
            cell: ({ row }) => {
                const date = new Date(row.getValue("updatedAt"));
                return <span className="text-gray-500 text-xs text-nowrap">
                    {date.toLocaleDateString("fi-FI")}
                </span>;
            },
        });
    }

    // Staff-only columns
    if (isStaff && visibleColumns.has("unitValue")) {
        columns.push({
            accessorKey: "value",
            header: "Kpl-arvo / Unit",
            cell: ({ row }) => (
                <EditableCell
                    value={row.getValue("value") as string || "0"}
                    onSave={(v) => onInlineEdit(row.original.id, "value", v)}
                    disabled={!isStaff}
                    type="number"
                    min="0"
                    step="0.01"
                />
            ),
        });
    }

    if (visibleColumns.has("quantity")) {
        columns.push({
            accessorKey: "quantity",
            header: "Määrä / Qty",
            cell: ({ row }) => (
                isStaff ? (
                    <Input
                        type="number"
                        min="1"
                        className="w-20 h-8 text-center"
                        defaultValue={row.getValue("quantity")}
                        onBlur={(e) => {
                            const newVal = parseInt(e.target.value) || 1;
                            if (newVal !== row.original.quantity) {
                                onInlineEdit(row.original.id, "quantity", newVal.toString());
                            }
                        }}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.currentTarget.blur();
                            }
                        }}
                        onClick={(e) => e.stopPropagation()}
                    />
                ) : (
                    <span className="text-gray-600 dark:text-gray-400">{row.getValue("quantity")} kpl</span>
                )
            ),
        });
    }

    if (isStaff && visibleColumns.has("totalValue")) {
        columns.push({
            id: "totalValue",
            header: "Yht. arvo / Total",
            cell: ({ row }) => {
                const value = row.original.value as string | null;
                const qty = row.original.quantity;
                if (!value || value === "0") return <span className="text-gray-400">-</span>;
                const total = parseFloat(value) * qty;
                return <span className="font-bold text-primary">{total.toFixed(2).replace(".", ",")} €</span>;
            },
        });
    }

    if (isStaff && visibleColumns.has("showInInfoReel")) {
        columns.push({
            accessorKey: "showInInfoReel",
            header: "Info Reel",
            cell: ({ row }) => (
                <Form method="post" className="flex justify-center" onClick={(e) => e.stopPropagation()}>
                    <input type="hidden" name="_action" value="toggleInfoReel" />
                    <input type="hidden" name="itemId" value={row.original.id} />
                    <button type="submit" className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                        <Checkbox checked={row.original.showInInfoReel} className="pointer-events-none" />
                    </button>
                </Form>
            ),
        });
    }

    return columns;
}
