/**
 * Navigation Stack Context
 *
 * Maintains a sessionStorage-based stack of return paths for navigating
 * between linked entity create/edit flows. When a user navigates from
 * transaction edit -> create reimbursement -> create receipt, the stack
 * tracks where to return at each level.
 */

import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useState,
} from "react";

const STORAGE_KEY = "hippos_nav_stack";

interface NavigationStackContextType {
	stack: string[];
	isHydrated: boolean;
	push: (path: string) => void;
	pop: () => string | null;
	peek: () => string | null;
	clear: () => void;
}

const NavigationStackContext =
	createContext<NavigationStackContextType | null>(null);

export function NavigationStackProvider({
	children,
}: { children: ReactNode }) {
	const [stack, setStack] = useState<string[]>([]);
	const [isHydrated, setIsHydrated] = useState(false);

	// Load from sessionStorage on mount
	useEffect(() => {
		try {
			const stored = sessionStorage.getItem(STORAGE_KEY);
			if (stored) {
				const parsed = JSON.parse(stored);
				if (Array.isArray(parsed)) {
					setStack(parsed);
				}
			}
		} catch (e) {
			console.error("Failed to load nav stack from storage:", e);
		}
		setIsHydrated(true);
	}, []);

	// Save to sessionStorage when stack changes (after hydration)
	useEffect(() => {
		if (isHydrated) {
			try {
				sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stack));
			} catch (e) {
				console.error("Failed to save nav stack to storage:", e);
			}
		}
	}, [stack, isHydrated]);

	const push = useCallback((path: string) => {
		setStack((prev) => [...prev, path]);
	}, []);

	const pop = useCallback((): string | null => {
		let popped: string | null = null;
		setStack((prev) => {
			if (prev.length === 0) return prev;
			popped = prev[prev.length - 1];
			return prev.slice(0, -1);
		});
		return popped;
	}, []);

	const peek = useCallback((): string | null => {
		return stack.length > 0 ? stack[stack.length - 1] : null;
	}, [stack]);

	const clear = useCallback(() => {
		setStack([]);
		try {
			sessionStorage.removeItem(STORAGE_KEY);
		} catch (_e) {
			// Ignore
		}
	}, []);

	return (
		<NavigationStackContext.Provider
			value={{ stack, isHydrated, push, pop, peek, clear }}
		>
			{children}
		</NavigationStackContext.Provider>
	);
}

export function useNavigationStack() {
	const context = useContext(NavigationStackContext);
	if (!context) {
		throw new Error(
			"useNavigationStack must be used within a NavigationStackProvider",
		);
	}
	return context;
}
