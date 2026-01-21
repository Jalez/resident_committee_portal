import { Form, Link } from "react-router";
import { type ColumnDef } from "@tanstack/react-table";
import type { InventoryItem } from "~/db";
import { Input } from "~/components/ui/input";
import { Checkbox } from "~/components/ui/checkbox";
import { EditableCell } from "~/components/ui/editable-cell";
import type { ColumnKey } from "./inventory-constants";
import { useLanguage } from "~/contexts/language-context";

interface TransactionLink {
    transaction: { id: string; description: string; date: Date; type: string };
    quantity: number;
}

interface UseInventoryColumnsProps {
    visibleColumns: Set<ColumnKey>;
    isStaff: boolean;
    onInlineEdit: (itemId: string, field: string, value: string) => void;
    // Callbacks for unlink operations
    onUnlinkFromTransaction?: (itemId: string, transactionId: string, quantity: number) => void;
    onReduceManualCount?: (itemId: string, quantity: number) => void;
    // Props for combobox options
    uniqueLocations: string[];
    uniqueCategories: string[];
    itemNames: string[];
    // Transaction links for the transactions column
    transactionLinksMap?: Record<string, TransactionLink[]>;
}

// Status badge component
function StatusBadge({ status }: { status: string }) {
    if (status === "removed") {
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                <span className="material-symbols-outlined text-sm">delete</span>
                Poistettu
            </span>
        );
    }
    // Active - show nothing (default state)
    return null;
}

