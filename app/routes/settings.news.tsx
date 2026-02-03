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
import { Label } from "~/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { getDatabase } from "~/db";
import { requirePermission } from "~/lib/auth.server";
import {
	getAvailableModels,
	type OpenRouterModel,
	SETTINGS_KEYS,
} from "~/lib/openrouter.server";
import type { Route } from "./+types/settings.news";

export function meta() {
	return [
		{ title: "News Settings" },
		{ name: "robots", content: "noindex" },
	];
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

	return {
		hasApiKey: !!apiKey,
		newsModel: newsModel || "",
		models,
	};
}

export async function action({ request }: Route.ActionArgs) {
	await requirePermission(request, "settings:news", getDatabase);

	const formData = await request.formData();
	const intent = formData.get("intent") as string;
	const db = getDatabase();

	if (intent === "save-news-settings") {
		const model = formData.get("newsModel") as string;
		if (model) {
			await db.setSetting(
				SETTINGS_KEYS.NEWS_AI_MODEL,
				model,
				"AI model for news translation",
			);
		}
		return { success: true, message: "News settings saved" };
	}

	return { error: "Unknown action" };
}

export default function SettingsNews({ loaderData }: Route.ComponentProps) {
	const { hasApiKey, newsModel: serverModel, models } = loaderData;
	const { t } = useTranslation();
	const navigation = useNavigation();
	const actionData = useActionData<typeof action>();
	const isSubmitting = navigation.state === "submitting";

	const [model, setModel] = useState(serverModel);
	const [sortBy, setSortBy] = useState<"price" | "name">("price");

	useEffect(() => {
		if (actionData) {
			if (actionData.error) {
				toast.error(actionData.error);
			} else if (actionData.success) {
				toast.success(actionData.message);
			}
		}
	}, [actionData]);

	const sortedModels = [...models].sort((a, b) => {
		if (sortBy === "price") {
			return a.pricing.prompt - b.pricing.prompt;
		}
		return a.name.localeCompare(b.name);
	});

	const formatPrice = (price: number) => {
		if (price === 0) return t("common.fields.free");
		if (price < 0.01) return `$${price.toFixed(4)}`;
		return `$${price.toFixed(2)}`;
	};

	return (
		<PageWrapper>
			<div className="w-full max-w-2xl mx-auto px-4 py-8">
				<div className="mb-8">
					<h1 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white">
						{t("settings.news.title")}
					</h1>
				</div>

				<div className="space-y-6">
					{!hasApiKey && (
						<Card className="border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-900/20">
							<CardHeader>
								<CardTitle className="text-yellow-800 dark:text-yellow-200 flex items-center gap-2">
									<span className="material-symbols-outlined">warning</span>
									{t("settings.news.ai_disabled_title")}
								</CardTitle>
								<CardDescription className="text-yellow-700 dark:text-yellow-300">
									{t("settings.news.ai_disabled_desc")}
								</CardDescription>
							</CardHeader>
							<CardContent>
								<Button variant="outline" asChild>
									<a href="/settings/general">{t("settings.news.go_to_general")}</a>
								</Button>
							</CardContent>
						</Card>
					)}

					<Card className={!hasApiKey ? "opacity-50 pointer-events-none" : ""}>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<span className="material-symbols-outlined">smart_toy</span>
								{t("settings.news.ai_model_title")}
							</CardTitle>
							<CardDescription>
								{t("settings.news.ai_model_desc")}
							</CardDescription>
						</CardHeader>
						<CardContent>
							<Form method="post" className="space-y-4">
								<input type="hidden" name="intent" value="save-news-settings" />
								<input type="hidden" name="newsModel" value={model} />

								{hasApiKey && models.length > 0 && (
									<>
										<div className="flex items-center gap-2 mb-2">
											<Label>{t("common.actions.sort")}</Label>
											<Button
												type="button"
												variant={sortBy === "price" ? "default" : "outline"}
												size="sm"
												onClick={() => setSortBy("price")}
											>
												{t("common.fields.price")}
											</Button>
											<Button
												type="button"
												variant={sortBy === "name" ? "default" : "outline"}
												size="sm"
												onClick={() => setSortBy("name")}
											>
												{t("common.fields.name")}
											</Button>
										</div>

										<div className="space-y-2">
											<Label>{t("settings.news.select_model")}</Label>
											<Select value={model} onValueChange={setModel}>
												<SelectTrigger>
													<SelectValue placeholder={t("settings.news.select_model_placeholder")} />
												</SelectTrigger>
												<SelectContent className="max-h-64">
													{sortedModels.slice(0, 50).map((m) => (
														<SelectItem key={m.id} value={m.id}>
															<div className="flex items-center gap-2">
																<span className="truncate max-w-[200px]">
																	{m.name}
																</span>
																<Badge variant="secondary" className="text-xs">
																	{formatPrice(m.pricing.prompt)}/1M
																</Badge>
															</div>
														</SelectItem>
													))}
												</SelectContent>
											</Select>
											<p className="text-xs text-muted-foreground">
												{t("settings.news.showing_models", {
													count: Math.min(50, sortedModels.length),
													total: sortedModels.length,
												})}
											</p>
										</div>
									</>
								)}

								<Button type="submit" disabled={isSubmitting || !hasApiKey}>
									{isSubmitting
										? t("common.status.saving")
										: t("common.actions.save")}
								</Button>
							</Form>
						</CardContent>
					</Card>
				</div>
			</div>
		</PageWrapper>
	);
}
