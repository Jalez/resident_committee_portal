import { useTranslation } from "react-i18next";
import { SettingsPageLayout } from "~/components/layout/settings-page-layout";
import { ApiKeySettings } from "~/components/settings/api-key-settings";
import { handleApiKeySettingsAction } from "~/components/settings/api-key-settings.server";
import { LanguageSettings } from "~/components/settings/language-settings";
import { handleLanguageSettingsAction } from "~/components/settings/language-settings.server";
import { ThemeSettings } from "~/components/settings/theme-settings";
import { useLanguage } from "~/contexts/language-context";
import { getDatabase } from "~/db/server.server";
import { requirePermission } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import { SETTINGS_KEYS } from "~/lib/openrouter.server";
import {
	getSystemLanguageDefaults,
	getThemePrimaryColor,
} from "~/lib/settings.server";
import type { Route } from "./+types/_index";

export function meta({ data }: Route.MetaArgs) {
	return [
		{
			title: `${data?.siteConfig?.name || "Portal"} - Yleiset Asetukset / General Settings`,
		},
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request }: Route.LoaderArgs) {
	await requirePermission(request, "settings:general", getDatabase);

	const db = getDatabase();
	const [defaults, apiKey, themePrimary] = await Promise.all([
		getSystemLanguageDefaults(),
		db.getSetting(SETTINGS_KEYS.OPENROUTER_API_KEY),
		getThemePrimaryColor(),
	]);

	return {
		siteConfig: SITE_CONFIG,
		defaults,
		apiKey: apiKey ? "••••••••" : "", // Mask API key
		hasApiKey: !!apiKey,
		themePrimary,
	};
}

export async function action({ request }: Route.ActionArgs) {
	await requirePermission(request, "settings:general", getDatabase);

	const formData = await request.formData();
	const intent = formData.get("intent") as string;
	const db = getDatabase();

	if (intent === "save-api-key" || intent === "delete-api-key") {
		return await handleApiKeySettingsAction(db, formData);
	}

	return await handleLanguageSettingsAction(formData);
}

export default function GeneralSettings({ loaderData }: Route.ComponentProps) {
	const { defaults, apiKey, hasApiKey, themePrimary } = loaderData;
	const { t } = useTranslation();
	const { supportedLanguages, languageNames } = useLanguage();

	return (
		<SettingsPageLayout
			title={t("settings.general.title", { lng: defaults.primary })}
		>
			<LanguageSettings
				defaults={defaults}
				supportedLanguages={supportedLanguages}
				languageNames={languageNames}
			/>
			<ApiKeySettings apiKey={apiKey} hasApiKey={hasApiKey} />
			<ThemeSettings currentPrimary={themePrimary} />
		</SettingsPageLayout>
	);
}
