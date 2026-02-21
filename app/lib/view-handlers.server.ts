import type { DatabaseAdapter } from "~/db/server.server";
import { getDatabase } from "~/db/server.server";
import type { RelationshipEntityType } from "~/db/types";
import { requirePermissionOrSelf } from "./auth.server";
import { SITE_CONFIG } from "./config.server";
import { loadRelationshipsForEntity } from "./relationships/load-relationships.server";

const ALL_RELATIONSHIP_TYPES: RelationshipEntityType[] = [
	"receipt",
	"transaction",
	"reimbursement",
	"budget",
	"inventory",
	"minute",
	"news",
	"faq",
	"poll",
	"social",
	"event",
	"mail",
	"submission",
];

export interface ViewLoaderConfig<T> {
	entityType: string;
	permission: string;
	permissionSelf?: string;
	db?: DatabaseAdapter;
	params: Record<string, string | undefined>;
	request: Request;
	fetchEntity: (db: DatabaseAdapter, id: string) => Promise<T | null>;
	relationshipTypes?: string[];
	extend?: (data: {
		db: DatabaseAdapter;
		entity: T;
		params: Record<string, string | undefined>;
		request: Request;
	}) => Promise<Record<string, any>>;
}

export async function createViewLoader<
	T extends { id: string; createdBy?: string | null },
>({
	entityType,
	permission,
	permissionSelf,
	db = getDatabase(),
	params,
	request,
	fetchEntity,
	relationshipTypes,
	extend,
}: ViewLoaderConfig<T>) {
	const entityId = params[`${entityType}Id` as keyof typeof params];
	if (!entityId) {
		throw new Response(`${entityType} ID required`, { status: 400 });
	}

	const entity = await fetchEntity(db, entityId);
	if (!entity) {
		throw new Response("Not Found", { status: 404 });
	}

	const user = await requirePermissionOrSelf(
		request,
		permission,
		permissionSelf,
		(entity as any).createdBy,
		() => db,
	);

	// Load all relationship types by default, excluding the current entity type
	const typesToLoad = (relationshipTypes || ALL_RELATIONSHIP_TYPES).filter(
		(type) => type !== entityType,
	) as RelationshipEntityType[];

	const relationships = await loadRelationshipsForEntity(
		db,
		entityType as RelationshipEntityType,
		entity.id,
		typesToLoad,
		{ userPermissions: user.permissions },
	);

	let extraData = {};
	if (extend) {
		extraData = await extend({ db, entity, params, request });
	}

	return {
		siteConfig: SITE_CONFIG,
		[entityType]: entity,
		relationships,
		...extraData,
	} as any;
}
