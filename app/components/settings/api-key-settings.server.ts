import { SETTINGS_KEYS } from "~/lib/openrouter.server";
import type { DatabaseAdapter } from "~/db";

export async function handleApiKeySettingsAction(
    db: DatabaseAdapter,
    formData: FormData,
) {
    const intent = formData.get("intent") as string;

    if (intent === "save-api-key") {
        const apiKey = formData.get("apiKey") as string;
        if (apiKey && apiKey !== "••••••••") {
            await db.setSetting(
                SETTINGS_KEYS.OPENROUTER_API_KEY,
                apiKey,
                "OpenRouter API key",
            );
        }
        return { success: true, message: "API key saved" };
    }

    if (intent === "delete-api-key") {
        await db.deleteSetting(SETTINGS_KEYS.OPENROUTER_API_KEY);
        // Also disable AI parsing features that depend on it
        await db.setSetting(
            SETTINGS_KEYS.AI_PARSING_ENABLED,
            "false",
            "Enable AI-assisted parsing",
        );
        return { success: true, message: "API key deleted" };
    }

    return { error: "Unknown action" };
}
