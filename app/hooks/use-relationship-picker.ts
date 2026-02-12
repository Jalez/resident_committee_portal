import { useCallback, useState } from "react";
import type { RelationshipEntityType } from "~/db/types";

/**
 * Represents a pending link to be created
 */
export interface PendingLink {
	relationBType: RelationshipEntityType;
	relationBId: string;
	metadata?: Record<string, unknown>;
}

/**
 * Represents a pending unlink to be removed
 */
export interface PendingUnlink {
	relationBType: RelationshipEntityType;
	relationBId: string;
}

/**
 * Initial relationships loaded from the server
 */
export interface InitialRelationship {
	relationBType: RelationshipEntityType;
	relationBId: string;
	metadata?: Record<string, unknown>;
}

export interface UseRelationshipPickerOptions {
	relationAType: RelationshipEntityType;
	relationAId: string;
	initialRelationships?: InitialRelationship[];
}

/**
 * Hook for managing relationship picker state
 * Tracks pending links/unlinks for form submission
 */
export function useRelationshipPicker({
	relationAType,
	relationAId,
	initialRelationships = [],
}: UseRelationshipPickerOptions) {
	const [pendingLinks, setPendingLinks] = useState<PendingLink[]>([]);
	const [pendingUnlinks, setPendingUnlinks] = useState<PendingUnlink[]>([]);

	/**
	 * Check if a relationship is currently linked (considering pending changes)
	 */
	const isLinked = useCallback(
		(relationBType: RelationshipEntityType, relationBId: string): boolean => {
			// Check if it's in initial relationships
			const initiallyLinked = initialRelationships.some(
				(rel) =>
					rel.relationBType === relationBType &&
					rel.relationBId === relationBId,
			);

			// Check if it's pending unlink
			const isPendingUnlink = pendingUnlinks.some(
				(unlink) =>
					unlink.relationBType === relationBType &&
					unlink.relationBId === relationBId,
			);

			// Check if it's pending link
			const isPendingLink = pendingLinks.some(
				(link) =>
					link.relationBType === relationBType &&
					link.relationBId === relationBId,
			);

			return (initiallyLinked && !isPendingUnlink) || isPendingLink;
		},
		[initialRelationships, pendingLinks, pendingUnlinks],
	);

	/**
	 * Add a new relationship link
	 */
	const handleLink = useCallback(
		(
			relationBType: RelationshipEntityType,
			relationBId: string,
			metadata?: Record<string, unknown>,
		) => {
			// Remove from pending unlinks if it exists
			setPendingUnlinks((prev) =>
				prev.filter(
					(u) =>
						!(
							u.relationBType === relationBType && u.relationBId === relationBId
						),
				),
			);

			// Check if it's already in initial relationships
			const alreadyLinked = initialRelationships.some(
				(rel) =>
					rel.relationBType === relationBType &&
					rel.relationBId === relationBId,
			);

			// Only add to pending links if not already linked
			if (!alreadyLinked) {
				setPendingLinks((prev) => {
					// Avoid duplicates
					const exists = prev.some(
						(l) =>
							l.relationBType === relationBType &&
							l.relationBId === relationBId,
					);
					if (exists) return prev;

					return [...prev, { relationBType, relationBId, metadata }];
				});
			}
		},
		[initialRelationships],
	);

	/**
	 * Remove a relationship link
	 */
	const handleUnlink = useCallback(
		(relationBType: RelationshipEntityType, relationBId: string) => {
			// Remove from pending links if it exists
			setPendingLinks((prev) =>
				prev.filter(
					(l) =>
						!(
							l.relationBType === relationBType && l.relationBId === relationBId
						),
				),
			);

			// Check if it's in initial relationships
			const initiallyLinked = initialRelationships.some(
				(rel) =>
					rel.relationBType === relationBType &&
					rel.relationBId === relationBId,
			);

			// Only add to pending unlinks if it was initially linked
			if (initiallyLinked) {
				setPendingUnlinks((prev) => {
					// Avoid duplicates
					const exists = prev.some(
						(u) =>
							u.relationBType === relationBType &&
							u.relationBId === relationBId,
					);
					if (exists) return prev;

					return [...prev, { relationBType, relationBId }];
				});
			}
		},
		[initialRelationships],
	);

	/**
	 * Serialize state to FormData for form submission
	 */
	const toFormData = useCallback(() => {
		return {
			_relationship_links: JSON.stringify(pendingLinks),
			_relationship_unlinks: JSON.stringify(pendingUnlinks),
		};
	}, [pendingLinks, pendingUnlinks]);

	/**
	 * Reset state to initial
	 */
	const reset = useCallback(() => {
		setPendingLinks([]);
		setPendingUnlinks([]);
	}, []);

	/**
	 * Check if there are any pending changes
	 */
	const hasPendingChanges =
		pendingLinks.length > 0 || pendingUnlinks.length > 0;

	return {
		pendingLinks,
		pendingUnlinks,
		isLinked,
		handleLink,
		handleUnlink,
		toFormData,
		reset,
		hasPendingChanges,
	};
}
