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
import { getSystemLanguageDefaults } from "~/lib/settings.server";
import { SITE_CONFIG } from "~/lib/config.server";
import { SETTINGS_KEYS } from "~/lib/openrouter.server";
import { translateFaq } from "~/lib/translate.server";
import type { Route } from "./+types/faq.new";

export function meta({ data }: Route.MetaArgs) {
	return [
		{
			title: `${data?.siteConfig?.name || "Portal"} - ${data?.faqNewTitle ?? "New FAQ"}`,
		},
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request }: Route.LoaderArgs) {
	await requirePermission(request, "faq:write", getDatabase);
	const [systemLanguages, languageNames] = await Promise.all([
		getSystemLanguageDefaults(),
		getLanguageNames(),
	]);
	const primaryLabel = languageNames[systemLanguages.primary] ?? systemLanguages.primary;
	const secondaryLabel = languageNames[systemLanguages.secondary] ?? systemLanguages.secondary;
	return {
		siteConfig: SITE_CONFIG,
		faqNewTitle: "New FAQ",
		systemLanguages,
		primaryLabel,
		secondaryLabel,
	};
}

export async function action({ request }: Route.ActionArgs) {
	await requirePermission(request, "faq:write", getDatabase);
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
		const [systemLanguages, languageNames] = await Promise.all([
			getSystemLanguageDefaults(),
			getLanguageNames(),
		]);
		const sourceLang = languageNames[systemLanguages.primary] ?? systemLanguages.primary;
		const targetLang = languageNames[systemLanguages.secondary] ?? systemLanguages.secondary;
		try {
			if (direction === "to_secondary") {
				const question = (formData.get("question") as string)?.trim() ?? "";
				const answer = (formData.get("answer") as string)?.trim() ?? "";
				if (!question || !answer) {
					return {
						error: "Fill in question and answer (primary language) first.",
						translationFailed: true,
					};
				}
				const result = await translateFaq(
					{ question, answer },
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
			const questionSecondary = (formData.get("questionSecondary") as string)?.trim() ?? "";
			const answerSecondary = (formData.get("answerSecondary") as string)?.trim() ?? "";
			if (!questionSecondary || !answerSecondary) {
				return {
					error: "Fill in question and answer (secondary language) first.",
					translationFailed: true,
				};
			}
			const result = await translateFaq(
				{ question: questionSecondary, answer: answerSecondary },
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

	const question = (formData.get("question") as string)?.trim();
	const answer = (formData.get("answer") as string)?.trim();
	const questionSecondary = (formData.get("questionSecondary") as string)?.trim() || null;
	const answerSecondary = (formData.get("answerSecondary") as string)?.trim() || null;
	const sortOrder = parseInt((formData.get("sortOrder") as string) || "0", 10);
	if (!question || !answer) {
		return { error: "Question and answer are required (default language)" };
	}
	await db.createFaq({
		question,
		answer,
		questionSecondary,
		answerSecondary,
		sortOrder,
	});
	return redirect("/faq");
}

type FaqTranslatedData =
	| { direction: "to_secondary"; questionSecondary: string; answerSecondary: string }
	| { direction: "to_primary"; question: string; answer: string };

export default function FaqNew({ loaderData }: Route.ComponentProps) {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const { primaryLabel, secondaryLabel, systemLanguages } = loaderData;
	const translateFetcher = useFetcher<typeof action>();
	const [translated, setTranslated] = useState<FaqTranslatedData | null>(null);
	const [localModel, setLocalModel] = useState<string | null>(null);
	const isTranslating =
		translateFetcher.state === "submitting" || translateFetcher.state === "loading";

	useEffect(() => {
		if (translateFetcher.data?.translated) {
			setTranslated(translateFetcher.data.translated as FaqTranslatedData);
		}
	}, [translateFetcher.data?.translated]);

	useEffect(() => {
		if (translateFetcher.data?.error) {
			toast.error(translateFetcher.data.error);
		}
	}, [translateFetcher.data?.error]);

	const primaryDefaults =
		translated?.direction === "to_primary" && translated
			? { question: translated.question, answer: translated.answer }
			: { question: "", answer: "" };
	const secondaryDefaults =
		translated?.direction === "to_secondary" && translated
			? {
					questionSecondary: translated.questionSecondary,
					answerSecondary: translated.answerSecondary,
				}
			: { questionSecondary: "", answerSecondary: "" };

	const handleTranslate = (direction: "to_secondary" | "to_primary") => {
		const form = document.getElementById("faq-new-form");
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
					primary: t("faq.new_title", { lng: systemLanguages.primary }),
					secondary: t("faq.new_title", { lng: systemLanguages.secondary ?? systemLanguages.primary }),
				}}
			>
				<div className="max-w-2xl">
				<Form id="faq-new-form" method="post" className="space-y-6">
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
							onClick={() => handleTranslate("to_secondary")}
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
							onClick={() => handleTranslate("to_primary")}
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
								defaultValue={0}
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
							onClick={() => navigate("/faq")}
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
