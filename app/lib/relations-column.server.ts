import type { getDatabase } from "~/db/server.server";
import type { RelationshipEntityType } from "~/db/types";
import { canReadRelationType } from "./relationships/permissions.server";
import { loadRelationshipsForEntity } from "./relationships/load-relationships.server";
import {
	RELATION_CONFIG,
	getStatusVariant,
	DEFAULT_STATUS_VARIANT,
} from "./relation-config";

export interface RelationBadgeData {
	id: string;
	type: RelationshipEntityType;
	href: string;
	icon: string;
	statusVariant: string;
	tooltipTitleKey: string;
	tooltipSubtitle: string;
}

const ALL_RELATION_TYPES: RelationshipEntityType[] = [
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
	"mail",
	"event",
];

function getVisibleRelationTypes(
	relationTypes: RelationshipEntityType[] | undefined,
	userPermissions: string[] | undefined,
): RelationshipEntityType[] {
	const typesToLoad = relationTypes ?? ALL_RELATION_TYPES;
	if (!userPermissions) return typesToLoad;

	return typesToLoad.filter((type) => canReadRelationType(userPermissions, type));
}

export async function loadRelationsForTableColumn(
	db: ReturnType<typeof getDatabase>,
	entityType: RelationshipEntityType,
	entityId: string,
	relationTypes?: RelationshipEntityType[],
	userPermissions?: string[],
): Promise<RelationBadgeData[]> {
	const typesToLoad = getVisibleRelationTypes(relationTypes, userPermissions);
	if (typesToLoad.length === 0) return [];

	const relationships = await loadRelationshipsForEntity(
		db,
		entityType,
		entityId,
		typesToLoad,
	);

	const badgeData: RelationBadgeData[] = [];

	for (const [relType, data] of Object.entries(relationships)) {
		const typedRelType = relType as RelationshipEntityType;
		const config = RELATION_CONFIG[typedRelType];
		if (!config) continue;

		const linkedEntities = data.linked;
		if (!linkedEntities || linkedEntities.length === 0) continue;

		for (const entity of linkedEntities) {
			if (!entity || typeof entity !== "object") continue;
			const record = entity as Record<string, unknown>;
			const id = record.id;
			if (typeof id !== "string") continue;

			const status = config.getStatus(entity);
			const statusVariant = status
				? getStatusVariant(typedRelType, status)
				: DEFAULT_STATUS_VARIANT;

			const name = config.getName(entity);
			const shortId = id.slice(0, 8);
			const tooltipSubtitle = name !== "—" ? `${name} (${shortId})` : shortId;
			const href =
				typedRelType === "mail"
					? (() => {
							const threadId = record.threadId;
							if ("draftType" in record) {
								return `/mail/drafts/${id}/edit`;
							}
							if (typeof threadId === "string" && threadId.trim().length > 0) {
								return `/mail/thread/${encodeURIComponent(threadId)}`;
							}
							return `/mail/messages/${id}`;
						})()
					: `${config.route}/${id}`;

			badgeData.push({
				id,
				type: typedRelType,
				href,
				icon: config.icon,
				statusVariant,
				tooltipTitleKey: config.labelKey,
				tooltipSubtitle,
			});
		}
	}

	return badgeData;
}

export async function loadRelationsMapForEntities(
	db: ReturnType<typeof getDatabase>,
	entityType: RelationshipEntityType,
	entityIds: string[],
	relationTypes?: RelationshipEntityType[],
	userPermissions?: string[],
): Promise<Map<string, RelationBadgeData[]>> {
	const map = new Map<string, RelationBadgeData[]>();

	await Promise.all(
		entityIds.map(async (id) => {
			const relations = await loadRelationsForTableColumn(
				db,
				entityType,
				id,
				relationTypes,
				userPermissions,
			);
			map.set(id, relations);
		}),
	);

	return map;
}
