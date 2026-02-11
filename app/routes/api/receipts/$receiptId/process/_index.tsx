import type { ActionFunctionArgs } from "react-router";
import { getDatabase } from "~/db";
import type { PurchaseCategorization } from "~/lib/ai/categorize-purchase.server";
import { categorizePurchase } from "~/lib/ai/categorize-purchase.server";
import { requirePermission } from "~/lib/auth.server";

/**
 * API route to process a receipt with OCR data
 * Creates inventory items based on AI categorization
 */
export async function action({ request, params }: ActionFunctionArgs) {
	const { receiptId } = params;

	if (!receiptId) {
		return Response.json({ error: "Receipt ID is required" }, { status: 400 });
	}

	// Check permissions - user must have receipt processing permission or be the creator
	const user = await requirePermission(
		request,
		"treasury:receipts:process",
		getDatabase,
	);

	const db = getDatabase();

	try {
		// Get the receipt
		const receipt = await db.getReceiptById(receiptId);
		if (!receipt) {
			return Response.json({ error: "Receipt not found" }, { status: 404 });
		}

		// Check if user is the creator (self-permission)
		if (receipt.createdBy !== user.userId) {
			// If not creator, ensure they have the permission
			await requirePermission(
				request,
				"treasury:receipts:process",
				getDatabase,
			);
		}

		// Get OCR content
		const receiptContent = await db.getReceiptContentByReceiptId(receiptId);
		if (!receiptContent) {
			return Response.json(
				{ error: "No OCR data available for this receipt" },
				{ status: 400 },
			);
		}

		// Check if already processed
		if (receiptContent.processed) {
			return Response.json(
				{
					error: "Receipt has already been processed",
					inventoryItemIds: receiptContent.inventoryItemIds
						? JSON.parse(receiptContent.inventoryItemIds)
						: [],
				},
				{ status: 400 },
			);
		}

		// Parse items from OCR data
		if (!receiptContent.items) {
			return Response.json(
				{ error: "No items found in OCR data" },
				{ status: 400 },
			);
		}

		const items = JSON.parse(receiptContent.items) as Array<{
			name: string;
			quantity?: number;
			unitPrice?: number;
			totalPrice?: number;
		}>;

		if (items.length === 0) {
			return Response.json({ error: "No items to process" }, { status: 400 });
		}

		// Process each item with AI categorization
		const createdInventoryIds: string[] = [];
		const categorizations: (PurchaseCategorization & { itemName: string })[] =
			[];

		for (const item of items) {
			try {
				const categorization = await categorizePurchase(
					item.name,
					receiptContent.storeName || undefined,
					item.totalPrice,
				);

				categorizations.push({
					...categorization,
					itemName: item.name,
				});

				// Only create inventory items for items categorized as inventory
				if (categorization.isInventory) {
					const inventoryItem = await db.createInventoryItem({
						name: item.name,
						quantity: item.quantity || 1,
						location: categorization.suggestedLocation || null,
						needsCompletion: !categorization.suggestedLocation,
						completionNotes: `Auto-created from receipt: ${receipt.name || "Unnamed receipt"}. ${categorization.reasoning}`,
						value: item.totalPrice ? String(item.totalPrice) : "0",
						purchasedAt: receiptContent.purchaseDate || new Date(),
						category: categorization.category,
					});
					createdInventoryIds.push(inventoryItem.id);
				}
			} catch (error) {
				console.error(`Error processing item ${item.name}:`, error);
				// Continue processing other items even if one fails
			}
		}

		// Update receipt content with processing metadata
		await db.updateReceiptContent(receiptContent.id, {
			processed: true,
			processedAt: new Date(),
			inventoryItemIds:
				createdInventoryIds.length > 0
					? JSON.stringify(createdInventoryIds)
					: null,
		});

		return Response.json({
			success: true,
			inventoryItemIds: createdInventoryIds,
			categorizations,
			message: `Successfully processed ${items.length} items. Created ${createdInventoryIds.length} inventory items.`,
		});
	} catch (error) {
		console.error("Error processing receipt:", error);
		return Response.json(
			{
				error: "Failed to process receipt",
				details: error instanceof Error ? error.message : "Unknown error",
			},
			{ status: 500 },
		);
	}
}
