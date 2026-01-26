import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Form, useActionData, useNavigation } from "react-router";
import { toast } from "sonner";
import { PageWrapper } from "~/components/layout/page-layout";
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
import { useLanguage } from "~/contexts/language-context";
import { getDatabase } from "~/db";
import { requirePermission } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import { SETTINGS_KEYS } from "~/lib/openrouter.server";
import {
	getSystemLanguageDefaults,
	updateSystemLanguageDefaults,
} from "~/lib/settings.server";
import type { Route } from "./+types/settings.general";

export function meta({ data }: Route.MetaArgs) {
	return [
		{
			title: `${data?.siteConfig?.name || "Portal"} - Yleiset Asetukset / General Settings`,
		},
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request }: Route.LoaderArgs) {
	await requirePermission(request, "settings:general", getDatabase);

	const db = getDatabase();
	const [defaults, apiKey] = await Promise.all([
		getSystemLanguageDefaults(),
		db.getSetting(SETTINGS_KEYS.OPENROUTER_API_KEY),
	]);

	return {
		siteConfig: SITE_CONFIG,
		defaults,
		apiKey: apiKey ? "••••••••" : "", // Mask API key
		hasApiKey: !!apiKey,
	};
}

export async function action({ request }: Route.ActionArgs) {
	await requirePermission(request, "settings:general", getDatabase);

	const formData = await request.formData();
	const intent = formData.get("intent") as string;
	const db = getDatabase();

	if (intent === "save-api-key") {
		const apiKey = formData.get("apiKey") as string;
		if (apiKey && apiKey !== "••••••••") {
			await db.setSetting(
				SETTINGS_KEYS.OPENROUTER_API_KEY,
				apiKey,
				"OpenRouter API key",
			);
		}
		return { success: true, message: "API key saved" };
	}

	if (intent === "delete-api-key") {
		await db.deleteSetting(SETTINGS_KEYS.OPENROUTER_API_KEY);
		// Also disable AI parsing features that depend on it
		await db.setSetting(
			SETTINGS_KEYS.AI_PARSING_ENABLED,
			"false",
			"Enable AI-assisted parsing",
		);
		return { success: true, message: "API key deleted" };
	}

	const primary = formData.get("primaryLanguage") as string;
	const secondary = formData.get("secondaryLanguage") as string;

	if (!primary || !secondary) {
		return { success: false, error: "Missing fields" };
	}

	await updateSystemLanguageDefaults(primary, secondary);

	return { success: true };
}

export default function GeneralSettings({ loaderData }: Route.ComponentProps) {
	const { defaults, apiKey: serverApiKey, hasApiKey } = loaderData;
	const { t } = useTranslation();
	const { supportedLanguages, languageNames } = useLanguage();
	const actionData = useActionData<typeof action>();
	const navigation = useNavigation();
	const isSubmitting = navigation.state === "submitting";

	const [apiKey, setApiKey] = useState(serverApiKey);

	useEffect(() => {
		if (actionData?.success) {
			const msg = actionData.message || t("settings.general.saved");
			toast.success(msg);
		} else if (actionData?.error) {
			toast.error(t("settings.general.error"));
		}
	}, [actionData, t]);

	return (
		<PageWrapper>
			<div className="w-full max-w-2xl mx-auto px-4 py-8">
				<div className="mb-8">
					<h1 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white">
						{t("settings.general.title")}
					</h1>
				</div>

				<div className="space-y-6">
					{/* Language Settings */}
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<span className="material-symbols-outlined">language</span>
								{t("settings.general.languages_title")}
							</CardTitle>
							<CardDescription>
								{t("settings.general.languages_desc")}
							</CardDescription>
						</CardHeader>
						<CardContent>
							<Form method="post" className="space-y-4">
								<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
									<div className="space-y-2">
										<Label htmlFor="primaryLanguage">
											{t("settings.general.primary_language")}
										</Label>
										<Select
											name="primaryLanguage"
											defaultValue={defaults.primary}
										>
											<SelectTrigger>
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												{supportedLanguages.map((lang) => (
													<SelectItem key={lang} value={lang}>
														{languageNames[lang] || lang}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>

									<div className="space-y-2">
										<Label htmlFor="secondaryLanguage">
											{t("settings.general.secondary_language")}
										</Label>
										<Select
											name="secondaryLanguage"
											defaultValue={defaults.secondary}
										>
											<SelectTrigger>
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												{supportedLanguages.map((lang) => (
													<SelectItem key={lang} value={lang}>
														{languageNames[lang] || lang}
													</SelectItem>
												))}
												<SelectItem value="none">
													{t("settings.common.none")}
												</SelectItem>
											</SelectContent>
										</Select>
									</div>
								</div>

								<Button type="submit" disabled={isSubmitting}>
									{isSubmitting
										? t("settings.common.saving")
										: t("settings.common.save")}
								</Button>
							</Form>
						</CardContent>
					</Card>

					{/* OpenRouter API Key */}
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<span className="material-symbols-outlined">key</span>
								OpenRouter API Key
							</CardTitle>
							<CardDescription>
								Required for AI features (Parsing, Analytics)
							</CardDescription>
						</CardHeader>
						<CardContent>
							<Form method="post" className="space-y-4">
								<input type="hidden" name="intent" value="save-api-key" />
								<div className="flex gap-2">
									<Input
										name="apiKey"
										type="password"
										value={apiKey}
										onChange={(e) => setApiKey(e.target.value)}
										placeholder="sk-or-v1-..."
										className="font-mono"
									/>
									<Button type="submit" disabled={isSubmitting}>
										{isSubmitting
											? t("settings.common.saving")
											: t("settings.common.save")}
									</Button>
									{hasApiKey && (
										<Form method="post">
											<input
												type="hidden"
												name="intent"
												value="delete-api-key"
											/>
											<Button
												type="submit"
												variant="destructive"
												disabled={isSubmitting}
											>
												{t("settings.common.delete")}
											</Button>
										</Form>
									)}
								</div>
							</Form>
						</CardContent>
					</Card>
				</div>
			</div>
		</PageWrapper>
	);
}
