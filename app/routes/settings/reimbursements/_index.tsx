import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { PageHeader, PageWrapper } from "~/components/layout/page-layout";
import { AiParsingSettings } from "~/components/settings/ai-parsing-settings";
import { handleAiParsingSettingsAction } from "~/components/settings/ai-parsing-settings.server";
import { KeywordSettings } from "~/components/settings/keyword-settings";
import { handleKeywordSettingsAction } from "~/components/settings/keyword-settings.server";
import { Button } from "~/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { getDatabase } from "~/db/server.server";
import { requirePermission } from "~/lib/auth.server";
import {
	DEFAULT_APPROVAL_KEYWORDS,
	DEFAULT_REJECTION_KEYWORDS,
	getAvailableModels,
	type OpenRouterModel,
	SETTINGS_KEYS,
} from "~/lib/openrouter.server";
import { getSystemLanguageDefaults } from "~/lib/settings.server";
import type { Route } from "./+types/_index";

export function meta() {
	return [
		{ title: "Korvausasetukset / Reimbursement Settings" },
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request }: Route.LoaderArgs) {
	await requirePermission(request, "settings:reimbursements", getDatabase);

	const db = getDatabase();

	// Get all settings
	const [
		apiKey,
		aiModel,
		aiEnabled,
		customApproval,
		customRejection,
		recipientEmail,
	] = await Promise.all([
		db.getSetting(SETTINGS_KEYS.OPENROUTER_API_KEY),
		db.getSetting(SETTINGS_KEYS.AI_MODEL),
		db.getSetting(SETTINGS_KEYS.AI_PARSING_ENABLED),
		db.getSetting(SETTINGS_KEYS.APPROVAL_KEYWORDS),
		db.getSetting(SETTINGS_KEYS.REJECTION_KEYWORDS),
		db.getSetting(SETTINGS_KEYS.REIMBURSEMENT_RECIPIENT_EMAIL),
	]);

	// Fetch available models if API key is set
	let models: OpenRouterModel[] = [];
	if (apiKey) {
		models = await getAvailableModels(apiKey);
	}

	const systemLanguages = await getSystemLanguageDefaults();
	return {
		systemLanguages,
		settings: {
			apiKey: apiKey ? "••••••••" : "", // Mask API key
			hasApiKey: !!apiKey,
			aiModel: aiModel || "",
			aiEnabled: aiEnabled === "true",
			customApproval: customApproval || "",
			customRejection: customRejection || "",
			recipientEmail: recipientEmail || "",
		},
		models,
		defaultKeywords: {
			approval: DEFAULT_APPROVAL_KEYWORDS,
			rejection: DEFAULT_REJECTION_KEYWORDS,
		},
		recipientEmailFallback: process.env.RECIPIENT_EMAIL || "",
	};
}

export async function action({ request }: Route.ActionArgs) {
	try {
		await requirePermission(request, "settings:reimbursements", getDatabase);
	} catch (_error) {
		throw new Response("Not Found", { status: 404 });
	}

	const db = getDatabase();
	const formData = await request.formData();
	const intent = formData.get("intent") as string;

	if (intent === "save-ai-settings") {
		return handleAiParsingSettingsAction(db, formData);
	}

	if (
		intent === "save-approval-keywords" ||
		intent === "save-rejection-keywords"
	) {
		return handleKeywordSettingsAction(db, formData);
	}

	if (intent === "save-recipient-email") {
		const recipientEmail =
			(formData.get("recipientEmail") as string | null)?.trim() || "";
		if (!recipientEmail) {
			await db.deleteSetting(SETTINGS_KEYS.REIMBURSEMENT_RECIPIENT_EMAIL);
			return { success: true, message: "Recipient email cleared" };
		}
		await db.setSetting(
			SETTINGS_KEYS.REIMBURSEMENT_RECIPIENT_EMAIL,
			recipientEmail,
			"Recipient email for reimbursement requests",
		);
		return { success: true, message: "Recipient email saved" };
	}

	return { error: "Unknown action" };
}
export default function SettingsReimbursements({
	loaderData,
}: Route.ComponentProps) {
	const { settings, models, defaultKeywords, recipientEmailFallback } =
		loaderData;
	const { t } = useTranslation();
	const recipientEmailFetcher = useFetcher();

	useEffect(() => {
		const data = recipientEmailFetcher.data;
		if (!data) return;
		if ("error" in data) {
			toast.error(String(data.error));
			return;
		}
		if ("message" in data) {
			toast.success(String(data.message));
		}
	}, [recipientEmailFetcher.data]);

	return (
		<PageWrapper>
			<PageHeader
				primary={t("settings.reimbursements.title")}
				secondary={t("settings.reimbursements.description")}
			/>

			<div className="max-w-2xl space-y-6">
				<Card>
					<CardHeader>
						<CardTitle>
							{t("settings.reimbursements.recipient_email_title")}
						</CardTitle>
						<CardDescription>
							{t("settings.reimbursements.recipient_email_desc")}
						</CardDescription>
					</CardHeader>
					<CardContent>
						<recipientEmailFetcher.Form method="post" className="space-y-4">
							<input type="hidden" name="intent" value="save-recipient-email" />
							<div className="space-y-2">
								<Label htmlFor="recipientEmail">
									{t("settings.reimbursements.recipient_email_label")}
								</Label>
								<Input
									id="recipientEmail"
									name="recipientEmail"
									type="email"
									defaultValue={settings.recipientEmail}
									placeholder={
										recipientEmailFallback ||
										t("settings.reimbursements.recipient_email_placeholder")
									}
								/>
								{recipientEmailFallback && !settings.recipientEmail && (
									<p className="text-xs text-muted-foreground">
										{t("settings.reimbursements.recipient_email_fallback", {
											email: recipientEmailFallback,
										})}
									</p>
								)}
							</div>
							<Button
								type="submit"
								disabled={recipientEmailFetcher.state !== "idle"}
							>
								{recipientEmailFetcher.state === "idle"
									? t("common.actions.save")
									: t("common.status.saving")}
							</Button>
						</recipientEmailFetcher.Form>
					</CardContent>
				</Card>
				<AiParsingSettings settings={settings} models={models} />
				<KeywordSettings
					settings={{
						approvalKeywords: settings.customApproval,
						rejectionKeywords: settings.customRejection,
					}}
					defaultKeywords={defaultKeywords}
				/>
			</div>
		</PageWrapper>
	);
}
