import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Form, useActionData, useNavigation } from "react-router";
import { toast } from "sonner";
import { PageWrapper } from "~/components/layout/page-layout";
import { Badge } from "~/components/ui/badge";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { Switch } from "~/components/ui/switch";
import { getDatabase } from "~/db";
import { requirePermission } from "~/lib/auth.server";
import {
	DEFAULT_APPROVAL_KEYWORDS,
	DEFAULT_REJECTION_KEYWORDS,
	getAvailableModels,
	type OpenRouterModel,
	SETTINGS_KEYS,
} from "~/lib/openrouter.server";
import type { Route } from "./+types/settings.reimbursements";

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
	const [apiKey, aiModel, aiEnabled, customApproval, customRejection] =
		await Promise.all([
			db.getSetting(SETTINGS_KEYS.OPENROUTER_API_KEY),
			db.getSetting(SETTINGS_KEYS.AI_MODEL),
			db.getSetting(SETTINGS_KEYS.AI_PARSING_ENABLED),
			db.getSetting(SETTINGS_KEYS.APPROVAL_KEYWORDS),
			db.getSetting(SETTINGS_KEYS.REJECTION_KEYWORDS),
		]);

	// Fetch available models if API key is set
	let models: OpenRouterModel[] = [];
	if (apiKey) {
		models = await getAvailableModels(apiKey);
	}

	return {
		settings: {
			apiKey: apiKey ? "••••••••" : "", // Mask API key
			hasApiKey: !!apiKey,
			aiModel: aiModel || "",
			aiEnabled: aiEnabled === "true",
			customApproval: customApproval || "",
			customRejection: customRejection || "",
		},
		models,
		defaultKeywords: {
			approval: DEFAULT_APPROVAL_KEYWORDS,
			rejection: DEFAULT_REJECTION_KEYWORDS,
		},
	};
}

export async function action({ request }: Route.ActionArgs) {
	await requirePermission(request, "settings:reimbursements", getDatabase);

	const formData = await request.formData();
	const intent = formData.get("intent") as string;
	const db = getDatabase();

	try {
		if (intent === "save-ai-settings") {
			const aiEnabled = formData.get("aiEnabled") === "true";
			const aiModel = formData.get("aiModel") as string;

			await db.setSetting(
				SETTINGS_KEYS.AI_PARSING_ENABLED,
				aiEnabled ? "true" : "false",
				"Enable AI-assisted parsing",
			);
			if (aiModel) {
				await db.setSetting(
					SETTINGS_KEYS.AI_MODEL,
					aiModel,
					"Selected AI model for parsing",
				);
			}
			return { success: true, message: "AI settings saved" };
		}

		if (intent === "save-keywords") {
			const customApproval = formData.get("customApproval") as string;
			const customRejection = formData.get("customRejection") as string;

			await db.setSetting(
				SETTINGS_KEYS.APPROVAL_KEYWORDS,
				customApproval,
				"Custom approval keywords",
			);
			await db.setSetting(
				SETTINGS_KEYS.REJECTION_KEYWORDS,
				customRejection,
				"Custom rejection keywords",
			);
			return { success: true, message: "Keywords saved" };
		}

		return { error: "Unknown action" };
	} catch (error) {
		console.error("[Settings] Error:", error);
		return { error: "Failed to save settings" };
	}
}

