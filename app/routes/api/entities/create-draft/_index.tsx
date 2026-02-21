import { data, redirect } from "react-router";
import type { RelationshipEntityType } from "~/db";
import { getDatabase } from "~/db/server.server";
import { requireAnyPermission } from "~/lib/auth.server";
import { getRelationshipContext } from "~/lib/relationships/relationship-context.server";
import type { Route } from "./+types/_index";

// Handle GET requests - redirect to home
export function loader() {
	return redirect("/");
}

// Handle POST requests to create draft entities
export async function action({ request }: Route.ActionArgs) {
	const formData = await request.formData();
	const type = formData.get("type") as RelationshipEntityType;
	const sourceType = formData.get(
		"sourceType",
	) as RelationshipEntityType | null;
	const sourceId = formData.get("sourceId") as string | null;
	const sourceName = formData.get("sourceName") as string | null;
	const returnUrl = formData.get("returnUrl") as string | null;

	if (!type) {
		return data(
			{ success: false, error: "Missing entity type" },
			{ status: 400 },
		);
	}

	// Check if request is from a fetcher (expects JSON) or regular form (expects redirect)
	// Fetcher requests pass _fetcher=true in formData
	const isFetcher = formData.get("_fetcher") === "true";

	const db = getDatabase();

	// Check permissions - require appropriate write permission
	const permissionMap: Record<RelationshipEntityType, string[]> = {
		receipt: ["treasury:receipts:write"],
		transaction: ["treasury:transactions:write"],
		reimbursement: ["treasury:reimbursements:write"],
		budget: ["treasury:budgets:write"],
		inventory: ["inventory:write"],
		minute: ["minutes:write"],
		news: ["news:write"],
		faq: ["faq:write"],
		poll: ["polls:write"],
		social: ["social:write"],
		event: ["events:write"],
		mail: ["committee:email"],
		submission: ["submissions:write"],
		message: ["admin"],
	};

	const permissions = permissionMap[type] || ["admin"];
	const user = await requireAnyPermission(request, permissions, getDatabase);

	const userId = user.userId || null;

	try {
		let entity: {
			id: string;
			name?: string | null;
			description?: string | null;
			status?: string;
		} | null = null;

		switch (type) {
			case "transaction": {
				entity = await db.createTransaction({
					amount: "0",
					date: new Date(),
					description: "",
					type: "expense",
					year: new Date().getFullYear(),
					status: "draft",
					createdBy: userId,
				});
				break;
			}

			case "receipt": {
				entity = await db.createReceipt({
					status: "draft",
					createdBy: userId,
				});
				break;
			}

			case "reimbursement": {
				entity = await db.createPurchase({
					amount: "0",
					year: new Date().getFullYear(),
					purchaserName: "",
					bankAccount: "",
					minutesId: "",
					status: "draft",
					createdBy: userId,
				});
				break;
			}

			case "budget": {
				entity = await db.createFundBudget({
					amount: "0",
					name: "",
					year: new Date().getFullYear(),
					status: "draft",
					createdBy: userId,
				});
				break;
			}

			case "inventory": {
				entity = await db.createInventoryItem({
					name: "",
					status: "draft",
				});
				break;
			}

			case "minute": {
				entity = await db.createMinute({
					status: "draft",
					createdBy: userId,
				});
				break;
			}

			case "news": {
				entity = await db.createNews({
					title: "",
					content: "",
					status: "draft",
					createdBy: userId,
				});
				break;
			}

			case "faq": {
				entity = await db.createFaq({
					question: "",
					answer: "",
					status: "draft",
				});
				break;
			}
			case "poll": {
				entity = await db.createPoll({
					name: "",
					year: new Date().getFullYear(),
					externalUrl: "",
					status: "draft",
					createdBy: userId || undefined,
				});
				break;
			}
			case "social": {
				entity = await db.createSocialLink({
					name: "",
					icon: "link",
					url: "",
					color: "bg-blue-500",
					isActive: false,
					status: "draft",
				});
				break;
			}
			case "event": {
				const now = new Date();
				const localEvent = await db.createEvent({
					title: "Uusi tapahtuma / New event",
					description: "#draft",
					isAllDay: true,
					startDate: now,
					status: "draft",
					createdBy: userId,
				});

				try {
					const { createCalendarEvent } = await import("~/lib/google.server");
					const result = await createCalendarEvent({
						title: "Uusi tapahtuma / New event",
						description: "#draft",
						isAllDay: true,
						startDate: now.toISOString().split("T")[0],
						startDateTime: now.toISOString(),
						endDateTime: now.toISOString(),
					});
					if (result) {
						await db.updateEvent(localEvent.id, {
							googleEventId: result.id,
						});
					}
				} catch (error) {
					console.error(
						"[create-draft] Failed to create calendar event:",
						error,
					);
				}

				entity = {
					id: localEvent.id,
					name: localEvent.title,
					status: localEvent.status,
				};
				break;
			}
			case "mail": {
				entity = await db.insertMailDraft({
					toJson: "[]",
					subject: "",
					body: "",
					draftType: "new",
				});
				break;
			}
			case "submission": {
				entity = await db.createSubmission({
					name: "",
					email: "",
					message: "",
					type: "questions",
					status: "Uusi / New",
				});
				break;
			}

			default:
				return data(
					{ success: false, error: `Unknown entity type: ${type}` },
					{ status: 400 },
				);
		}

		if (!entity) {
			return data(
				{ success: false, error: "Failed to create entity" },
				{ status: 500 },
			);
		}

		// Create relationship immediately if source context is provided
		// This links the new draft to the source entity right away
		if (sourceType && sourceId) {
			// Note: Google Calendar IDs are strings, while entity_relationships expects UUIDs.
			// Relationship creation might fail for events if the ID is not a UUID.
			try {
				await db.createEntityRelationship({
					relationAType: sourceType,
					relationId: sourceId,
					relationBType: type,
					relationBId: entity.id,
					createdBy: userId,
				});
			} catch (relError) {
				console.error(
					`[CreateDraft] Failed to link ${type} to ${sourceType}:`,
					relError,
				);
				// Non-fatal, continue with creation
			}
		}

		// Apply source-derived defaults for certain draft types.
		// For transactions created from a relationship picker, pull dominant values
		// (e.g. receipt content) immediately so the new draft is prefilled.
		if (type === "transaction" && sourceType && sourceId) {
			try {
				const contextValues = await getRelationshipContext(
					db as any,
					"transaction",
					entity.id,
				);

				const updates: {
					description?: string;
					amount?: string;
					date?: Date;
					year?: number;
				} = {};

				if (contextValues.description?.trim()) {
					updates.description = contextValues.description.trim();
				}
				if (contextValues.totalAmount !== null) {
					updates.amount = contextValues.totalAmount.toString();
				}
				if (contextValues.date) {
					updates.date = contextValues.date;
					updates.year = contextValues.date.getFullYear();
				}
				if (Object.keys(updates).length > 0) {
					const updatedTransaction = await db.updateTransaction(
						entity.id,
						updates,
					);
					if (updatedTransaction) {
						entity = updatedTransaction;
					}
				}
			} catch (contextError) {
				console.error(
					"[CreateDraft] Failed to apply source context to transaction draft:",
					contextError,
				);
			}
		}

		// Build redirect URL for the new entity's edit page
		const editUrls: Record<RelationshipEntityType, string> = {
			transaction: `/treasury/transactions/${entity.id}/edit`,
			receipt: `/treasury/receipts/${entity.id}/edit`,
			reimbursement: `/treasury/reimbursements/${entity.id}/edit`,
			budget: `/treasury/budgets/${entity.id}/edit`,
			inventory: `/inventory/${entity.id}/edit`,
			minute: `/minutes/${entity.id}/edit`,
			news: `/news/${entity.id}/edit`,
			faq: `/faq/${entity.id}/edit`,
			poll: `/polls/${entity.id}/edit`,
			social: `/social?edit=${entity.id}`,
			event: `/events/${entity.id}/edit`,
			mail: `/mail/drafts/${entity.id}/edit`,
			submission: `/submissions/${entity.id}/edit`,
			message: `/messages`,
		};
		let redirectUrl = editUrls[type] || "/";

		// Append source context and returnUrl as query params for regular form submissions
		if (!isFetcher) {
			const params = new URLSearchParams();
			if (sourceType && sourceId) {
				params.append(
					"source",
					`${sourceType}:${sourceId}${sourceName ? `:${encodeURIComponent(sourceName)}` : ""}`,
				);
			}
			if (returnUrl) {
				params.append("returnUrl", returnUrl);
			}
			if (params.toString()) {
				redirectUrl += `?${params.toString()}`;
			}
			return redirect(redirectUrl);
		}

		// For fetcher requests (RelationshipPicker), return JSON
		return data({
			success: true,
			entity: {
				id: entity.id,
				type,
				name: entity.name || entity.description || `${type} (draft)`,
				status: entity.status || "draft",
			},
			linked: !!(sourceType && sourceId),
		});
	} catch (error) {
		console.error(`[CreateDraft] Failed to create ${type} draft:`, error);
		return data(
			{ success: false, error: "Failed to create draft entity" },
			{ status: 500 },
		);
	}
}
