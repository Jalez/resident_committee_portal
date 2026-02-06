import { SETTINGS_KEYS } from "~/lib/openrouter.server";
import type { DatabaseAdapter } from "~/db";

export async function handleAiTextAnalyzerAction(
    db: DatabaseAdapter,
    formData: FormData,
) {
    const model = formData.get("analyticsModel") as string;
    if (model) {
        await db.setSetting(
            SETTINGS_KEYS.ANALYTICS_AI_MODEL,
            model,
            "AI model for analytics word counting",
        );
    }
    return { success: true, message: "Analytics settings saved" };
}
