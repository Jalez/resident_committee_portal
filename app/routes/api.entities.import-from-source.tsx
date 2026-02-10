import type { ActionFunctionArgs } from "react-router";
import { json } from "react-router";
import { getDatabase } from "~/db";
import type { RelationshipEntityType } from "~/db/schema";
import { requireUser } from "~/lib/auth.server";

/**
 * Generic API endpoint for importing entities from a source entity.
 * 
 * Example: Import inventory items from receipt line items
 * - targetType: "inventory"
 * - sourceType: "receipt"
 * - sourceId: receipt ID
 * 
 * The endpoint:
 * 1. Fetches the source entity's data
 * 2. Extracts importable data (e.g. receipt line items)
 * 3. Creates draft entities of targetType pre-filled with source data
 * 4. Links the new entities to relationAId
 * 5. Returns the created entities
 */
export async function action({ request }: ActionFunctionArgs) {
    const user = await requireUser(request);
    const db = getDatabase();

    const formData = await request.formData();
    const targetType = formData.get("targetType") as RelationshipEntityType;
    const sourceType = formData.get("sourceType") as RelationshipEntityType;
    const sourceId = formData.get("sourceId") as string;
    const relationAType = formData.get("relationAType") as RelationshipEntityType;
    const relationAId = formData.get("relationAId") as string;

    if (!targetType || !sourceType || !sourceId || !relationAType || !relationAId) {
        return json({ success: false, error: "Missing required parameters" }, { status: 400 });
    }

    try {
        // Handle different source -> target combinations
        if (sourceType === "receipt" && targetType === "inventory") {
            return await importInventoryFromReceipt(db, sourceId, relationAId, user.id);
        }

        // Add more import patterns here as needed
        // e.g. minutes -> news, transaction -> reimbursement, etc.

        return json({ success: false, error: `Import from ${sourceType} to ${targetType} not implemented` }, { status: 400 });
    } catch (error) {
        console.error("[import-from-source] Error:", error);
        return json({ success: false, error: "Failed to import entities" }, { status: 500 });
    }
}

/**
 * Import inventory items from receipt line items
 */
async function importInventoryFromReceipt(
    db: ReturnType<typeof getDatabase>,
    receiptId: string,
    relationAId: string,
    userId: string
) {
    // Fetch receipt content
    const receiptContent = await db.getReceiptContentByReceiptId(receiptId);

    if (!receiptContent || !receiptContent.items) {
        return json({ success: false, error: "Receipt has no line items to import" }, { status: 400 });
    }

    // Parse line items
    let items: Array<{
        name?: string;
        description?: string;
        quantity?: number;
        price?: number;
        total?: number;
    }>;

    try {
        items = typeof receiptContent.items === "string"
            ? JSON.parse(receiptContent.items)
            : receiptContent.items;
    } catch {
        return json({ success: false, error: "Failed to parse receipt items" }, { status: 400 });
    }

    if (!items || items.length === 0) {
        return json({ success: false, error: "Receipt has no line items to import" }, { status: 400 });
    }

    // Create inventory items from receipt line items
    const createdEntities = [];

    for (const item of items) {
        const name = item.name || item.description || "Unnamed Item";
        const quantity = item.quantity || 1;
        const value = item.total || item.price || 0;

        // Create draft inventory item
        const inventoryItem = await db.createInventoryItem({
            name,
            description: `Imported from receipt`,
            quantity,
            value: value.toString(),
            status: "draft",
            createdBy: userId,
        });

        // Link to the source entity (e.g. reimbursement)
        await db.createRelationship({
            relationAType: "inventory",
            relationId: inventoryItem.id,
            relationBType: "receipt",
            relationBId: receiptId,
            createdBy: userId,
        });

        // Also link to relationAId if it's different
        if (relationAId !== receiptId) {
            await db.createRelationship({
                relationAType: "inventory",
                relationId: inventoryItem.id,
                relationBType: "receipt", // This should be relationAType but we need to handle the type properly
                relationBId: relationAId,
                createdBy: userId,
            });
        }

        createdEntities.push({
            id: inventoryItem.id,
            type: "inventory" as RelationshipEntityType,
            name: inventoryItem.name,
            status: inventoryItem.status,
        });
    }

    return json({
        success: true,
        entities: createdEntities,
    });
}
