import { SETTINGS_KEYS } from "~/lib/openrouter.server";
import type { DatabaseAdapter } from "~/db";

export async function handleHiddenQuestionsSettingsAction(
    db: DatabaseAdapter,
    formData: FormData,
) {
    const hiddenQuestionsJson = formData.get("hiddenQuestions") as string;
    await db.setSetting(
        SETTINGS_KEYS.ANALYTICS_HIDDEN_QUESTIONS,
        hiddenQuestionsJson,
        "Questions that are hidden by default in analytics table columns",
    );
    return { success: true, message: "Hidden questions saved" };
}
