import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useFetcher, useSearchParams, useNavigate } from "react-router";
import type { InventoryItem } from "~/db";
import { COLUMN_KEYS, DEFAULT_NEW_ITEM, type ColumnKey, type NewInventoryItemState } from "./inventory-constants";

// ============================================================================
// Types
// ============================================================================

interface InventoryContextValue {
    // Data from loader (passed in via provider)
    items: InventoryItem[];
    filters: { name: string; location: string; category: string };
    uniqueLocations: string[];
    uniqueCategories: string[];
    totalCount: number;
    currentPage: number;
    pageSize: number;
    isStaff: boolean;
    isAdmin: boolean;
    transactionLinksMap: Record<string, { transaction: { id: string; description: string; date: Date; type: string }; quantity: number }[]>;
    inventoryTransactions: { id: string; description: string; date: Date; amount: string; category: string | null }[];

    // UI State
    showAddRow: boolean;
    setShowAddRow: (show: boolean) => void;
    newItem: NewInventoryItemState;
    setNewItem: (item: NewInventoryItemState) => void;
    selectedIds: string[];
    setSelectedIds: (ids: string[]) => void;
    visibleColumns: Set<ColumnKey>;

    // Actions
    handleInlineEdit: (itemId: string, field: string, value: string) => void;
    handleCreateItem: () => void;
    handleDeleteSelected: (ids: string[]) => void;
    handleFilterChange: (key: string, value: string) => void;
    handlePageChange: (page: number) => void;
    toggleColumn: (col: ColumnKey) => void;
    handleAddTreasuryTransaction: () => void;
    resetAddRow: () => void;

    // Fetcher state
    isSaving: boolean;
}

const InventoryContext = createContext<InventoryContextValue | null>(null);

// ============================================================================
// Hook
// ============================================================================

export function useInventory() {
    const context = useContext(InventoryContext);
    if (!context) {
        throw new Error("useInventory must be used within an InventoryProvider");
    }
    return context;
}

// ============================================================================
// Provider
// ============================================================================

interface InventoryProviderProps {
    children: React.ReactNode;
    // Loader data - passed from route
    items: InventoryItem[];
    filters: { name: string; location: string; category: string };
    uniqueLocations: string[];
    uniqueCategories: string[];
    totalCount: number;
    currentPage: number;
    pageSize: number;
    isStaff: boolean;
    isAdmin: boolean;
    // Transaction links for modals
    transactionLinksMap?: Record<string, { transaction: { id: string; description: string; date: Date; type: string }; quantity: number }[]>;
    // Inventory category transactions for "Add to Existing" feature
    inventoryTransactions?: { id: string; description: string; date: Date; amount: string; category: string | null }[];
}