export default function SettingsReimbursements({
	loaderData,
}: Route.ComponentProps) {
	const { settings, models, defaultKeywords } = loaderData;
	const { t } = useTranslation();
	const navigation = useNavigation();
	const actionData = useActionData<typeof action>();
	const isSubmitting = navigation.state === "submitting";

	const [aiEnabled, setAiEnabled] = useState(settings.aiEnabled);
	const [aiModel, setAiModel] = useState(settings.aiModel);
	const [customApproval, setCustomApproval] = useState(settings.customApproval);
	const [customRejection, setCustomRejection] = useState(
		settings.customRejection,
	);
	const [sortBy, setSortBy] = useState<"price" | "name">("price");

	// Sort models
	const sortedModels = [...models].sort((a, b) => {
		if (sortBy === "price") {
			return a.pricing.prompt - b.pricing.prompt;
		}
		return a.name.localeCompare(b.name);
	});

	useEffect(() => {
		if (actionData) {
			if (actionData.error) {
				toast.error(actionData.error, { id: "settings-error" });
			} else if (actionData.message) {
				toast.success(actionData.message, { id: "settings-success" });
			}
		}
	}, [actionData]);

	// Format price for display
	const formatPrice = (price: number) => {
		if (price === 0) return t("settings.common.free");
		if (price < 0.01) return `$${price.toFixed(4)}`;
		return `$${price.toFixed(2)}`;
	};

	return (
		<PageWrapper>
			<div className="w-full max-w-2xl mx-auto px-4 py-8">
				{/* Header */}
				<div className="mb-8">
					<h1 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white">
						{t("settings.reimbursements.title")}
					</h1>
				</div>

				<div className="space-y-6">
					{/* API Key missing warning */}
					{!settings.hasApiKey && (
						<Card className="border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-900/20">
							<CardHeader>
								<CardTitle className="text-yellow-800 dark:text-yellow-200 flex items-center gap-2">
									<span className="material-symbols-outlined">warning</span>
									AI Features Disabled
								</CardTitle>
								<CardDescription className="text-yellow-700 dark:text-yellow-300">
									You need to configure the OpenRouter API Key in General Settings to use AI features.
								</CardDescription>
							</CardHeader>
							<CardContent>
								<Button variant="outline" asChild>
									<a href="/settings/general">Go to General Settings</a>
								</Button>
							</CardContent>
						</Card>
					)}

					{/* AI Model Selection */}
					<Card className={!settings.hasApiKey ? "opacity-50 pointer-events-none" : ""}>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<span className="material-symbols-outlined">smart_toy</span>
								{t("settings.reimbursements.ai_parsing_title")}
							</CardTitle>
							<CardDescription>
								{t("settings.reimbursements.ai_parsing_desc")}
							</CardDescription>
						</CardHeader>
						<CardContent>
							<Form method="post" className="space-y-4">
								<input type="hidden" name="intent" value="save-ai-settings" />
								<input
									type="hidden"
									name="aiEnabled"
									value={aiEnabled ? "true" : "false"}
								/>
								<input type="hidden" name="aiModel" value={aiModel} />

								<div className="flex items-center justify-between">
									<div>
										<Label>{t("settings.reimbursements.enable_ai")}</Label>
										<p className="text-sm text-muted-foreground">
											{t("settings.reimbursements.enable_ai_desc")}
										</p>
									</div>
									<Switch
										checked={aiEnabled}
										onCheckedChange={setAiEnabled}
										disabled={!settings.hasApiKey}
									/>
								</div>

								{settings.hasApiKey && models.length > 0 && (
									<>
										<div className="flex items-center gap-2 mb-2">
											<Label>{t("settings.reimbursements.sort_by")}</Label>
											<Button
												type="button"
												variant={sortBy === "price" ? "default" : "outline"}
												size="sm"
												onClick={() => setSortBy("price")}
											>
												{t("settings.reimbursements.price")}
											</Button>
											<Button
												type="button"
												variant={sortBy === "name" ? "default" : "outline"}
												size="sm"
												onClick={() => setSortBy("name")}
											>
												{t("settings.reimbursements.name")}
											</Button>
										</div>

										<div className="space-y-2">
											<Label>
												{t("settings.reimbursements.ai_model_label")}
											</Label>
											<Select value={aiModel} onValueChange={setAiModel}>
												<SelectTrigger>
													<SelectValue
														placeholder={t(
															"settings.reimbursements.select_model",
														)}
													/>
												</SelectTrigger>
												<SelectContent className="max-h-64">
													{sortedModels.slice(0, 50).map((model) => (
														<SelectItem key={model.id} value={model.id}>
															<div className="flex items-center gap-2">
																<span className="truncate max-w-[200px]">
																	{model.name}
																</span>
																<Badge variant="secondary" className="text-xs">
																	{formatPrice(model.pricing.prompt)}/1M
																</Badge>
															</div>
														</SelectItem>
													))}
												</SelectContent>
											</Select>
											<p className="text-xs text-muted-foreground">
												{t("settings.reimbursements.showing_models", {
													count: Math.min(50, sortedModels.length),
													total: sortedModels.length,
												})}
											</p>
										</div>
									</>
								)}

								<Button
									type="submit"
									disabled={isSubmitting || !settings.hasApiKey}
								>
									{isSubmitting
										? t("settings.common.saving")
										: t("settings.reimbursements.save_ai_settings")}
								</Button>
							</Form>
						</CardContent>
					</Card>

					{/* Custom Keywords */}
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<span className="material-symbols-outlined">checklist</span>
								{t("settings.reimbursements.keywords_title")}
							</CardTitle>
							<CardDescription>
								{t("settings.reimbursements.keywords_desc")}
							</CardDescription>
						</CardHeader>
						<CardContent>
							<Form method="post" className="space-y-4">
								<input type="hidden" name="intent" value="save-keywords" />

								<div className="space-y-2">
									<Label>{t("settings.reimbursements.default_approval")}</Label>
									<div className="flex flex-wrap gap-1">
										{defaultKeywords.approval.map((kw: string) => (
											<Badge
												key={kw}
												variant="outline"
												className="text-green-600 border-green-300"
											>
												{kw}
											</Badge>
										))}
									</div>
								</div>

								<div className="space-y-2">
									<Label htmlFor="customApproval">
										{t("settings.reimbursements.additional_approval")}
									</Label>
									<Input
										id="customApproval"
										name="customApproval"
										value={customApproval}
										onChange={(e) => setCustomApproval(e.target.value)}
										placeholder={t(
											"settings.reimbursements.approval_placeholder",
										)}
									/>
								</div>

								<div className="space-y-2">
									<Label>
										{t("settings.reimbursements.default_rejection")}
									</Label>
									<div className="flex flex-wrap gap-1">
										{defaultKeywords.rejection.map((kw: string) => (
											<Badge
												key={kw}
												variant="outline"
												className="text-red-600 border-red-300"
											>
												{kw}
											</Badge>
										))}
									</div>
								</div>

								<div className="space-y-2">
									<Label htmlFor="customRejection">
										{t("settings.reimbursements.additional_rejection")}
									</Label>
									<Input
										id="customRejection"
										name="customRejection"
										value={customRejection}
										onChange={(e) => setCustomRejection(e.target.value)}
										placeholder={t(
											"settings.reimbursements.rejection_placeholder",
										)}
									/>
								</div>

								<Button type="submit" disabled={isSubmitting}>
									{isSubmitting
										? t("settings.common.saving")
										: t("settings.reimbursements.save_keywords")}
								</Button>
							</Form>
						</CardContent>
					</Card>
				</div>
			</div>
		</PageWrapper>
	);
}
