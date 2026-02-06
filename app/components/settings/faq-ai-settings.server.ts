import { SETTINGS_KEYS } from "~/lib/openrouter.server";
import type { DatabaseAdapter } from "~/db";

export async function handleFaqAiSettingsAction(
    db: DatabaseAdapter,
    formData: FormData,
) {
    const model = formData.get("faqModel") as string;
    if (model) {
        await db.setSetting(
            SETTINGS_KEYS.FAQ_AI_MODEL,
            model,
            "AI model for FAQ translation",
        );
    }
    return { success: true, message: "FAQ settings saved" };
}