export function useInventoryColumns({
    visibleColumns,
    isStaff,
    onInlineEdit,
    onUnlinkFromTransaction,
    onReduceManualCount,
    uniqueLocations,
    uniqueCategories,
    itemNames,
    transactionLinksMap = {},
}: UseInventoryColumnsProps): ColumnDef<InventoryItem>[] {
    const { language } = useLanguage();

    // Helper for bilingual headers
    const getHeader = (fi: string, en: string) => language === "fi" ? fi : en;

    // Build columns - order: status, name, location, category, description, updatedAt, unitValue, quantity, totalValue, showInInfoReel, actions
    const columns: ColumnDef<InventoryItem>[] = [];

    // Status column (always visible for staff)
    if (isStaff && visibleColumns.has("status")) {
        columns.push({
            accessorKey: "status",
            header: getHeader("Tila", "Status"),
            cell: ({ row }) => <StatusBadge status={row.original.status || "active"} />,
        });
    }

    if (visibleColumns.has("name")) {
        columns.push({
            accessorKey: "name",
            header: getHeader("Nimi", "Name"),
            cell: ({ row }) => (
                <div className="flex items-center gap-2">
                    <EditableCell
                        value={row.getValue("name")}
                        onSave={(v) => onInlineEdit(row.original.id, "name", v)}
                        disabled={!isStaff || row.original.status === "removed"}
                        items={itemNames}
                    />
                    {/* Show inline status badge for removed/legacy items */}
                    {row.original.status !== "active" && !visibleColumns.has("status") && (
                        <StatusBadge status={row.original.status || "active"} />
                    )}
                </div>
            ),
        });
    }

    if (visibleColumns.has("location")) {
        columns.push({
            accessorKey: "location",
            header: getHeader("Sijainti", "Location"),
            cell: ({ row }) => (
                <EditableCell
                    value={row.getValue("location") || ""}
                    onSave={(v) => onInlineEdit(row.original.id, "location", v)}
                    disabled={!isStaff || row.original.status === "removed"}
                    items={uniqueLocations}
                />
            ),
        });
    }

    if (visibleColumns.has("category")) {
        columns.push({
            accessorKey: "category",
            header: getHeader("Kategoria", "Category"),
            cell: ({ row }) => (
                <EditableCell
                    value={row.getValue("category") || ""}
                    onSave={(v) => onInlineEdit(row.original.id, "category", v)}
                    disabled={!isStaff || row.original.status === "removed"}
                    items={uniqueCategories}
                />
            ),
        });
    }

    if (visibleColumns.has("description")) {
        columns.push({
            accessorKey: "description",
            header: getHeader("Kuvaus", "Description"),
            cell: ({ row }) => (
                <EditableCell
                    value={row.getValue("description") || ""}
                    onSave={(v) => onInlineEdit(row.original.id, "description", v)}
                    disabled={!isStaff || row.original.status === "removed"}
                />
            ),
        });
    }

    if (visibleColumns.has("updatedAt")) {
        columns.push({
            accessorKey: "updatedAt",
            header: getHeader("Päivitetty", "Updated"),
            cell: ({ row }) => {
                const date = new Date(row.getValue("updatedAt"));
                return <span className="text-gray-500 text-xs text-nowrap">
                    {date.toLocaleDateString(language === "fi" ? "fi-FI" : "en-GB")}
                </span>;
            },
        });
    }

    // Staff-only columns
    if (isStaff && visibleColumns.has("unitValue")) {
        columns.push({
            accessorKey: "value",
            header: getHeader("Kpl-arvo", "Unit"),
            cell: ({ row }) => (
                <EditableCell
                    value={row.getValue("value") as string || "0"}
                    onSave={(v) => onInlineEdit(row.original.id, "value", v)}
                    disabled={!isStaff || row.original.status === "removed"}
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
            header: getHeader("Määrä", "Qty"),
            cell: ({ row }) => (
                isStaff && row.original.status === "active" ? (
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
            header: getHeader("Yht. arvo", "Total"),
            cell: ({ row }) => {
                const value = row.original.value as string | null;
                const qty = row.original.quantity;
                if (!value || value === "0") return <span className="text-gray-400">-</span>;
                const total = parseFloat(value) * qty;
                return <span className="font-bold text-primary">{total.toFixed(2).replace(".", ",")} €</span>;
            },
        });
    }

    // Transactions column (staff only)
    if (isStaff && visibleColumns.has("transactions")) {
        columns.push({
            id: "transactions",
            header: getHeader("Tapahtumat", "Transactions"),
            cell: ({ row }) => {
                const item = row.original;
                // If item is removed, don't show transaction breakdown? Or show it but maybe dimmed?
                // Let's show it.

                const links = transactionLinksMap[item.id] || [];
                const linkedQuantity = links.reduce((sum, link) => sum + link.quantity, 0);
                // manualCount comes from schema update
                const manualQuantity = (item as any).manualCount || 0;

                const totalQuantity = item.quantity;
                const unknownQuantity = Math.max(0, totalQuantity - linkedQuantity - manualQuantity);

                if (linkedQuantity === 0 && manualQuantity === 0 && unknownQuantity === 0) {
                    return <span className="text-gray-400 text-sm">-</span>;
                }

                return (
                    <div className="flex flex-wrap gap-1">
                        {/* Linked Transactions */}
                        {links.map(link => (
                            <span
                                key={link.transaction.id}
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-mono bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800"
                            >
                                <Link
                                    to={`/treasury/breakdown/${link.transaction.id}/edit`}
                                    className="hover:underline"
                                    onClick={(e) => e.stopPropagation()}
                                    title={link.transaction.description}
                                >
                                    {link.transaction.id.slice(0, 8)}
                                </Link>
                                <span className="font-semibold">({link.quantity})</span>
                                {onUnlinkFromTransaction && (
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onUnlinkFromTransaction(item.id, link.transaction.id, link.quantity);
                                        }}
                                        className="ml-0.5 p-0.5 rounded hover:bg-blue-200 dark:hover:bg-blue-800 text-blue-600 dark:text-blue-300"
                                        title="Poista linkki / Unlink"
                                    >
                                        <span className="material-symbols-outlined text-xs" style={{ fontSize: '12px' }}>delete</span>
                                    </button>
                                )}
                            </span>
                        ))}

                        {/* Manual / No Transaction */}
                        {manualQuantity > 0 && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-mono bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400 border border-gray-200 dark:border-gray-700" title="Manually marked as no transaction/legacy">
                                no-transaction
                                <span className="font-semibold">({manualQuantity})</span>
                                {onReduceManualCount && (
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onReduceManualCount(item.id, manualQuantity);
                                        }}
                                        className="ml-0.5 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
                                        title="Poista merkintä / Remove marker"
                                    >
                                        <span className="material-symbols-outlined text-xs" style={{ fontSize: '12px' }}>delete</span>
                                    </button>
                                )}
                            </span>
                        )}

                        {/* Unknown / Unaccounted */}
                        {unknownQuantity > 0 && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800" title="Unaccounted quantity">
                                unknown
                                <span className="ml-1 font-semibold">({unknownQuantity})</span>
                            </span>
                        )}
                    </div>
                );
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
                    <Checkbox
                        checked={row.original.showInInfoReel}
                        disabled={row.original.status !== "active"}
                        onCheckedChange={() => {
                            // Find the closest form and submit it
                            const form = document.querySelector(`form input[value="${row.original.id}"]`)?.closest('form');
                            if (form) (form as HTMLFormElement).requestSubmit();
                        }}
                    />
                </Form>
            ),
        });
    }

    return columns;
}
