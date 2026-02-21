import {
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
	redirect,
} from "react-router";
import { getDatabase } from "~/db/server.server";
import type { RelationshipEntityType } from "~/db/types";
import {
	requireDeletePermissionOrSelf,
	requirePermission,
} from "~/lib/auth.server";
import { ENTITY_SCHEMAS } from "~/lib/entity-schemas";

function getErrorChain(error: unknown): Array<Record<string, unknown>> {
	const chain: Array<Record<string, unknown>> = [];
	const seen = new Set<unknown>();
	let current: unknown = error;

	while (current && typeof current === "object" && !seen.has(current)) {
		seen.add(current);
		chain.push(current as Record<string, unknown>);
		current = (current as { cause?: unknown }).cause;
	}

	return chain;
}

function toSafeDeleteError(entityType: RelationshipEntityType, error: unknown) {
	const chain = getErrorChain(error);
	const code = chain.find((e) => typeof e.code === "string")?.code as
		| string
		| undefined;
	const dependencyDetails = Array.from(
		new Set(
			chain
				.flatMap((e) => {
					const details: string[] = [];
					if (typeof e.detail === "string" && e.detail.trim()) {
						details.push(e.detail.trim());
					}
					if (typeof e.table === "string" && e.table.trim()) {
						details.push(`Referenced table: ${e.table.trim()}`);
					}
					if (typeof e.constraint === "string" && e.constraint.trim()) {
						details.push(`Constraint: ${e.constraint.trim()}`);
					}
					if (typeof e.message === "string") {
						const match = e.message.match(/referenced from table\s+"([^"]+)"/i);
						if (match?.[1]) {
							details.push(`Referenced table: ${match[1]}`);
						}
					}
					return details;
				})
				.filter(Boolean),
		),
	);
	const combinedMessage = chain
		.map((e) => (typeof e.message === "string" ? e.message : ""))
		.filter(Boolean)
		.join("\n")
		.toLowerCase();

	const isForeignKeyViolation =
		code === "23503" || combinedMessage.includes("foreign key");

	if (isForeignKeyViolation) {
		return {
			status: 400,
			error:
				`Cannot delete this ${entityType} because other records still reference it. Remove dependent links or records first.`,
			blockingDependencies: dependencyDetails,
		};
	}

	return {
		status: 500,
		error: "Delete failed due to an unexpected server error.",
		blockingDependencies: [],
	};
}

/**
 * Options for creating a generic delete action
 */
export interface GenericDeleteOptions {
	/** Name of the route param containing the entity ID (default: derived from entity type) */
	idParam?: string;

	/** If true, remove all links for this entity before deleting instead of blocking. */
	autoUnlinkAllRelationships?: boolean;

	/** Hook called before deleting the entity (for entity-specific cleanup) */
	beforeDelete?: (
		db: ReturnType<typeof getDatabase>,
		item: any,
	) => Promise<void>;

	/** Custom redirect URL after successful delete */
	redirectUrl?: string | ((item: any) => string);
}

/**
 * Generic loader for delete routes (returns 405 Method Not Allowed)
 */
export async function genericDeleteLoader({
	request: _request,
	params: _params,
}: LoaderFunctionArgs) {
	return new Response(JSON.stringify({ error: "Method not allowed" }), {
		status: 405,
		headers: {
			"Content-Type": "application/json",
			Allow: "POST, DELETE",
		},
	});
}

/**
 * Create a generic delete action for an entity type
 *
 * @param entityType - The entity type to delete
 * @param options - Optional configuration
 * @returns A React Router action function
 *
 * @example
 * ```ts
 * // In app/routes/api/faq/$faqId/delete/_index.tsx
 * export const action = createGenericDeleteAction("faq", { idParam: "faqId" });
 * export { genericDeleteLoader as loader } from "~/lib/actions/generic-delete.server";
 * ```
 */
export function createGenericDeleteAction(
	entityType: RelationshipEntityType,
	options: GenericDeleteOptions = {},
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

		// Parse JSON body for returnUrl
		let jsonData: any = null;
		try {
			jsonData = await request.json();
		} catch {
			// Ignore JSON parse errors
		}

		// Method check
		if (request.method !== "DELETE" && request.method !== "POST") {
			return new Response(JSON.stringify({ error: "Method not allowed" }), {
				status: 405,
				headers: { "Content-Type": "application/json" },
			});
		}

		// ID validation
		if (!entityId) {
			return new Response(
				JSON.stringify({ error: `${entityType} ID is required` }),
				{
					status: 400,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		const db = getDatabase();
		const item = await schema.fetchById(db, entityId);

		if (!item) {
			return new Response(
				JSON.stringify({ error: `${entityType} not found` }),
				{
					status: 404,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		// Permission check
		if (schema.supportsPermissionOrSelf && schema.createdByField) {
			await requireDeletePermissionOrSelf(
				request,
				`${schema.permissionPrefix}:delete`,
				`${schema.permissionPrefix}:delete-self`,
				(item as any)[schema.createdByField],
				getDatabase,
			);
		} else {
			await requirePermission(
				request,
				`${schema.permissionPrefix}:delete`,
				getDatabase,
			);
		}

		try {
			// Check for relationships
			const relationships = await db.getEntityRelationships(
				entityType,
				entityId,
			);
			if (relationships.length > 0 && !options.autoUnlinkAllRelationships) {
				return new Response(
					JSON.stringify({
						error: "Cannot delete a linked item. Remove all links first.",
						blockingRelationships: relationships,
					}),
					{
						status: 400,
						headers: { "Content-Type": "application/json" },
					},
				);
			}

			if (relationships.length > 0 && options.autoUnlinkAllRelationships) {
				for (const rel of relationships) {
					await db.deleteEntityRelationship(rel.id);
				}
			}

			// Call beforeDelete hook if provided
			if (options.beforeDelete) {
				await options.beforeDelete(db, item);
			}

			// Delete the entity
			await schema.deleteItem(db, entityId);

			// Handle returnUrl redirect
			const returnUrl = jsonData?._returnUrl as string | null;
			if (returnUrl) {
				return redirect(returnUrl);
			}

			// Custom redirect or default
			if (options.redirectUrl) {
				const url =
					typeof options.redirectUrl === "function"
						? options.redirectUrl(item)
						: options.redirectUrl;
				return redirect(url);
			}

			return Response.json({ success: true });
		} catch (error) {
			console.error(`[api.${entityType}.delete]`, error);
			const safeError = toSafeDeleteError(entityType, error);
			return new Response(
				JSON.stringify({
					error: safeError.error,
					blockingDependencies: safeError.blockingDependencies,
				}),
				{
					status: safeError.status,
					headers: { "Content-Type": "application/json" },
				},
			);
		}
	};
}
