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
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
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
    getAnalyticsSheets,
    getSheetData,
} from "~/lib/google.server";
import {
    getAvailableModels,
    type OpenRouterModel,
    SETTINGS_KEYS,
} from "~/lib/openrouter.server";
import type { Route } from "./+types/settings.analytics";

export function meta() {
    return [
        { title: "Analytics Settings" },
        { name: "robots", content: "noindex" },
    ];
}

export async function loader({ request }: Route.LoaderArgs) {
    await requirePermission(request, "settings:analytics", getDatabase);

    const db = getDatabase();
    const [apiKey, analyticsModel, hiddenQuestionsJson] = await Promise.all([
        db.getSetting(SETTINGS_KEYS.OPENROUTER_API_KEY),
        db.getSetting(SETTINGS_KEYS.ANALYTICS_AI_MODEL),
        db.getSetting(SETTINGS_KEYS.ANALYTICS_HIDDEN_QUESTIONS),
    ]);

    let models: OpenRouterModel[] = [];
    if (apiKey) {
        models = await getAvailableModels(apiKey);
    }

    // Parse hidden questions from JSON
    let hiddenQuestions: string[] = [];
    if (hiddenQuestionsJson) {
        try {
            hiddenQuestions = JSON.parse(hiddenQuestionsJson);
        } catch {
            // Invalid JSON, ignore
        }
    }

    // Fetch all sheets and their headers to build unique questions list
    const sheets = await getAnalyticsSheets();
    const allQuestions = new Set<string>();

    // Fetch headers from each sheet (uses caching, so this is efficient)
    await Promise.all(
        sheets.map(async (sheet) => {
            const sheetData = await getSheetData(sheet.id);
            if (sheetData?.headers) {
                for (const header of sheetData.headers) {
                    if (header.trim()) {
                        allQuestions.add(header);
                    }
                }
            }
        }),
    );

    return {
        apiKey: apiKey ? "••••••••" : "",
        hasApiKey: !!apiKey,
        analyticsModel: analyticsModel || "",
        models,
        hiddenQuestions,
        allQuestions: Array.from(allQuestions).sort(),
    };
}

export async function action({ request }: Route.ActionArgs) {
    await requirePermission(request, "settings:analytics", getDatabase);

    const formData = await request.formData();
    const intent = formData.get("intent") as string;
    const db = getDatabase();

    if (intent === "save-analytics-settings") {
        const model = formData.get("analyticsModel") as string;
        if (model) {
            await db.setSetting(
                SETTINGS_KEYS.ANALYTICS_AI_MODEL,
                model,
                "AI model for analytics word counting",
            );
        }
        return { success: true, message: "Analytics settings saved" };
    }

    if (intent === "save-hidden-questions") {
        const hiddenQuestionsJson = formData.get("hiddenQuestions") as string;
        await db.setSetting(
            SETTINGS_KEYS.ANALYTICS_HIDDEN_QUESTIONS,
            hiddenQuestionsJson,
            "Questions that are hidden by default in analytics table columns",
        );
        return { success: true, message: "Hidden questions saved" };
    }

    return { error: "Unknown action" };
}

