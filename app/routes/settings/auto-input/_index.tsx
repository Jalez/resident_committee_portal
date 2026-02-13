import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useActionData } from "react-router";
import { toast } from "sonner";
import { PageHeader } from "~/components/layout/page-header";
import { PageWrapper } from "~/components/layout/page-layout";
import { AutoInputAISettings } from "~/components/settings/auto-input-ai-settings";
import { DraftCleanupSettings } from "~/components/settings/draft-cleanup-settings";
import { getDatabase } from "~/db/server";
import { requirePermission } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import { getAvailableModels, SETTINGS_KEYS } from "~/lib/openrouter.server";
import { getSystemLanguageDefaults } from "~/lib/settings.server";
import type { Route } from "./+types/_index";

export function meta({ data }: Route.MetaArgs) {
	return [
		{
			title: `${data?.siteConfig?.name || "Portal"} - Auto Input`,
		},
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request }: Route.LoaderArgs) {
	await requirePermission(
		request,
		"settings:relationship-context",
		getDatabase,
	);
	const db = getDatabase();

	const apiKeySetting = await db.getAppSetting(
		SETTINGS_KEYS.OPENROUTER_API_KEY,
	);
	const apiKey = apiKeySetting?.value || "";

	const modelSetting = await db.getAppSetting("relationship_context_ai_model");
	const currentModel = modelSetting?.value || "anthropic/claude-3.5-sonnet";

	let models: Array<{ id: string; name: string }> = [];
	if (apiKey) {
		try {
			const availableModels = await getAvailableModels(apiKey);
			models = availableModels.map((m) => ({
				id: m.id,
				name: m.name,
			}));
		} catch (error) {
			console.error("Failed to fetch OpenRouter models:", error);
		}
	}

	const systemLanguages = await getSystemLanguageDefaults();
	const siteConfig = SITE_CONFIG;

	return {
		apiKey,
		currentModel,
		models,
		systemLanguages,
		siteConfig,
	};
}

export async function action({ request }: Route.ActionArgs) {
	await requirePermission(
		request,
		"settings:relationship-context",
		getDatabase,
	);
	const db = getDatabase();

	const formData = await request.formData();
	const modelId = formData.get("modelId") as string;

	if (!modelId) {
		return { error: "Model ID is required" };
	}

	try {
		await db.setSetting("relationship_context_ai_model", modelId);
		return { success: true };
	} catch (error) {
		console.error("Failed to save auto-input AI settings:", error);
		return { error: "Failed to save settings" };
	}
}

export default function SettingsAutoInput({
	loaderData,
}: Route.ComponentProps) {
	const { apiKey, currentModel, models, systemLanguages } = loaderData;
	const { t } = useTranslation();
	const actionData = useActionData<{ success?: boolean; error?: string }>();

	useEffect(() => {
		if (!actionData) return;
		if (actionData.error) {
			toast.error(actionData.error);
			return;
		}
		if (actionData.success) {
			toast.success(
				t("settings.save_success", {
					defaultValue: "Settings saved",
				}),
			);
		}
	}, [actionData, t]);

	return (
		<PageWrapper>
			<PageHeader
				title={t("settings.auto_input.title", {
					lng: systemLanguages.primary,
					defaultValue: "Auto Input",
				})}
			/>
			<div className="max-w-2xl space-y-6">
				<AutoInputAISettings
					apiKey={apiKey}
					currentModel={currentModel}
					models={models}
				/>
				<DraftCleanupSettings />
			</div>
		</PageWrapper>
	);
}
