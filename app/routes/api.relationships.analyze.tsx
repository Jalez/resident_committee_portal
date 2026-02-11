/**
 * API Route: POST /api/relationships/analyze
 *
 * Analyzes an entity using AI to suggest and create draft related entities.
 * This is the main entry point for the "Analyze with AI" button in the RelationshipPicker.
 *
 * Request Body: { entityType, entityId }
 * Response: { success, createdCount, created: [{ type, id, name }], errors? }
 */

import type { ActionFunctionArgs } from "react-router";
import { getDatabase } from "~/db";
import type { RelationshipEntityType } from "~/db/schema";
import {
	type AnalysisResult,
	analyzeMinute,
	analyzeReceipt,
	analyzeReimbursement,
	analyzeTransaction,
} from "~/lib/ai/per-type-analyzers.server";
import { getAuthenticatedUser } from "~/lib/auth.server";

interface AnalysisRequest {
	entityType: RelationshipEntityType;
	entityId: string;
}

export async function action({ request }: ActionFunctionArgs) {
	// 1. Auth check - require receipt processing or treasury write permission
	const db = getDatabase();
	const user = await getAuthenticatedUser(request, () => db);

	if (!user) {
		return Response.json(
			{ success: false, error: "Unauthorized" },
			{ status: 401 },
		);
	}

	const canAnalyze =
		user.permissions.includes("treasury:receipts:process") ||
		user.permissions.includes("treasury:write") ||
		user.permissions.includes("*");

	if (!canAnalyze) {
		return Response.json(
			{ success: false, error: "Insufficient permissions" },
			{ status: 403 },
		);
	}

	// 2. Parse request
	let body: AnalysisRequest;
	try {
		body = await request.json();
	} catch {
		return Response.json(
			{ success: false, error: "Invalid JSON body" },
			{ status: 400 },
		);
	}

	const { entityType, entityId } = body;

	if (!entityType || !entityId) {
		return Response.json(
			{ success: false, error: "Missing entityType or entityId" },
			{ status: 400 },
		);
	}

	// 4. Get appropriate analyzer for entity type
	try {
		let result: AnalysisResult;

		switch (entityType) {
			case "receipt":
				result = await analyzeReceipt(db, entityId, user.userId);
				break;
			case "reimbursement":
				result = await analyzeReimbursement(db, entityId, user.userId);
				break;
			case "transaction":
				result = await analyzeTransaction(db, entityId, user.userId);
				break;
			case "minute":
				result = await analyzeMinute(db, entityId, user.userId);
				break;
			default:
				return Response.json(
					{
						success: false,
						error: `Analysis not supported for entity type: ${entityType}`,
					},
					{ status: 400 },
				);
		}

		return Response.json({
			success: result.success,
			createdCount: result.created.length,
			created: result.created,
			errors: result.errors,
		});
	} catch (error) {
		console.error("[API Analyze] Analysis failed:", error);
		return Response.json(
			{
				success: false,
				error: error instanceof Error ? error.message : "Analysis failed",
			},
			{ status: 500 },
		);
	}
}
