import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Form, useFetcher, useNavigate } from "react-router";
import { toast } from "sonner";
import { PageWrapper, SplitLayout } from "~/components/layout/page-layout";
import { LocalModelSelector } from "~/components/local-model-selector";
import { TranslateFieldButton } from "~/components/translate-field-button";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { useUser } from "~/contexts/user-context";
import { getDatabase } from "~/db";
import { requirePermission } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import { getLanguageNames } from "~/lib/language-names.server";
import { getRelationshipContextFromUrl } from "~/lib/linking/relationship-context";
import { SETTINGS_KEYS } from "~/lib/openrouter.server";
import { getSystemLanguageDefaults } from "~/lib/settings.server";
import { translateNews } from "~/lib/translate.server";
import type { Route } from "./+types/_index";

export function meta({ data }: Route.MetaArgs) {
	return [
		{
			title: `${data?.siteConfig?.name || "Portal"} - ${data?.item?.title ?? "News"}`,
		},
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request, params }: Route.LoaderArgs) {
	await requirePermission(request, "news:update", getDatabase);
	const db = getDatabase();
	const item = await db.getNewsById(params.newsId);
	if (!item) {
		throw new Response("Not Found", { status: 404 });
	}
	const [systemLanguages, languageNames] = await Promise.all([
		getSystemLanguageDefaults(),
		getLanguageNames(),
	]);
	const primaryLabel =
		languageNames[systemLanguages.primary] ?? systemLanguages.primary;
	const secondaryLabel =
		languageNames[systemLanguages.secondary] ?? systemLanguages.secondary;

	// Get source context and returnUrl from URL
	const url = new URL(request.url);
	const sourceContext = getRelationshipContextFromUrl(url);
	const returnUrl = url.searchParams.get("returnUrl");

	return {
		siteConfig: SITE_CONFIG,
		item,
		systemLanguages,
		primaryLabel,
		secondaryLabel,
		sourceContext,
		returnUrl,
	};
}

