import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Form, useNavigation } from "react-router";
import { MissingApiKeyWarning } from "~/components/missing-api-key-warning";
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
import type { OpenRouterModel } from "~/lib/openrouter.server";

interface FaqAiSettingsProps {
	faqModel: string;
	hasApiKey: boolean;
	models: OpenRouterModel[];
}

export function FaqAiSettings({
	faqModel,
	hasApiKey,
	models,
}: FaqAiSettingsProps) {
	const { t } = useTranslation();
	const navigation = useNavigation();
	const isSubmitting = navigation.state === "submitting";

	const [model, setModel] = useState(faqModel);
	const [sortBy, setSortBy] = useState<"price" | "name">("price");

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

	if (!hasApiKey) {
		return <MissingApiKeyWarning />;
	}

	return (
		<Card className={!hasApiKey ? "opacity-50 pointer-events-none" : ""}>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<span className="material-symbols-outlined">smart_toy</span>
					{t("settings.faqs.ai_model_title")}
				</CardTitle>
				<CardDescription>{t("settings.faqs.ai_model_desc")}</CardDescription>
			</CardHeader>
			<CardContent>
				<Form method="post" className="space-y-4">
					<input type="hidden" name="intent" value="save-faq-settings" />
					<input type="hidden" name="faqModel" value={model} />

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
								<Label>{t("settings.faqs.select_model")}</Label>
								<Select value={model} onValueChange={setModel}>
									<SelectTrigger>
										<SelectValue
											placeholder={t("settings.faqs.select_model_placeholder")}
										/>
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
									{t("settings.faqs.showing_models", {
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
	);
}
