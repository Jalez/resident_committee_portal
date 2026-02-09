import type { NewInventoryItem } from "~/db/schema";
import { getDatabase } from "~/db";

export async function handleCreateItem(formData: FormData) {
	const db = getDatabase();
	const name = formData.get("name") as string;
	const quantity = parseInt(formData.get("quantity") as string, 10) || 1;
	const location = formData.get("location") as string;
	const category = (formData.get("category") as string) || null;
	const description = (formData.get("description") as string) || null;
	const value = (formData.get("value") as string) || "0";

	const newItem: NewInventoryItem = {
		name,
		quantity,
		location,
		category,
		description,
		value,
		showInInfoReel: false,
	};

	const item = await db.createInventoryItem(newItem);
	return {
		success: true,
		item,
		message: "Inventory item created successfully",
	};
}

export async function handleUpdateField(formData: FormData) {
	const db = getDatabase();
	const itemId = formData.get("itemId") as string;
	const field = formData.get("field") as string;
	const value = formData.get("value") as string;

	if (!itemId || !field) {
		return { success: false, error: "Missing itemId or field" };
	}

	const allowedFields = [
		"name",
		"quantity",
		"location",
		"category",
		"description",
		"value",
	];
	if (!allowedFields.includes(field)) {
		return { success: false, error: "Invalid field" };
	}

	let parsedValue: string | number = value;
	if (field === "quantity") {
		parsedValue = parseInt(value, 10) || 1;
	}

	await db.updateInventoryItem(itemId, { [field]: parsedValue });
	return { success: true };
}