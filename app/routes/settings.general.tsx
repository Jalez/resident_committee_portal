import { useTranslation } from "react-i18next";
import { PageWrapper, SplitLayout } from "~/components/layout/page-layout";
import { useLanguage } from "~/contexts/language-context";
import { getDatabase } from "~/db";
import { requirePermission } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import { SETTINGS_KEYS } from "~/lib/openrouter.server";
import { getSystemLanguageDefaults } from "~/lib/settings.server";
import type { Route } from "./+types/settings.general";
import {
	LanguageSettings,
} from "~/components/settings/language-settings";
import {
	handleLanguageSettingsAction,
} from "~/components/settings/language-settings.server";
import {
	ApiKeySettings,
} from "~/components/settings/api-key-settings";
import {
	handleApiKeySettingsAction,
} from "~/components/settings/api-key-settings.server";

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
	const [defaults, apiKey] = await Promise.all([
		getSystemLanguageDefaults(),
		db.getSetting(SETTINGS_KEYS.OPENROUTER_API_KEY),
	]);

	return {
		siteConfig: SITE_CONFIG,
		defaults,
		apiKey: apiKey ? "••••••••" : "", // Mask API key
		hasApiKey: !!apiKey,
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
	const { defaults, apiKey, hasApiKey } = loaderData;
	const { t } = useTranslation();
	const { supportedLanguages, languageNames } = useLanguage();

	return (
		<PageWrapper>
			<SplitLayout
				header={{
					primary: t("settings.general.title", { lng: defaults.primary }),
					secondary: t("settings.general.title", {
						lng: defaults.secondary ?? defaults.primary,
					}),
				}}
			>
				<div className="max-w-2xl space-y-6">
					<LanguageSettings
						defaults={defaults}
						supportedLanguages={supportedLanguages}
						languageNames={languageNames}
					/>
					<ApiKeySettings apiKey={apiKey} hasApiKey={hasApiKey} />
				</div>
			</SplitLayout>
		</PageWrapper>
	);
}
