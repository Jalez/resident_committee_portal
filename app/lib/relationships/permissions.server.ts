import type { RelationshipEntityType } from "~/db/types";
import { ENTITY_DEFINITIONS } from "~/lib/entity-definitions";

export function permissionMatches(
	userPermission: string,
	requiredPermission: string,
): boolean {
	if (userPermission === requiredPermission) return true;
	if (userPermission.endsWith(":*")) {
		const prefix = userPermission.slice(0, -1);
		return requiredPermission.startsWith(prefix);
	}
	if (userPermission === "*") return true;
	return false;
}

function hasAnyPermission(
	userPermissions: string[],
	requiredPermissions: string[],
): boolean {
	return requiredPermissions.some((requiredPermission) =>
		userPermissions.some((userPermission) =>
			permissionMatches(userPermission, requiredPermission),
		),
	);
}

export function getReadPermissionsForType(
	entityType: RelationshipEntityType,
): string[] {
	if (entityType === "mail") {
		return ["committee:email"];
	}

	const definition = ENTITY_DEFINITIONS[entityType];
	if (!definition) return [];

	const prefix = definition.permissionPrefix;
	if (!prefix) return [];
	const permissions = [
		`${prefix}:read`,
		`${prefix}:read-self`,
		`${prefix}:write`,
		`${prefix}:write-self`,
		`${prefix}:update`,
		`${prefix}:update-self`,
		`${prefix}:delete`,
		`${prefix}:delete-self`,
		`${prefix}:*`,
	];

	if (prefix.startsWith("treasury:")) {
		permissions.push("treasury:read", "treasury:write", "treasury:*");
	}

	return permissions;
}

export function getWritePermissionsForType(
	entityType: RelationshipEntityType,
): string[] {
	if (entityType === "mail") {
		return ["committee:email"];
	}

	const definition = ENTITY_DEFINITIONS[entityType];
	if (!definition) return [];

	const prefix = definition.permissionPrefix;
	if (!prefix) return [];
	const permissions = [
		`${prefix}:write`,
		`${prefix}:write-self`,
		`${prefix}:update`,
		`${prefix}:update-self`,
		`${prefix}:delete`,
		`${prefix}:delete-self`,
		`${prefix}:*`,
	];

	if (prefix.startsWith("treasury:")) {
		permissions.push("treasury:write", "treasury:*");
	}

	return permissions;
}

export function canReadRelationType(
	userPermissions: string[] | undefined,
	entityType: RelationshipEntityType,
): boolean {
	if (!userPermissions) return true;
	return hasAnyPermission(userPermissions, getReadPermissionsForType(entityType));
}

export function canWriteRelationType(
	userPermissions: string[] | undefined,
	entityType: RelationshipEntityType,
): boolean {
	if (!userPermissions) return true;
	return hasAnyPermission(userPermissions, getWritePermissionsForType(entityType));
}
