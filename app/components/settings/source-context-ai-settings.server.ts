import { redirect } from "react-router";
import { getDatabase } from "~/db";
import { requirePermission } from "~/lib/auth.server";
import { getAvailableModels, SETTINGS_KEYS } from "~/lib/openrouter.server";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";

export async function loader({ request }: LoaderFunctionArgs) {
	await requirePermission(request, "settings:relationship-context", getDatabase);
	const db = getDatabase();

	// Get OpenRouter API key
	const apiKeySetting = await db.getAppSetting(SETTINGS_KEYS.OPENROUTER_API_KEY);
	const apiKey = apiKeySetting?.value || "";

	// Get current model setting
	const modelSetting = await db.getAppSetting("relationship_context_ai_model");
	const currentModel = modelSetting?.value || "anthropic/claude-3.5-sonnet";

	// Fetch available models if API key exists
	let models: Array<{ id: string; name: string }> = [];
	if (apiKey) {
		try {
			const availableModels = await getAvailableModels(apiKey);
			models = availableModels.map((m) => ({
				id: m.id,
				name: m.name,
			}));
		} catch (error) {
			console.error("Failed to fetch OpenRouter models:", error);
		}
	}

	return {
		apiKey,
		currentModel,
		models,
	};
}

export async function action({ request }: ActionFunctionArgs) {
	await requirePermission(request, "settings:relationship-context", getDatabase);
	const db = getDatabase();

	const formData = await request.formData();
	const modelId = formData.get("modelId") as string;

	if (!modelId) {
		return { error: "Model ID is required" };
	}

	try {
		// Save or update the model setting
		await db.setSetting("relationship_context_ai_model", modelId);

		return { success: true };
	} catch (error) {
		console.error("Failed to save source context AI settings:", error);
		return { error: "Failed to save settings" };
	}
}
