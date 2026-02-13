import type { RelationshipEntityType } from "~/db/types";
import {
	ENTITY_DEFINITIONS,
	type RequiredRelationshipConfig,
} from "./entity-definitions";

export interface RequiredRelationshipsResult {
	valid: boolean;
	missing: Array<{
		type: RelationshipEntityType;
		required: number;
		current: number;
		reasonKey?: string;
	}>;
}

/**
 * Validates that all required relationships are satisfied for a given entity.
 *
 * @param entityType - The type of entity being validated
 * @param relationships - The current relationships object from the loader
 * @returns Validation result with any missing requirements
 */
export function validateRequiredRelationships(
	entityType: RelationshipEntityType,
	relationships: Record<string, { linked: any[] }>,
): RequiredRelationshipsResult {
	const definition = ENTITY_DEFINITIONS[entityType];
	const required = definition?.requiredRelationships;

	if (!required || required.length === 0) {
		return { valid: true, missing: [] };
	}

	const missing: RequiredRelationshipsResult["missing"] = [];

	for (const requirement of required) {
		const linked = relationships[requirement.type]?.linked || [];
		const currentCount = linked.length;
		const requiredCount = requirement.minItems ?? 1;

		if (currentCount < requiredCount) {
			missing.push({
				type: requirement.type,
				required: requiredCount,
				current: currentCount,
				reasonKey: requirement.reasonKey,
			});
		}
	}

	return {
		valid: missing.length === 0,
		missing,
	};
}

/**
 * Gets the required relationships configuration for an entity type.
 *
 * @param entityType - The type of entity
 * @returns Array of required relationship configurations
 */
export function getRequiredRelationships(
	entityType: RelationshipEntityType,
): RequiredRelationshipConfig[] {
	return ENTITY_DEFINITIONS[entityType]?.requiredRelationships || [];
}

/**
 * Formats a user-friendly message about missing required relationships.
 *
 * @param missing - Array of missing relationship requirements
 * @param t - Translation function
 * @returns Formatted message string
 */
export function formatMissingRelationshipsMessage(
	missing: RequiredRelationshipsResult["missing"],
	t: (key: string, options?: any) => string,
): string {
	const parts = missing.map((m) => {
		const entityName = t(`common.entities.${m.type}`, { defaultValue: m.type });
		if (m.reasonKey) {
			return t(m.reasonKey, { defaultValue: `${entityName} is required` });
		}
		return t("common.relationships.required_missing", {
			entity: entityName,
			required: m.required,
			current: m.current,
			defaultValue: `${entityName}: ${m.current}/${m.required} required`,
		});
	});

	return parts.join(", ");
}
