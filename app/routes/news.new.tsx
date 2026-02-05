import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Form, redirect, useNavigate, useFetcher } from "react-router";
import { toast } from "sonner";
import { LocalModelSelector } from "~/components/local-model-selector";
import { PageWrapper, SplitLayout } from "~/components/layout/page-layout";
import { TranslateFieldButton } from "~/components/translate-field-button";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { getDatabase } from "~/db";
import { getLanguageNames } from "~/lib/language-names.server";
import { requirePermission } from "~/lib/auth.server";
import { createNewsPublishedNotifications } from "~/lib/notifications.server";
import { getSystemLanguageDefaults } from "~/lib/settings.server";
import { SITE_CONFIG } from "~/lib/config.server";
import { SETTINGS_KEYS } from "~/lib/openrouter.server";
import { translateNews } from "~/lib/translate.server";
import type { Route } from "./+types/news.new";

export function meta({ data }: Route.MetaArgs) {
	return [
		{
			title: `${data?.siteConfig?.name || "Portal"} - ${data?.newsNewTitle ?? "New news"}`,
		},
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request }: Route.LoaderArgs) {
	await requirePermission(request, "news:write", getDatabase);
	const [systemLanguages, languageNames] = await Promise.all([
		getSystemLanguageDefaults(),
		getLanguageNames(),
	]);
	const primaryLabel = languageNames[systemLanguages.primary] ?? systemLanguages.primary;
	const secondaryLabel = languageNames[systemLanguages.secondary] ?? systemLanguages.secondary;
	return {
		siteConfig: SITE_CONFIG,
		newsNewTitle: "New news",
		systemLanguages,
		primaryLabel,
		secondaryLabel,
	};
}

export async function action({ request }: Route.ActionArgs) {
	const user = await requirePermission(request, "news:write", getDatabase);
	const db = getDatabase();
	const formData = await request.formData();
	const actionType = formData.get("_action") as string;

	if (actionType === "translate") {
		const direction = formData.get("direction") as "to_secondary" | "to_primary";
		if (direction !== "to_secondary" && direction !== "to_primary") {
			return { error: "Invalid direction", translationFailed: true };
		}
		const [apiKey, model] = await Promise.all([
			db.getSetting(SETTINGS_KEYS.OPENROUTER_API_KEY),
			db.getSetting(SETTINGS_KEYS.NEWS_AI_MODEL),
		]);
		if (!apiKey || !model) {
			return {
				error: "AI translation not configured. Set API key and model in Settings → News.",
				translationFailed: true,
			};
		}
		const [systemLanguages, languageNames] = await Promise.all([
			getSystemLanguageDefaults(),
			getLanguageNames(),
		]);
		const sourceLang = languageNames[systemLanguages.primary] ?? systemLanguages.primary;
		const targetLang = languageNames[systemLanguages.secondary] ?? systemLanguages.secondary;
		try {
			if (direction === "to_secondary") {
				const title = (formData.get("title") as string)?.trim() ?? "";
				const summary = (formData.get("summary") as string)?.trim() || null;
				const content = (formData.get("content") as string)?.trim() ?? "";
				if (!title || !content) {
					return {
						error: "Fill in title and content (primary language) first.",
						translationFailed: true,
					};
				}
				const result = await translateNews(
					{ title, summary, content },
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
			const titleSecondary = (formData.get("titleSecondary") as string)?.trim() ?? "";
			const summarySecondary = (formData.get("summarySecondary") as string)?.trim() || null;
			const contentSecondary = (formData.get("contentSecondary") as string)?.trim() ?? "";
			if (!titleSecondary || !contentSecondary) {
				return {
					error: "Fill in title and content (secondary language) first.",
					translationFailed: true,
				};
			}
			const result = await translateNews(
				{
					title: titleSecondary,
					summary: summarySecondary,
					content: contentSecondary,
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

	const title = (formData.get("title") as string)?.trim();
	const summary = (formData.get("summary") as string)?.trim() || null;
	const content = (formData.get("content") as string)?.trim();
	const titleSecondary = (formData.get("titleSecondary") as string)?.trim() || null;
	const summarySecondary = (formData.get("summarySecondary") as string)?.trim() || null;
	const contentSecondary = (formData.get("contentSecondary") as string)?.trim() || null;
	if (!title || !content) {
		return { error: "Title and content are required (default language)" };
	}
	const news = await db.createNews({
		title,
		summary,
		content,
		titleSecondary,
		summarySecondary,
		contentSecondary,
		createdBy: user.userId,
	});
	await createNewsPublishedNotifications(news, db);
	return redirect("/news");
}

export default function NewsNew({ loaderData }: Route.ComponentProps) {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const { primaryLabel, secondaryLabel, systemLanguages } = loaderData;
	type TranslatedData =
		| { direction: "to_secondary"; titleSecondary: string; summarySecondary: string | null; contentSecondary: string }
		| { direction: "to_primary"; title: string; summary: string | null; content: string };
	const translateFetcher = useFetcher<typeof action>();
	const [translated, setTranslated] = useState<TranslatedData | null>(null);
	const [localModel, setLocalModel] = useState<string | null>(null);
	const isTranslating =
		translateFetcher.state === "submitting" || translateFetcher.state === "loading";

	useEffect(() => {
		if (translateFetcher.data?.translated) {
			setTranslated(translateFetcher.data.translated as TranslatedData);
		}
	}, [translateFetcher.data?.translated]);

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
			: { title: "", summary: "", content: "" };
	const secondaryDefaults =
		translated?.direction === "to_secondary" && translated
			? {
					titleSecondary: translated.titleSecondary,
					summarySecondary: translated.summarySecondary ?? "",
					contentSecondary: translated.contentSecondary,
				}
			: { titleSecondary: "", summarySecondary: "", contentSecondary: "" };

	const handleTranslate = (direction: "to_secondary" | "to_primary") => {
		const form = document.getElementById("news-new-form");
		if (!form || !(form instanceof HTMLFormElement)) return;
		const formData = new FormData(form);
		formData.set("_action", "translate");
		formData.set("direction", direction);
		translateFetcher.submit(formData, { method: "post" });
	};

	return (
		<PageWrapper>
			<SplitLayout
				header={{
					primary: t("news.new_title", { lng: systemLanguages.primary }),
					secondary: t("news.new_title", { lng: systemLanguages.secondary ?? systemLanguages.primary }),
				}}
				footer={
					<Button
						variant="ghost"
						size="icon"
						onClick={() => navigate("/news")}
						className="h-10 w-10"
					>
						<span className="material-symbols-outlined">arrow_back</span>
					</Button>
				}
			>
				<div className="max-w-2xl">
				<Form id="news-new-form" method="post" className="space-y-6">
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
							onClick={() => handleTranslate("to_secondary")}
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
							onClick={() => handleTranslate("to_primary")}
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
						key={translated?.direction === "to_primary" ? "primary-translated" : "primary"}
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
							{t("news.form.secondary_language", { language: secondaryLabel })}
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
								<Label htmlFor="summarySecondary">{t("news.form.summary")}</Label>
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
								<Label htmlFor="contentSecondary">{t("news.form.content")}</Label>
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
							onClick={() => navigate("/news")}
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
