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
import {
	getAuthenticatedUser,
	getGuestContext,
	requirePermission,
} from "~/lib/auth.server";
import { getSystemLanguageDefaults } from "~/lib/settings.server";
import { SITE_CONFIG } from "~/lib/config.server";
import { getRelationshipContextFromUrl } from "~/lib/linking/relationship-context";
import { useUser } from "~/contexts/user-context";
import { SETTINGS_KEYS } from "~/lib/openrouter.server";
import { translateFaq } from "~/lib/translate.server";
import type { Route } from "./+types/faq.$faqId.edit";

export function meta({ data }: Route.MetaArgs) {
	return [
		{
			title: `${data?.siteConfig?.name || "Portal"} - ${data?.item?.question ?? "FAQ"}`,
		},
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request, params }: Route.LoaderArgs) {
	await requirePermission(request, "faq:update", getDatabase);
	const db = getDatabase();
	const item = await db.getFaqById(params.faqId);
	if (!item) {
		throw new Response("Not Found", { status: 404 });
	}
	const [systemLanguages, languageNames] = await Promise.all([
		getSystemLanguageDefaults(),
		getLanguageNames(),
	]);
	const primaryLabel = languageNames[systemLanguages.primary] ?? systemLanguages.primary;
	const secondaryLabel = languageNames[systemLanguages.secondary] ?? systemLanguages.secondary;

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
	await requirePermission(request, "faq:update", getDatabase);
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
			db.getSetting(SETTINGS_KEYS.FAQ_AI_MODEL),
		]);
		if (!apiKey || !model) {
			return {
				error: "AI translation not configured. Set API key and model in Settings → FAQ.",
				translationFailed: true,
			};
		}
		const item = await db.getFaqById(params.faqId);
		if (!item) {
			return { error: "FAQ not found", translationFailed: true };
		}
		const [systemLanguages, languageNames] = await Promise.all([
			getSystemLanguageDefaults(),
			getLanguageNames(),
		]);
		const sourceLang = languageNames[systemLanguages.primary] ?? systemLanguages.primary;
		const targetLang = languageNames[systemLanguages.secondary] ?? systemLanguages.secondary;
		try {
			if (direction === "to_secondary") {
				const result = await translateFaq(
					{ question: item.question, answer: item.answer },
					sourceLang,
					targetLang,
					apiKey,
					model,
				);
				return {
					translated: {
						direction: "to_secondary" as const,
						questionSecondary: result.question,
						answerSecondary: result.answer,
					},
				};
			}
			const result = await translateFaq(
				{
					question: item.questionSecondary ?? item.question,
					answer: item.answerSecondary ?? item.answer,
				},
				targetLang,
				sourceLang,
				apiKey,
				model,
			);
			return {
				translated: {
					direction: "to_primary" as const,
					question: result.question,
					answer: result.answer,
				},
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : "Translation failed";
			return { error: message, translationFailed: true };
		}
	}

	// Update logic has been moved to /api/faq/:faqId/update
	return null;
}

