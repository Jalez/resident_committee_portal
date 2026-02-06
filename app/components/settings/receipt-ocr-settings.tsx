import { Form, useNavigation } from "react-router";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";

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
                    <div className="space-y-2">
                        <Label htmlFor="receipt_ai_model">
                            {t("settings.ai_model", { defaultValue: "AI Model" })}
                        </Label>
                        <select
                            id="receipt_ai_model"
                            name="receipt_ai_model"
                            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                            defaultValue={currentModel || ""}
                        >
                            <option value="">
                                {t("settings.select_model", {
                                    defaultValue: "Select a model...",
                                })}
                            </option>
                            {models.map((model) => (
                                <option key={model.id} value={model.id}>
                                    {model.name} (${model.pricing.prompt.toFixed(2)}/1M in, $
                                    {model.pricing.completion.toFixed(2)}/1M out)
                                </option>
                            ))}
                        </select>
                        <p className="text-sm text-muted-foreground">
                            {t("settings.receipt_ai_model_help", {
                                defaultValue:
                                    "Select a capable model (e.g. Gemini Flash 1.5, GPT-4o-mini) for best results.",
                            })}
                        </p>
                    </div>

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
