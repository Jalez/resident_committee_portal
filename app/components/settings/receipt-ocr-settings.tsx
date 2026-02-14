import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Form, useNavigation } from "react-router";
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

interface OpenRouterModel {
	id: string;
	name: string;
	pricing: {
		prompt: number;
		completion: number;
	};
	context_length: number;
}

interface ReceiptOCRSettingsProps {
	apiKey: string | null;
	currentModel: string | null;
	models: OpenRouterModel[];
}

export function ReceiptOCRSettings({
	apiKey,
	currentModel,
	models,
}: ReceiptOCRSettingsProps) {
	const { t } = useTranslation();
	const navigation = useNavigation();
	const isSaving = navigation.state === "submitting";

	const [model, setModel] = useState(currentModel || "");
	const [sortBy, setSortBy] = useState<"price" | "name">("price");

	const sortedModels = [...models].sort((a, b) => {
		if (sortBy === "price") {
			return a.pricing.prompt - b.pricing.prompt;
		}
		return a.name.localeCompare(b.name);
	});

	const formatPrice = (price: number) => {
		if (price === 0) return t("common.fields.free", "Free");
		if (price < 0.01) return `$${price.toFixed(4)}`;
		return `$${price.toFixed(2)}`;
	};

	if (!apiKey) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>
						{t("settings.receipt_ocr_title", {
							defaultValue: "Receipt OCR",
						})}
					</CardTitle>
					<CardDescription>
						{t("settings.receipt_ocr_description", {
							defaultValue:
								"Configure AI settings for automatic receipt parsing.",
						})}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800 dark:border-yellow-900 dark:bg-yellow-900/20 dark:text-yellow-200">
						{t("settings.receipt_ocr_requires_api_key", {
							defaultValue:
								"OCR AI parsing requires an OpenRouter API Key to be configured in General Settings.",
						})}
					</div>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>
					{t("settings.receipt_ocr_title", {
						defaultValue: "Receipt OCR & AI Parsing",
					})}
				</CardTitle>
				<CardDescription>
					{t("settings.receipt_ocr_description", {
						defaultValue:
							"Configure the AI model used to parse receipt data from OCR text.",
					})}
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Form method="post" className="space-y-4">
					<input type="hidden" name="receipt_ai_model" value={model} />

					{models.length > 0 && (
						<>
							<div className="flex items-center gap-2 mb-2">
								<Label>{t("common.actions.sort", "Sort by")}</Label>
								<Button
									type="button"
									variant={sortBy === "price" ? "default" : "outline"}
									size="sm"
									onClick={() => setSortBy("price")}
								>
									{t("common.fields.price", "Price")}
								</Button>
								<Button
									type="button"
									variant={sortBy === "name" ? "default" : "outline"}
									size="sm"
									onClick={() => setSortBy("name")}
								>
									{t("common.fields.name", "Name")}
								</Button>
							</div>

							<div className="space-y-2">
								<Label htmlFor="receipt_ai_model">
									{t("settings.ai_model", { defaultValue: "AI Model" })}
								</Label>
								<Select value={model} onValueChange={setModel}>
									<SelectTrigger id="receipt_ai_model">
										<SelectValue
											placeholder={t("settings.select_model", {
												defaultValue: "Select a model...",
											})}
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
									{t("settings.receipt_ai_model_help", {
										defaultValue:
											"Select a capable model (e.g. Gemini Flash 1.5, GPT-4o-mini) for best results.",
									})}
								</p>
								<p className="text-xs text-muted-foreground">
									{t("settings.showing_models", {
										count: Math.min(50, sortedModels.length),
										total: sortedModels.length,
										defaultValue: `Showing top ${Math.min(50, sortedModels.length)} models`,
									})}
								</p>
							</div>
						</>
					)}

					<div className="flex justify-end">
						<Button type="submit" disabled={isSaving}>
							{isSaving ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									{t("common.status.saving", {
										defaultValue: "Saving...",
									})}
								</>
							) : (
								t("common.actions.save", {
									defaultValue: "Save",
								})
							)}
						</Button>
					</div>
				</Form>
			</CardContent>
		</Card>
	);
}
