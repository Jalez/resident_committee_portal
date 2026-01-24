/**
 * New Transaction Context
 *
 * This context manages the state for creating new treasury transactions,
 * particularly the selected inventory items and their quantities.
 * Data is persisted to sessionStorage to survive page refreshes.
 */

import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useState,
} from "react";

const STORAGE_KEY = "hippos_new_transaction_items";

interface TransactionItem {
	itemId: string;
	name: string;
	quantity: number; // Quantity to include in transaction
	unitValue: number; // Per-item value
}

interface NewTransactionContextType {
	items: TransactionItem[];
	isHydrated: boolean;
	setItems: (items: TransactionItem[]) => void;
	addItem: (item: TransactionItem) => void;
	updateItemQuantity: (itemId: string, quantity: number) => void;
	removeItem: (itemId: string) => void;
	clearItems: () => void;
	getTotalValue: () => number;
	hasItems: () => boolean;
}

const NewTransactionContext = createContext<NewTransactionContextType | null>(
	null,
);

export function NewTransactionProvider({ children }: { children: ReactNode }) {
	const [items, setItemsState] = useState<TransactionItem[]>([]);
	const [isHydrated, setIsHydrated] = useState(false);

	// Load from sessionStorage on mount
	useEffect(() => {
		try {
			const stored = sessionStorage.getItem(STORAGE_KEY);
			if (stored) {
				const parsed = JSON.parse(stored);
				if (Array.isArray(parsed)) {
					setItemsState(parsed);
				}
			}
		} catch (e) {
			console.error("Failed to load transaction items from storage:", e);
		}
		setIsHydrated(true);
	}, []);

	// Save to sessionStorage when items change (after hydration)
	useEffect(() => {
		if (isHydrated) {
			try {
				sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items));
			} catch (e) {
				console.error("Failed to save transaction items to storage:", e);
			}
		}
	}, [items, isHydrated]);

	const setItems = useCallback((newItems: TransactionItem[]) => {
		setItemsState(newItems);
	}, []);

	const addItem = useCallback((item: TransactionItem) => {
		setItemsState((prev) => {
			const existing = prev.find((i) => i.itemId === item.itemId);
			if (existing) {
				// Update quantity instead of adding duplicate
				return prev.map((i) =>
					i.itemId === item.itemId
						? { ...i, quantity: i.quantity + item.quantity }
						: i,
				);
			}
			return [...prev, item];
		});
	}, []);

	const updateItemQuantity = useCallback((itemId: string, quantity: number) => {
		setItemsState((prev) =>
			prev.map((i) => (i.itemId === itemId ? { ...i, quantity } : i)),
		);
	}, []);

	const removeItem = useCallback((itemId: string) => {
		setItemsState((prev) => prev.filter((i) => i.itemId !== itemId));
	}, []);

	const clearItems = useCallback(() => {
		setItemsState([]);
		try {
			sessionStorage.removeItem(STORAGE_KEY);
		} catch (_e) {
			// Ignore
		}
	}, []);

	const getTotalValue = useCallback(() => {
		return items.reduce((sum, item) => sum + item.quantity * item.unitValue, 0);
	}, [items]);

	const hasItems = useCallback(() => {
		return items.length > 0;
	}, [items]);

	return (
		<NewTransactionContext.Provider
			value={{
				items,
				isHydrated,
				setItems,
				addItem,
				updateItemQuantity,
				removeItem,
				clearItems,
				getTotalValue,
				hasItems,
			}}
		>
			{children}
		</NewTransactionContext.Provider>
	);
}

export function useNewTransaction() {
	const context = useContext(NewTransactionContext);
	if (!context) {
		throw new Error(
			"useNewTransaction must be used within a NewTransactionProvider",
		);
	}
	return context;
}

/**
 * Hook to initialize transaction items from inventory selection
 * Call this when navigating from inventory to treasury/new
 */
export function useInitializeTransactionItems() {
	const { setItems } = useNewTransaction();

	return useCallback(
		(
			selections: {
				itemId: string;
				name: string;
				quantity: number;
				unitValue: number;
			}[],
		) => {
			setItems(
				selections.map((sel) => ({
					itemId: sel.itemId,
					name: sel.name,
					quantity: sel.quantity,
					unitValue: sel.unitValue,
				})),
			);
		},
		[setItems],
	);
}
