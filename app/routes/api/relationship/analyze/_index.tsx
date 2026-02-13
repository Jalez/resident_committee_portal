/**
 * API Endpoint: Analyze Entity Relationships
 *
 * Analyzes a source entity (Receipt, Transaction, Reimbursement, Minute)
 * and creates draft entities for suggested relationships.
 *
 * POST /api/relationships/analyze
 * Body: { entityType, entityId }
 * Response: { success, createdCount, created: [...], errors: [...] }
 */

import { data } from "react-router";
import { getDatabase } from "~/db/server";
import type { RelationshipEntityType } from "~/db";
import { getAnalyzerForType } from "~/lib/ai/entity-relationship-analyzer.server";
import { requirePermissionOrSelf } from "~/lib/auth.server";
import type { Route } from "./+types/_index";

export async function action({ request }: Route.ActionArgs) {
	const formData = await request.formData();
	const entityType = formData.get("entityType") as RelationshipEntityType;
	const entityId = formData.get("entityId") as string;

	if (!entityType || !entityId) {
		return data(
			{ success: false, error: "Missing entityType or entityId" },
			{ status: 400 },
		);
	}

	const db = getDatabase();

	try {
		// 1. Permission Check
		await checkPermissions(request, entityType, entityId, db);

		// 2. Fetch the source entity
		const entity = await fetchEntity(entityType, entityId, db);
		if (!entity) {
			return data(
				{ success: false, error: "Entity not found" },
				{ status: 404 },
			);
		}

		// 3. Get the appropriate analyzer
		const analyzer = getAnalyzerForType(entityType);
		if (!analyzer) {
			return data(
				{
					success: false,
					error: `No analyzer available for entity type: ${entityType}`,
				},
				{ status: 400 },
			);
		}

		// 4. Run analysis
		const analysisResult = await analyzer.analyze(entity, db);

		// 5. Create draft entities for each suggestion
		const created: Array<{ type: string; id: string; name: string }> = [];
		const errors: string[] = analysisResult.errors || [];

		for (const suggestion of analysisResult.suggestions) {
			try {
				const draftEntity = await createDraftEntity(
					suggestion.entityType,
					suggestion.data,
					db,
				);
				if (draftEntity) {
					// Create entity relationship link
					await db.createEntityRelationship({
						relationAType: entityType,
						relationId: entityId,
						relationBType: suggestion.entityType,
						relationBId: draftEntity.id,
						metadata: JSON.stringify({
							aiCreated: true,
							confidence: suggestion.confidence,
							reasoning: suggestion.reasoning,
							...suggestion.metadata,
						}),
						createdBy: null, // System-generated
					});

					created.push({
						type: suggestion.entityType,
						id: draftEntity.id,
						name: suggestion.name,
					});
				}
			} catch (error) {
				console.error(
					`[AnalyzeAPI] Failed to create ${suggestion.entityType}:`,
					error,
				);
				errors.push(
					`Failed to create ${suggestion.entityType}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}

		return data({
			success: true,
			createdCount: created.length,
			created,
			errors: errors.length > 0 ? errors : undefined,
		});
	} catch (error) {
		console.error("[AnalyzeAPI] Request failed:", error);
		return data(
			{
				success: false,
				error: error instanceof Error ? error.message : String(error),
			},
			{ status: 500 },
		);
	}
}

/**
 * Check if user has permission to analyze this entity
 */
async function checkPermissions(
	request: Request,
	entityType: RelationshipEntityType,
	entityId: string,
	db: ReturnType<typeof getDatabase>,
) {
	let createdBy: string | null = null;

	if (entityType === "receipt") {
		const r = await db.getReceiptById(entityId);
		createdBy = r?.createdBy ?? null;
	} else if (entityType === "reimbursement") {
		const p = await db.getPurchaseById(entityId);
		createdBy = p?.createdBy ?? null;
	} else if (entityType === "transaction") {
		const t = await db.getTransactionById(entityId);
		createdBy = t?.createdBy ?? null;
	} else if (entityType === "minute") {
		const m = await db.getMinuteById(entityId);
		createdBy = m?.createdBy ?? null;
	}

	const permissionMap: Record<RelationshipEntityType, string> = {
		receipt: "treasury:receipts:update",
		transaction: "treasury:transactions:update",
		reimbursement: "treasury:reimbursements:update",
		budget: "treasury:budgets:update",
		inventory: "inventory:write",
		minute: "minutes:update",
		news: "news:update",
		faq: "faq:update",
		poll: "polls:update",
		social: "social:write",
		event: "events:write",
		mail: "mail:read",
	};

	const permission = permissionMap[entityType];
	if (permission && createdBy !== null) {
		await requirePermissionOrSelf(
			request,
			permission,
			`${permission}-self`,
			createdBy,
			getDatabase,
		);
	}
}

/**
 * Fetch the entity from the database
 */
async function fetchEntity(
	entityType: RelationshipEntityType,
	entityId: string,
	db: ReturnType<typeof getDatabase>,
): Promise<unknown | null> {
	switch (entityType) {
		case "receipt":
			return db.getReceiptById(entityId);
		case "reimbursement":
			return db.getPurchaseById(entityId);
		case "transaction":
			return db.getTransactionById(entityId);
		case "minute":
			return db.getMinuteById(entityId);
		case "mail":
			return db.getCommitteeMailMessageById(entityId);
		default:
			return null;
	}
}

/**
 * Create a draft entity from a suggestion
 */
async function createDraftEntity(
	entityType: RelationshipEntityType,
	data: Record<string, unknown>,
	db: ReturnType<typeof getDatabase>,
): Promise<{ id: string } | null> {
	switch (entityType) {
		case "transaction":
			return db.createTransaction(
				data as Parameters<typeof db.createTransaction>[0],
			);
		case "inventory":
			return db.createInventoryItem(
				data as Parameters<typeof db.createInventoryItem>[0],
			);
		case "reimbursement":
			return db.createPurchase(data as Parameters<typeof db.createPurchase>[0]);
		case "news":
			return db.createNews(data as Parameters<typeof db.createNews>[0]);
		case "faq":
			return db.createFaq(data as Parameters<typeof db.createFaq>[0]);
		case "budget":
			return db.createFundBudget(
				data as Parameters<typeof db.createFundBudget>[0],
			);
		case "receipt":
			return db.createReceipt(data as Parameters<typeof db.createReceipt>[0]);
		case "mail":
			return db.insertMailDraft(data as Parameters<typeof db.insertMailDraft>[0]);
		default:
			return null;
	}
}
