import { useCallback, useEffect, useRef } from "react";
import { useBeforeUnload, useNavigation } from "react-router";
import { useDraft } from "~/contexts/form-draft-context";

/**
 * Hook that automatically saves draft before navigation
 * Prevents data loss when clicking "Add" from pickers before saving
 */
export function useDraftAutoSave<T>(
	entityType: string,
	entityId: string,
	getDraftData: () => T,
	isFormDirty: boolean,
) {
	const { saveDraft } = useDraft<T>(entityType, entityId);
	const navigation = useNavigation();
	const lastSavedRef = useRef<string>("");

	// Save on navigation start
	useEffect(() => {
		if (navigation.state === "loading" && isFormDirty) {
			const data = getDraftData();
			const dataStr = JSON.stringify(data);

			// Only save if data changed
			if (dataStr !== lastSavedRef.current) {
				saveDraft(data);
				lastSavedRef.current = dataStr;
				console.log(
					`[DraftAutoSave] Saved draft for ${entityType}:${entityId} before navigation`,
				);
			}
		}
	}, [
		navigation.state,
		isFormDirty,
		getDraftData,
		saveDraft,
		entityType,
		entityId,
	]);

	// Save on page unload
	const beforeUnloadCallback = useCallback(() => {
		if (isFormDirty) {
			saveDraft(getDraftData());
		}
	}, [isFormDirty, getDraftData, saveDraft]);

	useBeforeUnload(beforeUnloadCallback);
}
