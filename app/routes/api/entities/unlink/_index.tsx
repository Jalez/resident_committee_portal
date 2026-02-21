import { data } from "react-router";
import type { RelationshipEntityType } from "~/db";
import { getDatabase } from "~/db/server.server";
import { getAuthenticatedUser } from "~/lib/auth.server";
import { canWriteRelationType } from "~/lib/relationships/permissions.server";
import { cleanupOrphanedDraft } from "~/lib/relationships/draft-lifecycle.server";
import type { Route } from "./+types/_index";

export async function action({ request }: Route.ActionArgs) {
	const db = getDatabase();
	const user = await getAuthenticatedUser(request, getDatabase);
	if (!user) {
		return data({ success: false, error: "Unauthorized" }, { status: 401 });
	}

	const formData = await request.formData();
	const relationAType = formData.get(
		"relationAType",
	) as RelationshipEntityType;
	const relationAId = formData.get("relationAId") as string;
	const relationBType = formData.get(
		"relationBType",
	) as RelationshipEntityType;
	const relationBId = formData.get("relationBId") as string;

	if (!relationAType || !relationAId || !relationBType || !relationBId) {
		return data(
			{ success: false, error: "Missing required parameters" },
			{ status: 400 },
		);
	}

	if (!canWriteRelationType(user.permissions, relationBType)) {
		return data(
			{ success: false, error: "Insufficient permissions" },
			{ status: 403 },
		);
	}

	try {
		const deleted = await db.deleteEntityRelationshipByPair(
			relationAType,
			relationAId,
			relationBType,
			relationBId,
		);

		if (deleted) {
			console.log(
				`[UnlinkEntity] Unlinked ${relationAType}:${relationAId} <-> ${relationBType}:${relationBId}`,
			);

			await cleanupOrphanedDraft(db, relationBType, relationBId);
		}

		return data({ success: true, deleted: !!deleted });
	} catch (error) {
		console.error("[UnlinkEntity] Failed to delete relationship:", error);
		return data(
			{ success: false, error: "Failed to delete relationship" },
			{ status: 500 },
		);
	}
}
