/**
 * Reimbursement Template Context
 *
 * This context manages the state for pre-filling a new reimbursement
 * based on an existing one (template/duplicate functionality).
 * Data is persisted to sessionStorage to survive navigation.
 */

import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useState,
} from "react";

const STORAGE_KEY = "hippos_reimbursement_template";

export interface ReimbursementTemplate {
	description: string;
	amount: string;
	purchaserName: string;
	bankAccount: string;
	notes?: string;
}

interface ReimbursementTemplateContextType {
	template: ReimbursementTemplate | null;
	isHydrated: boolean;
	setTemplate: (template: ReimbursementTemplate | null) => void;
	clearTemplate: () => void;
	hasTemplate: () => boolean;
}

const ReimbursementTemplateContext =
	createContext<ReimbursementTemplateContextType | null>(null);

export function ReimbursementTemplateProvider({
	children,
}: {
	children: ReactNode;
}) {
	const [template, setTemplateState] = useState<ReimbursementTemplate | null>(
		null,
	);
	const [isHydrated, setIsHydrated] = useState(false);

	// Load from sessionStorage on mount
	useEffect(() => {
		try {
			const stored = sessionStorage.getItem(STORAGE_KEY);
			if (stored) {
				const parsed = JSON.parse(stored);
				if (parsed && typeof parsed === "object") {
					setTemplateState(parsed);
				}
			}
		} catch (e) {
			console.error("Failed to load reimbursement template from storage:", e);
		}
		setIsHydrated(true);
	}, []);

	// Save to sessionStorage when template changes (after hydration)
	useEffect(() => {
		if (isHydrated) {
			try {
				if (template) {
					sessionStorage.setItem(STORAGE_KEY, JSON.stringify(template));
				} else {
					sessionStorage.removeItem(STORAGE_KEY);
				}
			} catch (e) {
				console.error("Failed to save reimbursement template to storage:", e);
			}
		}
	}, [template, isHydrated]);

	const setTemplate = useCallback(
		(newTemplate: ReimbursementTemplate | null) => {
			setTemplateState(newTemplate);
		},
		[],
	);

	const clearTemplate = useCallback(() => {
		setTemplateState(null);
		try {
			sessionStorage.removeItem(STORAGE_KEY);
		} catch (_e) {
			// Ignore
		}
	}, []);

	const hasTemplate = useCallback(() => {
		return template !== null;
	}, [template]);

	return (
		<ReimbursementTemplateContext.Provider
			value={{
				template,
				isHydrated,
				setTemplate,
				clearTemplate,
				hasTemplate,
			}}
		>
			{children}
		</ReimbursementTemplateContext.Provider>
	);
}

export function useReimbursementTemplate() {
	const context = useContext(ReimbursementTemplateContext);
	if (!context) {
		throw new Error(
			"useReimbursementTemplate must be used within a ReimbursementTemplateProvider",
		);
	}
	return context;
}
