import type { DatabaseAdapter } from "~/db";
import { SETTINGS_KEYS } from "~/lib/openrouter.server";

export async function handleAiParsingSettingsAction(
	db: DatabaseAdapter,
	formData: FormData,
) {
	const intent = formData.get("intent") as string;

	if (intent === "save-ai-settings") {
		const enabled = formData.get("aiEnabled") === "on";
		const model = formData.get("aiModel") as string;

		await db.setSetting(
			SETTINGS_KEYS.AI_PARSING_ENABLED,
			enabled ? "true" : "false",
			"Enable AI-assisted parsing",
		);

		if (model) {
			await db.setSetting(
				SETTINGS_KEYS.AI_MODEL,
				model,
				"AI model for parsing",
			);
		}

		return { success: true, message: "AI settings saved" };
	}

	return { error: "Unknown action" };
}
