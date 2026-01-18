import { useState, useEffect } from "react";
import { Form, useNavigation, useActionData } from "react-router";
import { toast } from "sonner";
import type { Route } from "./+types/settings.reimbursements";
import { PageWrapper } from "~/components/layout/page-layout";
import { requirePermission } from "~/lib/auth.server";
import { getDatabase } from "~/db";
import {
    SETTINGS_KEYS,
    DEFAULT_APPROVAL_KEYWORDS,
    DEFAULT_REJECTION_KEYWORDS,
    getAvailableModels,
    type OpenRouterModel
} from "~/lib/openrouter.server";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { Input } from "~/components/ui/input";
import { Switch } from "~/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";

export function meta() {
    return [
        { title: "Korvausasetukset / Reimbursement Settings" },
        { name: "robots", content: "noindex" },
    ];
}

export async function loader({ request }: Route.LoaderArgs) {
    await requirePermission(request, "settings:reimbursements", getDatabase);

    const db = getDatabase();

    // Get all settings
    const [
        apiKey,
        aiModel,
        aiEnabled,
        customApproval,
        customRejection,
    ] = await Promise.all([
        db.getSetting(SETTINGS_KEYS.OPENROUTER_API_KEY),
        db.getSetting(SETTINGS_KEYS.AI_MODEL),
        db.getSetting(SETTINGS_KEYS.AI_PARSING_ENABLED),
        db.getSetting(SETTINGS_KEYS.APPROVAL_KEYWORDS),
        db.getSetting(SETTINGS_KEYS.REJECTION_KEYWORDS),
    ]);

    // Fetch available models if API key is set
    let models: OpenRouterModel[] = [];
    if (apiKey) {
        models = await getAvailableModels(apiKey);
    }

    return {
        settings: {
            apiKey: apiKey ? "••••••••" : "", // Mask API key
            hasApiKey: !!apiKey,
            aiModel: aiModel || "",
            aiEnabled: aiEnabled === "true",
            customApproval: customApproval || "",
            customRejection: customRejection || "",
        },
        models,
        defaultKeywords: {
            approval: DEFAULT_APPROVAL_KEYWORDS,
            rejection: DEFAULT_REJECTION_KEYWORDS,
        },
    };
}

export async function action({ request }: Route.ActionArgs) {
    await requirePermission(request, "settings:reimbursements", getDatabase);

    const formData = await request.formData();
    const intent = formData.get("intent") as string;
    const db = getDatabase();

    try {
        if (intent === "save-api-key") {
            const apiKey = formData.get("apiKey") as string;
            if (apiKey && apiKey !== "••••••••") {
                await db.setSetting(SETTINGS_KEYS.OPENROUTER_API_KEY, apiKey, "OpenRouter API key for AI parsing");
            }
            return { success: true, message: "API key saved" };
        }

        if (intent === "save-ai-settings") {
            const aiEnabled = formData.get("aiEnabled") === "true";
            const aiModel = formData.get("aiModel") as string;

            await db.setSetting(SETTINGS_KEYS.AI_PARSING_ENABLED, aiEnabled ? "true" : "false", "Enable AI-assisted parsing");
            if (aiModel) {
                await db.setSetting(SETTINGS_KEYS.AI_MODEL, aiModel, "Selected AI model for parsing");
            }
            return { success: true, message: "AI settings saved" };
        }

        if (intent === "save-keywords") {
            const customApproval = formData.get("customApproval") as string;
            const customRejection = formData.get("customRejection") as string;

            await db.setSetting(SETTINGS_KEYS.APPROVAL_KEYWORDS, customApproval, "Custom approval keywords");
            await db.setSetting(SETTINGS_KEYS.REJECTION_KEYWORDS, customRejection, "Custom rejection keywords");
            return { success: true, message: "Keywords saved" };
        }

        if (intent === "delete-api-key") {
            await db.deleteSetting(SETTINGS_KEYS.OPENROUTER_API_KEY);
            await db.setSetting(SETTINGS_KEYS.AI_PARSING_ENABLED, "false", "Enable AI-assisted parsing");
            return { success: true, message: "API key deleted" };
        }

        return { error: "Unknown action" };
    } catch (error) {
        console.error("[Settings] Error:", error);
        return { error: "Failed to save settings" };
    }
}

