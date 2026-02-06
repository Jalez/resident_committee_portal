import { useTranslation } from "react-i18next";
import { PageWrapper } from "~/components/layout/page-layout";
import { getDatabase } from "~/db";
import { requirePermission } from "~/lib/auth.server";
import {
    getAvailableModels,
    type OpenRouterModel,
    SETTINGS_KEYS,
} from "~/lib/openrouter.server";
import type { Route } from "./+types/settings.analytics";
import {
    AiTextAnalyzerSettings,
} from "~/components/settings/ai-text-analyzer-settings";
import {
    handleAiTextAnalyzerAction,
} from "~/components/settings/ai-text-analyzer-settings.server";
import {
    HiddenQuestionsSettings,
} from "~/components/settings/hidden-questions-settings";
import {
    handleHiddenQuestionsSettingsAction,
} from "~/components/settings/hidden-questions-settings.server";
import { PageHeader } from "~/components/layout/page-header";

export function meta() {
    return [
        { title: "Analytics Settings" },
        { name: "robots", content: "noindex" },
    ];
}

export async function loader({ request }: Route.LoaderArgs) {
    await requirePermission(request, "settings:analytics", getDatabase);

    const db = getDatabase();
    const [apiKey, analyticsModel, hiddenQuestionsJson] = await Promise.all([
        db.getSetting(SETTINGS_KEYS.OPENROUTER_API_KEY),
        db.getSetting(SETTINGS_KEYS.ANALYTICS_AI_MODEL),
        db.getSetting(SETTINGS_KEYS.ANALYTICS_HIDDEN_QUESTIONS),
    ]);

    let models: OpenRouterModel[] = [];
    if (apiKey) {
        models = await getAvailableModels(apiKey);
    }

    // Parse hidden questions from JSON
    let hiddenQuestions: string[] = [];
    if (hiddenQuestionsJson) {
        try {
            hiddenQuestions = JSON.parse(hiddenQuestionsJson);
        } catch {
            // Invalid JSON, ignore
        }
    }

    return {
        settings: {
            hasApiKey: !!apiKey,
            analyticsModel: analyticsModel || "",
            hiddenQuestions,
        },
        models,
    };
}

export async function action({ request }: Route.ActionArgs) {
    await requirePermission(request, "settings:analytics", getDatabase);

    const formData = await request.formData();
    const intent = formData.get("intent") as string;
    const db = getDatabase();

    if (intent === "save-analytics-settings") {
        return await handleAiTextAnalyzerAction(db, formData);
    }

    if (intent === "save-hidden-questions") {
        return await handleHiddenQuestionsSettingsAction(db, formData);
    }

    return { error: "Unknown action" };
}

export default function SettingsAnalytics({
    loaderData,
}: Route.ComponentProps) {
    const { settings, models } = loaderData;
    const { t } = useTranslation();

    return (
        <PageWrapper>
            <PageHeader title={t("settings.analytics.title")} />

            <div className="max-w-2xl space-y-6">
                <AiTextAnalyzerSettings settings={settings} models={models} />
                <HiddenQuestionsSettings settings={settings} />
            </div>
        </PageWrapper>
    );
}
