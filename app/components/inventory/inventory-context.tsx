import type React from "react";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useFetcher, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import type { InventoryItem } from "~/db";
import type { RelationBadgeData } from "~/lib/relations-column.server";
import {
	COLUMN_KEYS,
	type ColumnKey,
	DEFAULT_NEW_ITEM,
	type NewInventoryItemState,
} from "./inventory-constants";

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
	relationsMap: Record<string, RelationBadgeData[]>;

	// UI State
	selectedIds: string[];
	setSelectedIds: (ids: string[]) => void;
	visibleColumns: Set<ColumnKey>;

	// Actions
	handleDeleteSelected: (ids: string[]) => void;
	handleFilterChange: (key: string, value: string) => void;
	handlePageChange: (page: number) => void;
	toggleColumn: (col: ColumnKey) => void;

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
	relationsMap?: Record<string, RelationBadgeData[]>;
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
	relationsMap = {},
}: InventoryProviderProps) {
	const fetcher = useFetcher();
	const [searchParams, setSearchParams] = useSearchParams();
	const navigate = useNavigate();

	// UI State
	const [selectedIds, setSelectedIds] = useState<string[]>([]);

	const isSaving = fetcher.state !== "idle";
	const { t } = useTranslation();
	const lastToastDataRef = useRef<unknown>(null);

	// Parse visible columns from URL
	const getVisibleColumns = useCallback((): Set<ColumnKey> => {
		const colsParam = searchParams.get("cols");
		if (colsParam) {
			return new Set(
				colsParam
					.split(",")
					.filter((c) => COLUMN_KEYS.includes(c as ColumnKey)) as ColumnKey[],
			);
		}
		if (isStaff) {
			return new Set([
				"name",
				"quantity",
				"location",
				"category",
				"description",
				"updatedAt",
				"showInInfoReel",
			] as ColumnKey[]);
		}
		return new Set([
			"name",
			"quantity",
			"location",
			"category",
			"description",
			"updatedAt",
		] as ColumnKey[]);
	}, [searchParams, isStaff]);

	const visibleColumns = getVisibleColumns();

	// ========================================================================
	// Actions
	// ========================================================================

	const handleDeleteSelected = useCallback(
		(ids: string[]) => {
			const formData = new FormData();
			formData.set("_action", "deleteMany");
			formData.set("itemIds", JSON.stringify(ids));
			fetcher.submit(formData, { method: "POST", action: "/inventory" });
			setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));
		},
		[fetcher],
	);

	const handleFilterChange = useCallback(
		(key: string, value: string) => {
			const params = new URLSearchParams(searchParams);
			if (value) {
				params.set(key, value);
			} else {
				params.delete(key);
			}
			params.delete("page");
			setSearchParams(params);
		},
		[searchParams, setSearchParams],
	);

	const handlePageChange = useCallback(
		(page: number) => {
			const params = new URLSearchParams(searchParams);
			params.set("page", page.toString());
			setSearchParams(params);
		},
		[searchParams, setSearchParams],
	);

	const toggleColumn = useCallback(
		(col: ColumnKey) => {
			const newVisible = new Set(visibleColumns);
			if (newVisible.has(col)) {
				newVisible.delete(col);
			} else {
				newVisible.add(col);
			}
			const params = new URLSearchParams(searchParams);
			params.set("cols", Array.from(newVisible).join(","));
			setSearchParams(params);
		},
		[visibleColumns, searchParams, setSearchParams],
	);

	const handleAddTreasuryTransaction = useCallback(() => {
		const selectedItems = items.filter((i) => selectedIds.includes(i.id));
		const totalValue = 0; // Value is no longer tracked on inventory items
		const itemNames = selectedItems.map((i) => i.name).join(", ");
		const itemIdsStr = selectedIds.join(",");

		const params = new URLSearchParams({
			items: itemIdsStr,
			amount: totalValue.toFixed(2),
			description: `Hankinta: ${itemNames}`,
			type: "expense",
		});
		navigate(`/treasury/transactions/new?${params.toString()}`);
	}, [selectedIds, items, navigate]);


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
		relationsMap,

		// UI State
		selectedIds,
		setSelectedIds,
		visibleColumns,

		// Actions
		handleDeleteSelected,
		handleFilterChange,
		handlePageChange,
		toggleColumn,

		// Fetcher state
		isSaving,
	};

	return (
		<InventoryContext.Provider value={value}>
			{children}
		</InventoryContext.Provider>
	);
}
