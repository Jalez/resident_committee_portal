import { type ActionFunctionArgs, redirect } from "react-router";
import { getDatabase } from "~/db/server.server";
import type { RelationshipEntityType } from "~/db/types";
import { requirePermission, requirePermissionOrSelf } from "~/lib/auth.server";
import { getDraftAutoPublishStatus } from "~/lib/draft-auto-publish";
import { ENTITY_SCHEMAS } from "~/lib/entity-schemas";
import { saveRelationshipChanges } from "~/lib/relationships/save-relationships.server";

/**
 * Custom action handler (for special _action values like "close", "reopen", "sendRequest")
 */
export type CustomActionHandler = (
	db: ReturnType<typeof getDatabase>,
	item: any,
	formData: FormData,
	request: Request,
) => Promise<Response | null>;

/**
 * Options for creating a generic update action
 */
export interface GenericUpdateOptions {
	/** Name of the route param containing the entity ID (default: derived from entity type) */
	idParam?: string;

	/** Map of custom action handlers (keyed by _action value) */
	customActions?: Record<string, CustomActionHandler>;

	/** Hook called before updating the entity */
	beforeUpdate?: (
		db: ReturnType<typeof getDatabase>,
		item: any,
		fields: Record<string, any>,
		formData: FormData,
	) => Promise<void>;

	/** Hook called after updating the entity */
	afterUpdate?: (
		db: ReturnType<typeof getDatabase>,
		item: any,
		updatedItem: any,
	) => Promise<void>;

	/** Custom validation function (return error message or null) */
	validate?: (
		fields: Record<string, any>,
		item: any,
	) => Promise<string | null> | string | null;

	/** Skip relationship saving (for entities that don't use relationships) */
	skipRelationships?: boolean;

	/** Skip draft auto-publish (for entities that don't use drafts) */
	skipDraftAutoPublish?: boolean;

	/** Skip source context auto-linking */
	skipSourceContextLinking?: boolean;
}

/**
 * Create a generic update action for an entity type
 *
 * @param entityType - The entity type to update
 * @param options - Optional configuration
 * @returns A React Router action function
 *
 * @example
 * ```ts
 * // Simple entity (faq)
 * export const action = createGenericUpdateAction("faq", { idParam: "faqId" });
 *
 * // Entity with custom actions (budget)
 * export const action = createGenericUpdateAction("budget", {
 *   idParam: "budgetId",
 *   customActions: {
 *     close: async (db, item) => {
 *       await db.updateFundBudget(item.id, { status: "closed" });
 *       return redirect(`/treasury/budgets/${item.id}?success=closed`);
 *     },
 *     reopen: async (db, item) => {
 *       await db.updateFundBudget(item.id, { status: "open" });
 *       return redirect(`/treasury/budgets/${item.id}?success=reopened`);
 *     },
 *   },
 *   validate: async (fields, item) => {
 *     const newAmount = Number.parseFloat(fields.amount);
 *     const usedAmount = await db.getBudgetUsedAmount(item.id);
 *     if (newAmount < usedAmount) {
 *       return "cannot_reduce";
 *     }
 *     return null;
 *   },
 * });
 * ```
 */
export function createGenericUpdateAction(
	entityType: RelationshipEntityType,
	options: GenericUpdateOptions = {},
) {
	const schema = ENTITY_SCHEMAS[entityType];
	if (!schema) {
		throw new Error(`No schema found for entity type: ${entityType}`);
	}

	// Derive default idParam from entity type
	const defaultIdParam = `${entityType}Id`;
	const idParam = options.idParam || defaultIdParam;

	return async function action({ request, params }: ActionFunctionArgs) {
		const entityId = params[idParam];

		// ID validation
		if (!entityId) {
			throw new Response(`${entityType} ID required`, { status: 400 });
		}

		const db = getDatabase();
		const item = await schema.fetchById(db, entityId);

		if (!item) {
			throw new Response("Not Found", { status: 404 });
		}

		// Permission check
		let user: any = null;
		if (schema.supportsPermissionOrSelf && schema.createdByField) {
			user = await requirePermissionOrSelf(
				request,
				`${schema.permissionPrefix}:update`,
				`${schema.permissionPrefix}:update-self`,
				(item as any)[schema.createdByField],
				getDatabase,
			);
		} else {
			await requirePermission(
				request,
				`${schema.permissionPrefix}:update`,
				getDatabase,
			);
		}

		const formData = await request.formData();
		const actionType = formData.get("_action") as string | null;

		// Handle custom actions
		if (actionType && options.customActions?.[actionType]) {
			const result = await options.customActions[actionType](
				db,
				item,
				formData,
				request,
			);
			if (result) return result;
		}

		// Extract fields from formData
		const fields = schema.extractFields(formData);

		// Validate required fields
		for (const field of schema.requiredFields) {
			if (!fields[field]) {
				return {
					error: `${field} is required`,
					fieldErrors: { [field]: [`${field} is required`] },
				};
			}
		}

		// Custom validation
		if (options.validate) {
			const validationError = await options.validate(fields, item);
			if (validationError) {
				return { error: validationError };
			}
		}

		// Call beforeUpdate hook
		if (options.beforeUpdate) {
			await options.beforeUpdate(db, item, fields, formData);
		}

		// Update the entity
		const updatedItem = await schema.updateItem(db, entityId, fields);

		// Draft auto-publish
		if (
			!options.skipDraftAutoPublish &&
			schema.draftAutoPublishFields &&
			(item as any).status === "draft"
		) {
			const newStatus = getDraftAutoPublishStatus(
				entityType,
				(item as any).status,
				fields,
			);
			if (newStatus) {
				await schema.updateItem(db, entityId, { status: newStatus });
			}
		}

		// Save relationships
		if (!options.skipRelationships) {
			await saveRelationshipChanges(
				db,
				entityType,
				entityId,
				formData,
				user?.userId || null,
			);
		}

		// Source context auto-linking
		if (!options.skipSourceContextLinking) {
			const sourceType = formData.get("_sourceType") as string | null;
			const sourceId = formData.get("_sourceId") as string | null;
			if (sourceType && sourceId) {
				const exists = await db.entityRelationshipExists(
					sourceType as any,
					sourceId,
					entityType,
					entityId,
				);
				if (!exists) {
					await db.createEntityRelationship({
						relationAType: sourceType as any,
						relationId: sourceId,
						relationBType: entityType,
						relationBId: entityId,
						createdBy: user?.userId || null,
					});
				}
			}
		}

		// Call afterUpdate hook
		if (options.afterUpdate && updatedItem) {
			await options.afterUpdate(db, item, updatedItem);
		}

		// Handle returnUrl redirect
		const returnUrl = formData.get("_returnUrl") as string | null;
		if (returnUrl) {
			return redirect(returnUrl);
		}

		// Default redirect
		const defaultUrl =
			typeof schema.defaultRedirect === "function"
				? schema.defaultRedirect(entityId)
				: schema.defaultRedirect;
		return redirect(defaultUrl);
	};
}