export async function action({ request, params }: Route.ActionArgs) {
	await requirePermission(request, "news:update", getDatabase);
	const db = getDatabase();
	const formData = await request.formData();
	const actionType = formData.get("_action") as string;

	if (actionType === "translate") {
		const direction = formData.get("direction") as
			| "to_secondary"
			| "to_primary";
		if (direction !== "to_secondary" && direction !== "to_primary") {
			return { error: "Invalid direction", translationFailed: true };
		}
		const [apiKey, model] = await Promise.all([
			db.getSetting(SETTINGS_KEYS.OPENROUTER_API_KEY),
			db.getSetting(SETTINGS_KEYS.NEWS_AI_MODEL),
		]);
		if (!apiKey || !model) {
			return {
				error:
					"AI translation not configured. Set API key and model in Settings → News.",
				translationFailed: true,
			};
		}
		const item = await db.getNewsById(params.newsId);
		if (!item) {
			return { error: "News not found", translationFailed: true };
		}
		const [systemLanguages, languageNames] = await Promise.all([
			getSystemLanguageDefaults(),
			getLanguageNames(),
		]);
		const sourceLang =
			languageNames[systemLanguages.primary] ?? systemLanguages.primary;
		const targetLang =
			languageNames[systemLanguages.secondary] ?? systemLanguages.secondary;
		try {
			if (direction === "to_secondary") {
				const result = await translateNews(
					{
						title: item.title,
						summary: item.summary,
						content: item.content,
					},
					sourceLang,
					targetLang,
					apiKey,
					model,
				);
				return {
					translated: {
						direction: "to_secondary" as const,
						titleSecondary: result.title,
						summarySecondary: result.summary,
						contentSecondary: result.content,
					},
				};
			}
			const result = await translateNews(
				{
					title: item.titleSecondary ?? item.title,
					summary: item.summarySecondary ?? item.summary,
					content: item.contentSecondary ?? item.content,
				},
				targetLang,
				sourceLang,
				apiKey,
				model,
			);
			return {
				translated: {
					direction: "to_primary" as const,
					title: result.title,
					summary: result.summary,
					content: result.content,
				},
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : "Translation failed";
			return { error: message, translationFailed: true };
		}
	}

	// Update logic has been moved to /api/news/:newsId/update
	return null;
}

export default function NewsEdit({ loaderData }: Route.ComponentProps) {
	const { item, primaryLabel, secondaryLabel, systemLanguages } = loaderData;
	const { t, i18n } = useTranslation();
	const navigate = useNavigate();
	const { hasPermission } = useUser();
	const canUpdate = hasPermission("news:update");
	const translateFetcher = useFetcher<typeof action>();
	const translated = translateFetcher.data?.translated;
	const isTranslating =
		translateFetcher.state === "submitting" ||
		translateFetcher.state === "loading";
	const [localModel, setLocalModel] = useState<string | null>(null);

	useEffect(() => {
		if (translateFetcher.data?.error) {
			toast.error(translateFetcher.data.error);
		}
	}, [translateFetcher.data?.error]);

	const primaryDefaults =
		translated?.direction === "to_primary" && translated
			? {
					title: translated.title,
					summary: translated.summary ?? "",
					content: translated.content,
				}
			: {
					title: item.title,
					summary: item.summary ?? "",
					content: item.content,
				};
	const secondaryDefaults =
		translated?.direction === "to_secondary" && translated
			? {
					titleSecondary: translated.titleSecondary,
					summarySecondary: translated.summarySecondary ?? "",
					contentSecondary: translated.contentSecondary,
				}
			: {
					titleSecondary: item.titleSecondary ?? "",
					summarySecondary: item.summarySecondary ?? "",
					contentSecondary: item.contentSecondary ?? "",
				};

	const headerPrimary = canUpdate
		? t("news.edit_title", { lng: systemLanguages.primary })
		: item.title;
	const headerSecondary = canUpdate
		? t("news.edit_title", {
				lng: systemLanguages.secondary ?? systemLanguages.primary,
			})
		: (item.titleSecondary ?? item.title);

	return (
		<PageWrapper>
			<SplitLayout
				header={{
					primary: headerPrimary,
					secondary: headerSecondary,
				}}
			>
				<div className="max-w-2xl">
					<Form
						method="post"
						action={`/api/news/${item.id}/update`}
						className="space-y-6"
					>
						{/* Hidden fields for returnUrl */}
						{loaderData.returnUrl && (
							<input
								type="hidden"
								name="_returnUrl"
								value={loaderData.returnUrl}
							/>
						)}

						{/* Local Model Selector */}
						<LocalModelSelector onModelChange={setLocalModel} />

						<div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3">
							<span className="text-sm font-medium text-gray-700 dark:text-gray-300">
								{t("news.translate_with_ai")}
							</span>
							<Button
								type="button"
								variant="outline"
								size="sm"
								disabled={isTranslating}
								onClick={() =>
									translateFetcher.submit(
										{ _action: "translate", direction: "to_secondary" },
										{ method: "post" },
									)
								}
							>
								{isTranslating
									? t("news.translating")
									: t("news.translate_primary_to_secondary", {
											primary: primaryLabel,
											secondary: secondaryLabel,
										})}
							</Button>
							<Button
								type="button"
								variant="outline"
								size="sm"
								disabled={isTranslating}
								onClick={() =>
									translateFetcher.submit(
										{ _action: "translate", direction: "to_primary" },
										{ method: "post" },
									)
								}
							>
								{isTranslating
									? t("news.translating")
									: t("news.translate_secondary_to_primary", {
											primary: primaryLabel,
											secondary: secondaryLabel,
										})}
							</Button>
						</div>
						<div
							key={
								translated?.direction === "to_primary"
									? "primary-translated"
									: "primary"
							}
							className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 space-y-6"
						>
							<h2 className="text-lg font-semibold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2">
								{t("news.form.default_language", { language: primaryLabel })}
							</h2>
							<div className="space-y-2">
								<div className="flex items-center justify-between">
									<Label htmlFor="title">{t("news.form.title")} *</Label>
									<TranslateFieldButton
										model={localModel}
										sourceInputId="titleSecondary"
										targetInputId="title"
										sourceLanguage={secondaryLabel}
										targetLanguage={primaryLabel}
										direction="reverse"
									/>
								</div>
								<Input
									id="title"
									name="title"
									required
									defaultValue={primaryDefaults.title}
									placeholder={t("news.form.title_placeholder")}
								/>
							</div>
							<div className="space-y-2">
								<div className="flex items-center justify-between">
									<Label htmlFor="summary">{t("news.form.summary")}</Label>
									<TranslateFieldButton
										model={localModel}
										sourceInputId="summarySecondary"
										targetInputId="summary"
										sourceLanguage={secondaryLabel}
										targetLanguage={primaryLabel}
										direction="reverse"
									/>
								</div>
								<Input
									id="summary"
									name="summary"
									defaultValue={primaryDefaults.summary}
									placeholder={t("news.form.summary_placeholder")}
								/>
							</div>
							<div className="space-y-2">
								<div className="flex items-center justify-between">
									<Label htmlFor="content">{t("news.form.content")} *</Label>
									<TranslateFieldButton
										model={localModel}
										sourceInputId="contentSecondary"
										targetInputId="content"
										sourceLanguage={secondaryLabel}
										targetLanguage={primaryLabel}
										direction="reverse"
									/>
								</div>
								<Textarea
									id="content"
									name="content"
									required
									rows={10}
									defaultValue={primaryDefaults.content}
									placeholder={t("news.form.content_placeholder")}
									className="min-h-[200px]"
								/>
							</div>
						</div>
						<div
							key={
								translated?.direction === "to_secondary"
									? "secondary-translated"
									: "secondary"
							}
							className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 space-y-6"
						>
							<h2 className="text-lg font-semibold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2">
								{t("news.form.secondary_language", {
									language: secondaryLabel,
								})}
							</h2>
							<div className="space-y-2">
								<div className="flex items-center justify-between">
									<Label htmlFor="titleSecondary">{t("news.form.title")}</Label>
									<TranslateFieldButton
										model={localModel}
										sourceInputId="title"
										targetInputId="titleSecondary"
										sourceLanguage={primaryLabel}
										targetLanguage={secondaryLabel}
										direction="forward"
									/>
								</div>
								<Input
									id="titleSecondary"
									name="titleSecondary"
									defaultValue={secondaryDefaults.titleSecondary}
									placeholder={t("news.form.title_placeholder")}
								/>
							</div>
							<div className="space-y-2">
								<div className="flex items-center justify-between">
									<Label htmlFor="summarySecondary">
										{t("news.form.summary")}
									</Label>
									<TranslateFieldButton
										model={localModel}
										sourceInputId="summary"
										targetInputId="summarySecondary"
										sourceLanguage={primaryLabel}
										targetLanguage={secondaryLabel}
										direction="forward"
									/>
								</div>
								<Input
									id="summarySecondary"
									name="summarySecondary"
									defaultValue={secondaryDefaults.summarySecondary}
									placeholder={t("news.form.summary_placeholder")}
								/>
							</div>
							<div className="space-y-2">
								<div className="flex items-center justify-between">
									<Label htmlFor="contentSecondary">
										{t("news.form.content")}
									</Label>
									<TranslateFieldButton
										model={localModel}
										sourceInputId="content"
										targetInputId="contentSecondary"
										sourceLanguage={primaryLabel}
										targetLanguage={secondaryLabel}
										direction="forward"
									/>
								</div>
								<Textarea
									id="contentSecondary"
									name="contentSecondary"
									rows={10}
									defaultValue={secondaryDefaults.contentSecondary}
									placeholder={t("news.form.content_placeholder")}
									className="min-h-[200px]"
								/>
							</div>
						</div>
						<div className="flex gap-4">
							<Button type="submit">{t("news.save")}</Button>
							<Button
								type="button"
								variant="outline"
								onClick={() => navigate(loaderData.returnUrl || "/news")}
							>
								{t("news.cancel")}
							</Button>
						</div>
					</Form>
				</div>
			</SplitLayout>
		</PageWrapper>
	);
}
