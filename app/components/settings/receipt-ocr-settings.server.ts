import {
	type ActionFunctionArgs,
	data,
	type LoaderFunctionArgs,
} from "react-router";
import { getDatabase } from "~/db/server";
import { requirePermission } from "~/lib/auth.server";
import { getAvailableModels, SETTINGS_KEYS } from "~/lib/openrouter.server";

export async function loader({ request }: LoaderFunctionArgs) {
	const db = getDatabase();
	// Check permission
	await requirePermission(request, "settings:receipts", () => db);

	const apiKey = await db.getSetting(SETTINGS_KEYS.OPENROUTER_API_KEY);
	const currentModel = await db.getSetting(SETTINGS_KEYS.RECEIPT_AI_MODEL);

	let models: Awaited<ReturnType<typeof getAvailableModels>> = [];
	if (apiKey) {
		try {
			models = await getAvailableModels(apiKey);
		} catch (error) {
			console.error("Failed to fetch models:", error);
		}
	}

	return {
		apiKey,
		currentModel,
		models,
	};
}

export async function action({ request }: ActionFunctionArgs) {
	const db = getDatabase();
	await requirePermission(request, "settings:receipts", () => db);

	const formData = await request.formData();
	const model = formData.get("receipt_ai_model");

	if (typeof model === "string") {
		await db.setSetting(SETTINGS_KEYS.RECEIPT_AI_MODEL, model);
	}

	return data({ success: true });
}