export function InventoryProvider({
    children,
    items,
    filters,
    uniqueLocations,
    uniqueCategories,
    totalCount,
    currentPage,
    pageSize,
    isStaff,
    isAdmin,
    transactionLinksMap = {},
    inventoryTransactions = [],
}: InventoryProviderProps) {
    const fetcher = useFetcher();
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();

    // UI State
    const [showAddRow, setShowAddRow] = useState(false);
    const [newItem, setNewItem] = useState<NewInventoryItemState>(DEFAULT_NEW_ITEM);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);

    const isSaving = fetcher.state !== "idle";

    // Reset add row form when save completes
    useEffect(() => {
        if (fetcher.state === "idle" && fetcher.data?.success) {
            setNewItem(DEFAULT_NEW_ITEM);
            setShowAddRow(false);
        }
    }, [fetcher.state, fetcher.data]);

    // Parse visible columns from URL
    const getVisibleColumns = useCallback((): Set<ColumnKey> => {
        const colsParam = searchParams.get("cols");
        if (colsParam) {
            return new Set(colsParam.split(",").filter(c => COLUMN_KEYS.includes(c as ColumnKey)) as ColumnKey[]);
        }
        if (isStaff) {
            return new Set(["name", "quantity", "location", "category", "description", "updatedAt", "unitValue", "totalValue", "showInInfoReel"] as ColumnKey[]);
        }
        return new Set(["name", "quantity", "location", "category", "description", "updatedAt"] as ColumnKey[]);
    }, [searchParams, isStaff]);

    const visibleColumns = getVisibleColumns();

    // ========================================================================
    // Actions
    // ========================================================================

    const handleInlineEdit = useCallback((itemId: string, field: string, value: string) => {
        const formData = new FormData();
        formData.set("_action", "updateField");
        formData.set("itemId", itemId);
        formData.set("field", field);
        formData.set("value", value);
        fetcher.submit(formData, { method: "POST" });
    }, [fetcher]);

    const handleCreateItem = useCallback(() => {
        if (!newItem.name.trim() || !newItem.location.trim()) return;
        const formData = new FormData();
        formData.set("_action", "createItem");
        formData.set("name", newItem.name);
        formData.set("quantity", newItem.quantity);
        formData.set("location", newItem.location);
        formData.set("category", newItem.category);
        formData.set("description", newItem.description);
        formData.set("value", newItem.value);
        fetcher.submit(formData, { method: "POST" });
    }, [fetcher, newItem]);

    const handleDeleteSelected = useCallback((ids: string[]) => {
        if (!confirm(`Haluatko varmasti poistaa ${ids.length} tavaraa? / Delete ${ids.length} items?`)) return;
        const formData = new FormData();
        formData.set("_action", "deleteMany");
        formData.set("itemIds", JSON.stringify(ids));
        fetcher.submit(formData, { method: "POST" });
    }, [fetcher]);

    const handleFilterChange = useCallback((key: string, value: string) => {
        const params = new URLSearchParams(searchParams);
        if (value) {
            params.set(key, value);
        } else {
            params.delete(key);
        }
        params.delete("page");
        setSearchParams(params);
    }, [searchParams, setSearchParams]);

    const handlePageChange = useCallback((page: number) => {
        const params = new URLSearchParams(searchParams);
        params.set("page", page.toString());
        setSearchParams(params);
    }, [searchParams, setSearchParams]);

    const toggleColumn = useCallback((col: ColumnKey) => {
        const newVisible = new Set(visibleColumns);
        if (newVisible.has(col)) {
            newVisible.delete(col);
        } else {
            newVisible.add(col);
        }
        const params = new URLSearchParams(searchParams);
        params.set("cols", Array.from(newVisible).join(","));
        setSearchParams(params);
    }, [visibleColumns, searchParams, setSearchParams]);

    const handleAddTreasuryTransaction = useCallback(() => {
        if (selectedIds.length === 0) return;
        const selectedItems = items.filter(i => selectedIds.includes(i.id));
        const totalValue = selectedItems.reduce((sum, item) => sum + (parseFloat(item.value || "0") * item.quantity), 0);
        const itemNames = selectedItems.map(i => i.name).join(", ");
        const itemIdsStr = selectedIds.join(",");

        const params = new URLSearchParams({
            items: itemIdsStr,
            amount: totalValue.toFixed(2),
            description: `Hankinta: ${itemNames}`,
            type: "expense",
            category: "inventory",
        });
        navigate(`/treasury/new?${params.toString()}`);
    }, [selectedIds, items, navigate]);

    const resetAddRow = useCallback(() => {
        setNewItem(DEFAULT_NEW_ITEM);
        setShowAddRow(false);
    }, []);

    // ========================================================================
    // Context Value
    // ========================================================================

    const value: InventoryContextValue = {
        // Data
        items,
        filters,
        uniqueLocations,
        uniqueCategories,
        totalCount,
        currentPage,
        pageSize,
        isStaff,
        isAdmin,
        transactionLinksMap,
        inventoryTransactions,

        // UI State
        showAddRow,
        setShowAddRow,
        newItem,
        setNewItem,
        selectedIds,
        setSelectedIds,
        visibleColumns,

        // Actions
        handleInlineEdit,
        handleCreateItem,
        handleDeleteSelected,
        handleFilterChange,
        handlePageChange,
        toggleColumn,
        handleAddTreasuryTransaction,
        resetAddRow,

        // Fetcher state
        isSaving,
    };

    return (
        <InventoryContext.Provider value={value}>
            {children}
        </InventoryContext.Provider>
    );
}