export default function SettingsReimbursements({ loaderData }: Route.ComponentProps) {
    const { settings, models, defaultKeywords } = loaderData;
    const navigation = useNavigation();
    const actionData = useActionData<typeof action>();
    const isSubmitting = navigation.state === "submitting";

    const [apiKey, setApiKey] = useState(settings.apiKey);
    const [aiEnabled, setAiEnabled] = useState(settings.aiEnabled);
    const [aiModel, setAiModel] = useState(settings.aiModel);
    const [customApproval, setCustomApproval] = useState(settings.customApproval);
    const [customRejection, setCustomRejection] = useState(settings.customRejection);
    const [sortBy, setSortBy] = useState<"price" | "name">("price");

    // Sort models
    const sortedModels = [...models].sort((a, b) => {
        if (sortBy === "price") {
            return a.pricing.prompt - b.pricing.prompt;
        }
        return a.name.localeCompare(b.name);
    });

    useEffect(() => {
        if (actionData) {
            if (actionData.error) {
                toast.error(actionData.error, { id: "settings-error" });
            } else if (actionData.message) {
                toast.success(actionData.message, { id: "settings-success" });
            }
        }
    }, [actionData]);

    // Format price for display
    const formatPrice = (price: number) => {
        if (price === 0) return "Free";
        if (price < 0.01) return `$${price.toFixed(4)}`;
        return `$${price.toFixed(2)}`;
    };

    return (
        <PageWrapper>
            <div className="w-full max-w-2xl mx-auto px-4 py-8">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white">
                        Korvausasetukset
                    </h1>
                    <p className="text-lg text-gray-500">Reimbursement Settings</p>
                </div>

                <div className="space-y-6">
                    {/* Status message */}


                    {/* OpenRouter API Key */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <span className="material-symbols-outlined">key</span>
                                OpenRouter API Key
                            </CardTitle>
                            <CardDescription>
                                Get your API key from <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="text-primary underline">openrouter.ai/keys</a>
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
                                        {isSubmitting ? "Saving..." : "Save"}
                                    </Button>
                                    {settings.hasApiKey && (
                                        <Form method="post">
                                            <input type="hidden" name="intent" value="delete-api-key" />
                                            <Button type="submit" variant="destructive" disabled={isSubmitting}>
                                                Delete
                                            </Button>
                                        </Form>
                                    )}
                                </div>
                            </Form>
                        </CardContent>
                    </Card>

                    {/* AI Model Selection */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <span className="material-symbols-outlined">smart_toy</span>
                                AI Parsing
                            </CardTitle>
                            <CardDescription>
                                Enable AI-assisted parsing for more accurate reply interpretation
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Form method="post" className="space-y-4">
                                <input type="hidden" name="intent" value="save-ai-settings" />
                                <input type="hidden" name="aiEnabled" value={aiEnabled ? "true" : "false"} />
                                <input type="hidden" name="aiModel" value={aiModel} />

                                <div className="flex items-center justify-between">
                                    <div>
                                        <Label>Enable AI Parsing</Label>
                                        <p className="text-sm text-muted-foreground">
                                            Use AI to interpret email replies before falling back to keywords
                                        </p>
                                    </div>
                                    <Switch
                                        checked={aiEnabled}
                                        onCheckedChange={setAiEnabled}
                                        disabled={!settings.hasApiKey}
                                    />
                                </div>

                                {settings.hasApiKey && models.length > 0 && (
                                    <>
                                        <div className="flex items-center gap-2 mb-2">
                                            <Label>Sort by:</Label>
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
                                            <Label>AI Model</Label>
                                            <Select value={aiModel} onValueChange={setAiModel}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select a model..." />
                                                </SelectTrigger>
                                                <SelectContent className="max-h-64">
                                                    {sortedModels.slice(0, 50).map((model) => (
                                                        <SelectItem key={model.id} value={model.id}>
                                                            <div className="flex items-center gap-2">
                                                                <span className="truncate max-w-[200px]">{model.name}</span>
                                                                <Badge variant="secondary" className="text-xs">
                                                                    {formatPrice(model.pricing.prompt)}/1M
                                                                </Badge>
                                                            </div>
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <p className="text-xs text-muted-foreground">
                                                Showing {Math.min(50, sortedModels.length)} of {sortedModels.length} models
                                            </p>
                                        </div>
                                    </>
                                )}

                                {!settings.hasApiKey && (
                                    <p className="text-sm text-muted-foreground italic">
                                        Add an API key above to enable AI parsing and select a model.
                                    </p>
                                )}

                                <Button type="submit" disabled={isSubmitting || !settings.hasApiKey}>
                                    {isSubmitting ? "Saving..." : "Save AI Settings"}
                                </Button>
                            </Form>
                        </CardContent>
                    </Card>

                    {/* Custom Keywords */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <span className="material-symbols-outlined">checklist</span>
                                Keywords
                            </CardTitle>
                            <CardDescription>
                                Custom keywords for detecting approval or rejection in emails
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Form method="post" className="space-y-4">
                                <input type="hidden" name="intent" value="save-keywords" />

                                <div className="space-y-2">
                                    <Label>Default Approval Keywords</Label>
                                    <div className="flex flex-wrap gap-1">
                                        {defaultKeywords.approval.map((kw: string) => (
                                            <Badge key={kw} variant="outline" className="text-green-600 border-green-300">
                                                {kw}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="customApproval">Additional Approval Keywords</Label>
                                    <Input
                                        id="customApproval"
                                        name="customApproval"
                                        value={customApproval}
                                        onChange={(e) => setCustomApproval(e.target.value)}
                                        placeholder="paid, done, accepted (comma-separated)"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label>Default Rejection Keywords</Label>
                                    <div className="flex flex-wrap gap-1">
                                        {defaultKeywords.rejection.map((kw: string) => (
                                            <Badge key={kw} variant="outline" className="text-red-600 border-red-300">
                                                {kw}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="customRejection">Additional Rejection Keywords</Label>
                                    <Input
                                        id="customRejection"
                                        name="customRejection"
                                        value={customRejection}
                                        onChange={(e) => setCustomRejection(e.target.value)}
                                        placeholder="refused, cancelled (comma-separated)"
                                    />
                                </div>

                                <Button type="submit" disabled={isSubmitting}>
                                    {isSubmitting ? "Saving..." : "Save Keywords"}
                                </Button>
                            </Form>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </PageWrapper>
    );
}
