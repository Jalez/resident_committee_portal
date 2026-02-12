import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useActionData } from "react-router";
import { toast } from "sonner";
import { PageHeader } from "~/components/layout/page-header";
import { PageWrapper } from "~/components/layout/page-layout";
import { NewsAiSettings } from "~/components/settings/news-ai-settings";
import { handleNewsAiSettingsAction } from "~/components/settings/news-ai-settings.server";
import { getDatabase } from "~/db/server";
import { requirePermission } from "~/lib/auth.server";
import {
	getAvailableModels,
	type OpenRouterModel,
	SETTINGS_KEYS,
} from "~/lib/openrouter.server";
import { getSystemLanguageDefaults } from "~/lib/settings.server";
import type { Route } from "./+types/_index";

export function meta() {
	return [{ title: "News Settings" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
	await requirePermission(request, "settings:news", getDatabase);

	const db = getDatabase();
	const [apiKey, newsModel] = await Promise.all([
		db.getSetting(SETTINGS_KEYS.OPENROUTER_API_KEY),
		db.getSetting(SETTINGS_KEYS.NEWS_AI_MODEL),
	]);

	let models: OpenRouterModel[] = [];
	if (apiKey) {
		models = await getAvailableModels(apiKey);
	}

	const systemLanguages = await getSystemLanguageDefaults();
	return {
		hasApiKey: !!apiKey,
		newsModel: newsModel || "",
		models,
		systemLanguages,
	};
}

export async function action({ request }: Route.ActionArgs) {
	await requirePermission(request, "settings:news", getDatabase);

	const formData = await request.formData();
	const intent = formData.get("intent") as string;
	const db = getDatabase();

	if (intent === "save-news-settings") {
		return await handleNewsAiSettingsAction(db, formData);
	}

	return { error: "Unknown action" };
}

export default function SettingsNews({ loaderData }: Route.ComponentProps) {
	const { hasApiKey, newsModel, models, systemLanguages } = loaderData;
	const { t } = useTranslation();
	const actionData = useActionData<typeof action>();

	useEffect(() => {
		if (actionData) {
			if ("error" in actionData) {
				toast.error(actionData.error);
			} else if ("success" in actionData && actionData.success) {
				toast.success(actionData.message);
			}
		}
	}, [actionData]);

	return (
		<PageWrapper>
			<PageHeader
				title={t("settings.news.title", { lng: systemLanguages.primary })}
			/>
			<NewsAiSettings
				newsModel={newsModel}
				hasApiKey={hasApiKey}
				models={models}
			/>
		</PageWrapper>
	);
}
