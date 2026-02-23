import { type ActionFunctionArgs, data } from "react-router";
import { setDefaultDateLocale } from "~/lib/settings.server";

const VALID_LOCALES = ["fi", "sv", "en-GB", "en-US"];

export async function handleDateLocaleSettingsAction(
    formData: FormData,
) {
    const locale = formData.get("dateLocale") as string;

    if (!locale || !VALID_LOCALES.includes(locale)) {
        return data(
            { error: "Invalid locale" },
            { status: 400 },
        );
    }

    await setDefaultDateLocale(locale);
    return data({ success: true });
}
