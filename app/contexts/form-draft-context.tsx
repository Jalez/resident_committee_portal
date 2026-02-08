/**
 * Form Draft Context
 *
 * Generic sessionStorage-based draft persistence for forms.
 * Stores form state by entity type and ID so users can resume
 * filling out forms after navigating away.
 */

import { useCallback, useEffect, useState } from "react";

const STORAGE_PREFIX = "hippos_draft:";

/**
 * Hook for persisting form draft state in sessionStorage.
 *
 * @param entityType - The entity type (e.g. "transaction", "reimbursement")
 * @param entityId - The entity ID or "new" for new entities
 * @returns Draft state management functions
 */
export function useDraft<T>(entityType: string, entityId: string) {
	const key = `${STORAGE_PREFIX}${entityType}:${entityId}`;
	const [draft, setDraftState] = useState<T | null>(null);
	const [isHydrated, setIsHydrated] = useState(false);

	// Load from sessionStorage on mount
	useEffect(() => {
		try {
			const stored = sessionStorage.getItem(key);
			if (stored) {
				setDraftState(JSON.parse(stored));
			}
		} catch (e) {
			console.error(`Failed to load draft for ${key}:`, e);
		}
		setIsHydrated(true);
	}, [key]);

	const saveDraft = useCallback(
		(data: T) => {
			setDraftState(data);
			try {
				sessionStorage.setItem(key, JSON.stringify(data));
			} catch (e) {
				console.error(`Failed to save draft for ${key}:`, e);
			}
		},
		[key],
	);

	const loadDraft = useCallback((): T | null => {
		try {
			const stored = sessionStorage.getItem(key);
			return stored ? JSON.parse(stored) : null;
		} catch {
			return null;
		}
	}, [key]);

	const clearDraft = useCallback(() => {
		setDraftState(null);
		try {
			sessionStorage.removeItem(key);
		} catch (_e) {
			// Ignore
		}
	}, [key]);

	return {
		draft,
		isHydrated,
		saveDraft,
		loadDraft,
		clearDraft,
	};
}
