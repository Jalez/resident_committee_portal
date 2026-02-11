import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useActionData } from "react-router";
import { toast } from "sonner";
import { PageHeader } from "~/components/layout/page-header";
import { PageWrapper } from "~/components/layout/page-layout";
import { FaqAiSettings } from "~/components/settings/faq-ai-settings";
import { handleFaqAiSettingsAction } from "~/components/settings/faq-ai-settings.server";
import { getDatabase } from "~/db";
import { requirePermission } from "~/lib/auth.server";
import {
	getAvailableModels,
	type OpenRouterModel,
	SETTINGS_KEYS,
} from "~/lib/openrouter.server";
import { getSystemLanguageDefaults } from "~/lib/settings.server";
import type { Route } from "./+types/_index";

export function meta() {
	return [{ title: "FAQ Settings" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
	await requirePermission(request, "settings:faqs", getDatabase);

	const db = getDatabase();
	const [apiKey, faqModel] = await Promise.all([
		db.getSetting(SETTINGS_KEYS.OPENROUTER_API_KEY),
		db.getSetting(SETTINGS_KEYS.FAQ_AI_MODEL),
	]);

	let models: OpenRouterModel[] = [];
	if (apiKey) {
		models = await getAvailableModels(apiKey);
	}

	const systemLanguages = await getSystemLanguageDefaults();
	return {
		hasApiKey: !!apiKey,
		faqModel: faqModel || "",
		models,
		systemLanguages,
	};
}

export async function action({ request }: Route.ActionArgs) {
	await requirePermission(request, "settings:faqs", getDatabase);

	const formData = await request.formData();
	const intent = formData.get("intent") as string;
	const db = getDatabase();

	if (intent === "save-faq-settings") {
		return await handleFaqAiSettingsAction(db, formData);
	}

	return { error: "Unknown action" };
}

export default function SettingsFaqs({ loaderData }: Route.ComponentProps) {
	const { hasApiKey, faqModel, models, systemLanguages } = loaderData;
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
				title={t("settings.faqs.title", { lng: systemLanguages.primary })}
			/>
			<div className="max-w-2xl space-y-6">
				<FaqAiSettings
					faqModel={faqModel}
					hasApiKey={hasApiKey}
					models={models}
				/>
			</div>
		</PageWrapper>
	);
}