export default function SettingsAnalytics({ loaderData }: Route.ComponentProps) {
    const { hasApiKey, analyticsModel: serverModel, models, hiddenQuestions: serverHiddenQuestions, allQuestions } = loaderData;
    const { t } = useTranslation();
    const navigation = useNavigation();
    const actionData = useActionData<typeof action>();
    const isSubmitting = navigation.state === "submitting";

    const [model, setModel] = useState(serverModel);
    const [sortBy, setSortBy] = useState<"price" | "name">("price");
    const [hiddenQuestions, setHiddenQuestions] = useState<Set<string>>(new Set(serverHiddenQuestions));
    const [questionFilter, setQuestionFilter] = useState("");

    useEffect(() => {
        if (actionData) {
            if (actionData.error) {
                toast.error(actionData.error);
            } else if (actionData.success) {
                toast.success(actionData.message);
            }
        }
    }, [actionData]);

    // Sort models
    const sortedModels = [...models].sort((a, b) => {
        if (sortBy === "price") {
            return a.pricing.prompt - b.pricing.prompt;
        }
        return a.name.localeCompare(b.name);
    });

    const formatPrice = (price: number) => {
        if (price === 0) return "Free";
        if (price < 0.01) return `$${price.toFixed(4)}`;
        return `$${price.toFixed(2)}`;
    };

    return (
        <PageWrapper>
            <div className="w-full max-w-2xl mx-auto px-4 py-8">
                <div className="mb-8">
                    <h1 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white">
                        Analytics Settings
                    </h1>
                </div>

                <div className="space-y-6">
                    {!hasApiKey && (
                        <Card className="border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-900/20">
                            <CardHeader>
                                <CardTitle className="text-yellow-800 dark:text-yellow-200 flex items-center gap-2">
                                    <span className="material-symbols-outlined">warning</span>
                                    AI Features Disabled
                                </CardTitle>
                                <CardDescription className="text-yellow-700 dark:text-yellow-300">
                                    Please configure the OpenRouter API Key in General Settings first.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Button variant="outline" asChild>
                                    <a href="/settings/general">Go to General Settings</a>
                                </Button>
                            </CardContent>
                        </Card>
                    )}

                    <Card className={!hasApiKey ? "opacity-50 pointer-events-none" : ""}>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <span className="material-symbols-outlined">bar_chart</span>
                                AI Analysis Model
                            </CardTitle>
                            <CardDescription>
                                Select the AI model used for analyzing text responses and generating word clouds.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Form method="post" className="space-y-4">
                                <input type="hidden" name="intent" value="save-analytics-settings" />
                                <input type="hidden" name="analyticsModel" value={model} />

                                {hasApiKey && models.length > 0 && (
                                    <>
                                        <div className="flex items-center gap-2 mb-2">
                                            <Label>Sort models by</Label>
                                            <Button
                                                type="button"
                                                variant={sortBy === "price" ? "default" : "outline"}
                                                size="sm"
                                                onClick={() => setSortBy("price")}
                                            >
                                                Price
                                            </Button>
                                            <Button
                                                type="button"
                                                variant={sortBy === "name" ? "default" : "outline"}
                                                size="sm"
                                                onClick={() => setSortBy("name")}
                                            >
                                                Name
                                            </Button>
                                        </div>

                                        <div className="space-y-2">
                                            <Label>Select Model</Label>
                                            <Select value={model} onValueChange={setModel}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select a model..." />
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
                                                Showing top {Math.min(50, sortedModels.length)} models
                                            </p>
                                        </div>
                                    </>
                                )}

                                <Button type="submit" disabled={isSubmitting || !hasApiKey}>
                                    {isSubmitting ? "Saving..." : "Save Settings"}
                                </Button>
                            </Form>
                        </CardContent>
                    </Card>

                    {/* Hidden Questions Card */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <span className="material-symbols-outlined">visibility_off</span>
                                Hidden Questions
                            </CardTitle>
                            <CardDescription>
                                Select questions that should be hidden by default when viewing analytics. 
                                These columns will be unchecked in the "Columns" dropdown across all sheets.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Form method="post" className="space-y-4">
                                <input type="hidden" name="intent" value="save-hidden-questions" />
                                <input
                                    type="hidden"
                                    name="hiddenQuestions"
                                    value={JSON.stringify(Array.from(hiddenQuestions))}
                                />

                                {allQuestions.length > 0 ? (
                                    <>
                                        <div className="space-y-2">
                                            <Label>Filter questions</Label>
                                            <Input
                                                placeholder="Search questions..."
                                                value={questionFilter}
                                                onChange={(e) => setQuestionFilter(e.target.value)}
                                                className="max-w-sm"
                                            />
                                        </div>

                                        <div className="border rounded-lg max-h-80 overflow-y-auto">
                                            <div className="p-2 space-y-1">
                                                {allQuestions
                                                    .filter((q) =>
                                                        q.toLowerCase().includes(questionFilter.toLowerCase()),
                                                    )
                                                    .map((question) => (
                                                        <div
                                                            key={question}
                                                            className="flex items-start gap-2 p-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded"
                                                        >
                                                            <Checkbox
                                                                id={`q-${question}`}
                                                                checked={hiddenQuestions.has(question)}
                                                                onCheckedChange={(checked) => {
                                                                    setHiddenQuestions((prev) => {
                                                                        const newSet = new Set(prev);
                                                                        if (checked) {
                                                                            newSet.add(question);
                                                                        } else {
                                                                            newSet.delete(question);
                                                                        }
                                                                        return newSet;
                                                                    });
                                                                }}
                                                                className="mt-0.5"
                                                            />
                                                            <label
                                                                htmlFor={`q-${question}`}
                                                                className="text-sm cursor-pointer flex-1 leading-tight"
                                                            >
                                                                {question}
                                                            </label>
                                                        </div>
                                                    ))}
                                            </div>
                                        </div>

                                        <p className="text-xs text-muted-foreground">
                                            {hiddenQuestions.size} question{hiddenQuestions.size !== 1 ? "s" : ""} selected to hide •{" "}
                                            {allQuestions.length} total question{allQuestions.length !== 1 ? "s" : ""} found across all sheets
                                        </p>
                                    </>
                                ) : (
                                    <p className="text-sm text-muted-foreground">
                                        No analytics sheets found. Questions will appear here once you have sheets in your analytics folder.
                                    </p>
                                )}

                                <Button type="submit" disabled={isSubmitting || allQuestions.length === 0}>
                                    {isSubmitting ? "Saving..." : "Save Hidden Questions"}
                                </Button>
                            </Form>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </PageWrapper>
    );
}
