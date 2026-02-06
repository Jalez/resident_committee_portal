import { updateSystemLanguageDefaults } from "~/lib/settings.server";

export async function handleLanguageSettingsAction(formData: FormData) {
    const primary = formData.get("primaryLanguage") as string;
    const secondary = formData.get("secondaryLanguage") as string;

    if (!primary || !secondary) {
        return { success: false, error: "Missing fields" };
    }

    await updateSystemLanguageDefaults(
        primary,
        secondary === "none" ? "" : secondary,
    );

    return { success: true };
}
