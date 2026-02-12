/**
 * Universal source context for cross-entity linking
 * When navigating to create a new entity from another entity's picker,
 * this context carries information about the source to enable auto-linking.
 */
//TODO: REFORMAT TO THE NEW VERSION

export type EntityType =
	| "receipt"
	| "transaction"
	| "reimbursement"
	| "purchase" // alias for reimbursement
	| "budget"
	| "inventory"
	| "minute";

export interface SourceContext {
	/** Type of the source entity */
	type: EntityType;
	/** ID of the source entity */
	id: string;
	/** Optional: Name/title for display */
	name?: string;
}

/**
 * Serialize source context to URL parameter
 * Format: "type:id:name" (name is optional and URL-encoded)
 */
export function encodeRelationshipContext(context: SourceContext): string {
	const parts = [context.type, context.id];
	if (context.name) {
		parts.push(encodeURIComponent(context.name));
	}
	return parts.join(":");
}

/**
 * Parse source context from URL parameter
 */
export function decodeRelationshipContext(
	param: string | null,
): SourceContext | null {
	if (!param) return null;

	const parts = param.split(":");
	if (parts.length < 2) return null;

	return {
		type: parts[0] as EntityType,
		id: parts[1],
		name: parts[2] ? decodeURIComponent(parts[2]) : undefined,
	};
}

/**
 * Get source context from URL, supporting both new and legacy formats
 */
export function getRelationshipContextFromUrl(url: URL): SourceContext | null {
	// Try new format first
	const newFormat = decodeRelationshipContext(url.searchParams.get("source"));
	if (newFormat) return newFormat;

	return null;
}