export default function FaqEdit({ loaderData }: Route.ComponentProps) {
	const { item, primaryLabel, secondaryLabel, systemLanguages } = loaderData;
	const { t, i18n } = useTranslation();
	const navigate = useNavigate();
	const { hasPermission } = useUser();
	const canUpdate = hasPermission("faq:update");
	const translateFetcher = useFetcher<typeof action>();
	const translated = translateFetcher.data?.translated;
	const [localModel, setLocalModel] = useState<string | null>(null);
	const isTranslating =
		translateFetcher.state === "submitting" || translateFetcher.state === "loading";
	const useSecondary =
		systemLanguages.secondary && i18n.language === systemLanguages.secondary;
	const displayQuestion = useSecondary && item.questionSecondary
		? item.questionSecondary
		: item.question;
	const displayAnswer = useSecondary && item.answerSecondary
		? item.answerSecondary
		: item.answer;

	useEffect(() => {
		if (translateFetcher.data?.error) {
			toast.error(translateFetcher.data.error);
		}
	}, [translateFetcher.data?.error]);

	const primaryDefaults =
		translated?.direction === "to_primary" && translated
			? { question: translated.question, answer: translated.answer }
			: { question: item.question, answer: item.answer };
	const secondaryDefaults =
		translated?.direction === "to_secondary" && translated
			? {
				questionSecondary: translated.questionSecondary,
				answerSecondary: translated.answerSecondary,
			}
			: {
				questionSecondary: item.questionSecondary ?? "",
				answerSecondary: item.answerSecondary ?? "",
			};

	const headerPrimary = canUpdate
		? t("faq.edit_title", { lng: systemLanguages.primary })
		: item.question;
	const headerSecondary = canUpdate
		? t("faq.edit_title", { lng: systemLanguages.secondary ?? systemLanguages.primary })
		: item.questionSecondary ?? item.question;

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
						action={`/api/faq/${item.id}/update`}
						className="space-y-6"
					>
						{/* Hidden fields for returnUrl */}
						{loaderData.returnUrl && <input type="hidden" name="_returnUrl" value={loaderData.returnUrl} />}

						{/* Local Model Selector */}
						<LocalModelSelector onModelChange={setLocalModel} />

						<div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3">
							<span className="text-sm font-medium text-gray-700 dark:text-gray-300">
								{t("faq.translate_with_ai")}
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
									? t("faq.translating")
									: t("faq.translate_primary_to_secondary", {
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
									? t("faq.translating")
									: t("faq.translate_secondary_to_primary", {
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
								{t("faq.form.default_language", { language: primaryLabel })}
							</h2>
							<div className="space-y-2">
								<div className="flex items-center justify-between">
									<Label htmlFor="question">{t("faq.form.question")} *</Label>
									<TranslateFieldButton
										model={localModel}
										sourceInputId="questionSecondary"
										targetInputId="question"
										sourceLanguage={secondaryLabel}
										targetLanguage={primaryLabel}
										direction="reverse"
									/>
								</div>
								<Input
									id="question"
									name="question"
									required
									defaultValue={primaryDefaults.question}
									placeholder={t("faq.form.question_placeholder")}
								/>
							</div>
							<div className="space-y-2">
								<div className="flex items-center justify-between">
									<Label htmlFor="answer">{t("faq.form.answer")} *</Label>
									<TranslateFieldButton
										model={localModel}
										sourceInputId="answerSecondary"
										targetInputId="answer"
										sourceLanguage={secondaryLabel}
										targetLanguage={primaryLabel}
										direction="reverse"
									/>
								</div>
								<Textarea
									id="answer"
									name="answer"
									required
									rows={6}
									defaultValue={primaryDefaults.answer}
									placeholder={t("faq.form.answer_placeholder")}
									className="min-h-[120px]"
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="sortOrder">{t("faq.form.sort_order")}</Label>
								<Input
									id="sortOrder"
									name="sortOrder"
									type="number"
									defaultValue={item.sortOrder}
									placeholder="0"
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
								{t("faq.form.secondary_language", { language: secondaryLabel })}
							</h2>
							<div className="space-y-2">
								<div className="flex items-center justify-between">
									<Label htmlFor="questionSecondary">{t("faq.form.question")}</Label>
									<TranslateFieldButton
										model={localModel}
										sourceInputId="question"
										targetInputId="questionSecondary"
										sourceLanguage={primaryLabel}
										targetLanguage={secondaryLabel}
										direction="forward"
									/>
								</div>
								<Input
									id="questionSecondary"
									name="questionSecondary"
									defaultValue={secondaryDefaults.questionSecondary}
									placeholder={t("faq.form.question_placeholder")}
								/>
							</div>
							<div className="space-y-2">
								<div className="flex items-center justify-between">
									<Label htmlFor="answerSecondary">{t("faq.form.answer")}</Label>
									<TranslateFieldButton
										model={localModel}
										sourceInputId="answer"
										targetInputId="answerSecondary"
										sourceLanguage={primaryLabel}
										targetLanguage={secondaryLabel}
										direction="forward"
									/>
								</div>
								<Textarea
									id="answerSecondary"
									name="answerSecondary"
									rows={6}
									defaultValue={secondaryDefaults.answerSecondary}
									placeholder={t("faq.form.answer_placeholder")}
									className="min-h-[120px]"
								/>
							</div>
						</div>
						<div className="flex gap-4">
							<Button type="submit">{t("faq.save")}</Button>
							<Button
								type="button"
								variant="outline"
								onClick={() => navigate(loaderData.returnUrl || "/faq")}
							>
								{t("faq.cancel")}
							</Button>
						</div>
					</Form>
				</div>
			</SplitLayout>
		</PageWrapper>
	);
}
