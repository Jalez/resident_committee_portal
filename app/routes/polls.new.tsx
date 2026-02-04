
import { useState } from "react";
import { Form, Link, redirect, useActionData, useNavigation } from "react-router";
import { useTranslation } from "react-i18next";
import { getDatabase } from "~/db";
import { getAuthenticatedUser } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import {
    getAnalyticsSheets,
    getGoogleForm,
    getGoogleForms,
    GOOGLE_CONFIG,
    type AnalyticsSheet,
    type DiscoveredGoogleForm
} from "~/lib/google.server";
import type { Route } from "./+types/polls.new";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "~/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";

// ============================================================================
// Meta
// ============================================================================

export function meta({ data }: Route.MetaArgs) {
    const title = `${data?.siteConfig?.name || "Portal"} - Add Poll`;
    return [
        { title },
        { name: "description", content: "Add a new poll" },
    ];
}

// ============================================================================
// Loader
// ============================================================================

export async function loader({ request }: Route.LoaderArgs) {
    const authUser = await getAuthenticatedUser(request, getDatabase);

    if (!authUser) {
        throw new Response("Not Found", { status: 404 });
    }

    const canWrite = authUser.permissions.some(
        (p) => p === "polls:write" || p === "*",
    );
    if (!canWrite) {
        throw new Response("Not Found", { status: 404 });
    }

    const canViewAnalytics = authUser.permissions.some(
        (p) => p === "forms:read" || p === "*",
    );

    // Get available analytics sheets for linking
    let analyticsSheets: AnalyticsSheet[] = [];
    if (canViewAnalytics) {
        try {
            analyticsSheets = await getAnalyticsSheets(undefined, false);
        } catch (error) {
            console.error("Failed to fetch analytics sheets:", error);
        }
    }

    // Auto-discover Google Forms shared with Service Account
    let discoveredForms: DiscoveredGoogleForm[] = [];
    if (canWrite) {
        try {
            // Force refresh to find newly shared forms
            discoveredForms = await getGoogleForms(true);
        } catch (error) {
            console.error("Failed to discover Google Forms:", error);
        }
    }

    return {
        siteConfig: SITE_CONFIG,
        analyticsSheets,
        discoveredForms,
        userId: authUser.userId,
        userEmail: authUser.email,
        serviceAccountEmail: GOOGLE_CONFIG.serviceAccountEmail,
    };
}

// ============================================================================
// Action
// ============================================================================

export async function action({ request }: Route.ActionArgs) {
    const authUser = await getAuthenticatedUser(request, getDatabase);

    if (!authUser) {
        throw new Response("Not Found", { status: 404 });
    }

    const canWrite = authUser.permissions.some(
        (p) => p === "polls:write" || p === "*",
    );
    if (!canWrite) {
        throw new Response("Forbidden", { status: 403 });
    }

    const formData = await request.formData();
    const pollType = formData.get("pollType") as "managed" | "linked" | "external";
    const analyticsSheetId = formData.get("analyticsSheetId") as string;

    const db = getDatabase();
    const currentYear = new Date().getFullYear();

    // Handle different poll types
    if (pollType === "linked") {
        // Link an existing Google Form
        const googleFormIdSelection = formData.get("googleFormId") as string;
        const manualUrl = formData.get("googleFormUrl") as string;
        let googleFormId = googleFormIdSelection;

        if (googleFormIdSelection === "manual") {
            if (!manualUrl || !manualUrl.trim()) {
                return { error: "Google Form URL is required" };
            }
            const formIdMatch = manualUrl.match(/\/forms\/d\/([a-zA-Z0-9_-]+)/);
            if (!formIdMatch) {
                return { error: "Invalid Google Form URL. Must be a valid Google Forms link." };
            }
            googleFormId = formIdMatch[1];
        } else if (!googleFormId) {
            return { error: "Please select a Google Form" };
        }

        // Fetch form metadata (Title & Description) via Service Account
        const formMeta = await getGoogleForm(googleFormId);
        if (!formMeta) {
            return {
                error: "Could not fetch form details. Please ensure you have shared the form with the system email (Edit access) and the URL is correct."
            };
        }

        const name = formMeta.title;
        const description = formMeta.description || null;

        // Parse deadline (Date + Time)
        const deadlineDate = formData.get("deadlineDate") as string;
        const deadlineTime = formData.get("deadlineTime") as string;
        let deadline: Date | null = null;

        if (deadlineDate && deadlineTime) {
            deadline = new Date(`${deadlineDate}T${deadlineTime}`);
            if (Number.isNaN(deadline.getTime())) {
                return { error: "Invalid deadline date/time" };
            }
        }

        await db.createPoll({
            name,
            description,
            type: "linked",
            googleFormId,
            externalUrl: `https://docs.google.com/forms/d/${googleFormId}/viewform`,
            deadline,
            analyticsSheetId: analyticsSheetId && analyticsSheetId !== "none" ? analyticsSheetId : null,
            year: currentYear,
            status: "active",
            createdBy: authUser.userId,
        });

        return redirect("/polls");

    } else {
        // External poll (custom URL)
        const externalUrl = formData.get("externalUrl") as string;
        const name = formData.get("name") as string;
        const description = formData.get("description") as string;
        const deadlineStr = formData.get("deadline") as string;

        if (!externalUrl || !externalUrl.trim()) {
            return { error: "Poll URL is required" };
        }

        if (!name || !name.trim()) {
            return { error: "Name is required" };
        }

        // Validate URL format
        try {
            new URL(externalUrl);
        } catch {
            return { error: "Invalid URL format" };
        }

        // Parse deadline
        let deadline: Date | null = null;
        if (deadlineStr) {
            deadline = new Date(deadlineStr);
            if (Number.isNaN(deadline.getTime())) {
                return { error: "Invalid deadline date" };
            }
        }

        await db.createPoll({
            name: name.trim(),
            description: description?.trim() || null,
            type: "external",
            googleFormId: null,
            externalUrl: externalUrl.trim(),
            deadline,
            analyticsSheetId: analyticsSheetId && analyticsSheetId !== "none" ? analyticsSheetId : null,
            year: currentYear,
            status: "active",
            createdBy: authUser.userId,
        });

        return redirect("/polls");
    }
}

// ============================================================================
// Component
// ============================================================================

export default function NewPoll({ loaderData }: Route.ComponentProps) {
    const { t } = useTranslation();
    const { analyticsSheets, serviceAccountEmail, discoveredForms } = loaderData;
    const actionData = useActionData<typeof action>();
    const navigation = useNavigation();
    const isSubmitting = navigation.state === "submitting";

    const [pollType, setPollType] = useState<"managed" | "linked" | "external" | null>(null);
    const [isManualLink, setIsManualLink] = useState(false);



    return (
        <div className="container mx-auto px-4 py-6 max-w-2xl">
            {/* Header */}
            <div className="flex items-center gap-2 mb-6">
                <Button asChild variant="ghost" size="sm">
                    <Link to="/polls">
                        <span className="material-symbols-outlined text-base">arrow_back</span>
                    </Link>
                </Button>
                <h1 className="text-2xl font-bold">{t("polls.new.title")}</h1>
            </div>

            {/* Error Alert */}
            {actionData?.error && (
                <Alert variant="destructive" className="mb-6">
                    <AlertTitle>{t("common.error")}</AlertTitle>
                    <AlertDescription>{actionData.error}</AlertDescription>
                </Alert>
            )}

            {/* Step 1: Choose Type */}
            {!pollType && (
                <div className="space-y-4">
                    <h2 className="text-lg font-semibold">{t("polls.new.choose_type")}</h2>

                    {/* Link Existing Google Form */}
                    <Card
                        className="cursor-pointer hover:border-primary transition-colors"
                        onClick={() => setPollType("linked")}
                    >
                        <CardHeader>
                            <div className="flex items-center gap-3">
                                <span className="material-symbols-outlined text-2xl text-blue-600">link</span>
                                <div>
                                    <CardTitle className="text-lg">{t("polls.new.type_linked")}</CardTitle>
                                    <CardDescription>{t("polls.new.type_linked_desc")}</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                    </Card>

                    {/* External URL */}
                    <Card
                        className="cursor-pointer hover:border-primary transition-colors"
                        onClick={() => setPollType("external")}
                    >
                        <CardHeader>
                            <div className="flex items-center gap-3">
                                <span className="material-symbols-outlined text-2xl text-gray-600">open_in_new</span>
                                <div>
                                    <CardTitle className="text-lg">{t("polls.new.type_external")}</CardTitle>
                                    <CardDescription>{t("polls.new.type_external_desc")}</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                    </Card>
                </div>
            )}

            {/* Step 2: Poll Details Form */}
            {pollType && (
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle>{t(`polls.new.type_${pollType}`)}</CardTitle>
                                <CardDescription>
                                    {pollType === "linked" && t("polls.new.linked_info")}
                                    {pollType === "external" && t("polls.new.external_info")}
                                </CardDescription>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => setPollType(null)}>
                                <span className="material-symbols-outlined text-base">close</span>
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <Form method="post" className="space-y-6">
                            <input type="hidden" name="pollType" value={pollType} />

                            {/* Service Account Sharing Instruction */}
                            {pollType === "linked" && (
                                <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950/20 text-blue-800 dark:text-blue-200 grid-cols-[auto_1fr]">
                                    <span className="material-symbols-outlined text-blue-600 dark:text-blue-400 mt-0.5">
                                        info
                                    </span>
                                    <div className="space-y-3">
                                        <div>
                                            <AlertTitle className="font-semibold mb-1">
                                                Action Required: Share Form
                                            </AlertTitle>
                                            <AlertDescription className="text-sm">
                                                <span>For the deadline feature (auto-close) to work, you <span className="font-bold">MUST</span> share your Google Form with the system email as an <span className="font-bold">Editor</span>.</span>
                                            </AlertDescription>
                                        </div>

                                        <div className="flex items-center gap-2 p-3 bg-white dark:bg-black/40 rounded-md border border-blue-100 dark:border-blue-900 shadow-sm">
                                            <code className="text-xs font-mono flex-1 select-all break-all">
                                                {serviceAccountEmail}
                                            </code>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 w-6 p-0"
                                                onClick={() => {
                                                    navigator.clipboard.writeText(serviceAccountEmail);
                                                }}
                                                title="Copy email"
                                            >
                                                <span className="material-symbols-outlined text-sm">content_copy</span>
                                            </Button>
                                        </div>
                                    </div>
                                </Alert>
                            )}

                            {/* Name & Description (Only for External, Auto-fetched for Linked) */}
                            {pollType === "external" && (
                                <>
                                    <div className="space-y-2">
                                        <Label htmlFor="name">{t("polls.new.name")}</Label>
                                        <Input
                                            id="name"
                                            name="name"
                                            placeholder={t("polls.new.name_placeholder")}
                                            required
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="description">{t("polls.new.description")}</Label>
                                        <Textarea
                                            id="description"
                                            name="description"
                                            placeholder={t("polls.new.description_placeholder")}
                                            rows={3}
                                        />
                                    </div>
                                </>
                            )}

                            {/* Type-specific fields */}
                            {pollType === "linked" && (
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="googleFormId">{t("polls.new.google_form_select") || "Select Google Form"}</Label>
                                        <Select name="googleFormId" onValueChange={(v) => setIsManualLink(v === "manual")}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select a shared form..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {discoveredForms.map((form: { id: string; name: string }) => (
                                                    <SelectItem key={form.id} value={form.id}>
                                                        {form.name}
                                                    </SelectItem>
                                                ))}
                                                <SelectItem value="manual">Link manually via URL...</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        {discoveredForms.length === 0 && (
                                            <p className="text-sm text-yellow-600 dark:text-yellow-400">
                                                No forms found. Share your form with the system email and refresh the page.
                                            </p>
                                        )}
                                    </div>

                                    {isManualLink && (
                                        <div className="space-y-2">
                                            <Label htmlFor="googleFormUrl">{t("polls.new.google_form_url")}</Label>
                                            <Input
                                                id="googleFormUrl"
                                                name="googleFormUrl"
                                                type="url"
                                                placeholder="https://docs.google.com/forms/d/..."
                                                required={isManualLink}
                                            />
                                        </div>
                                    )}
                                </div>
                            )}

                            {pollType === "external" && (
                                <div className="space-y-2">
                                    <Label htmlFor="externalUrl">{t("polls.new.url")}</Label>
                                    <Input
                                        id="externalUrl"
                                        name="externalUrl"
                                        type="url"
                                        placeholder={t("polls.new.url_placeholder")}
                                        required
                                    />
                                    <p className="text-sm text-muted-foreground">
                                        {t("polls.new.url_help")}
                                    </p>
                                </div>
                            )}

                            {/* Deadline (Split Date/Time) */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="deadlineDate">{t("polls.new.deadline")} ({t("common.date") || "Date"})</Label>
                                    <Input
                                        id="deadlineDate"
                                        name="deadlineDate"
                                        type="date"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="deadlineTime">{t("polls.new.deadline")} ({t("common.time") || "Time"})</Label>
                                    <Input
                                        id="deadlineTime"
                                        name="deadlineTime"
                                        type="time"
                                    />
                                </div>
                            </div>
                            <p className="text-sm text-muted-foreground -mt-1">
                                {t("polls.new.deadline_help")}
                            </p>

                            {/* Analytics Sheet Link */}
                            {analyticsSheets.length > 0 && (
                                <div className="space-y-2">
                                    <Label htmlFor="analyticsSheetId">{t("polls.new.analytics_sheet")}</Label>
                                    <Select name="analyticsSheetId">
                                        <SelectTrigger>
                                            <SelectValue placeholder={t("polls.new.no_sheet")} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">{t("polls.new.no_sheet")}</SelectItem>
                                            {analyticsSheets.map((sheet: { id: string; name: string }) => (
                                                <SelectItem key={sheet.id} value={sheet.id}>
                                                    {sheet.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <p className="text-sm text-muted-foreground">
                                        {t("polls.new.analytics_sheet_help")}
                                    </p>
                                </div>
                            )}

                            {/* Submit */}
                            <div className="flex gap-2 pt-4">
                                <Button type="submit" disabled={isSubmitting}>
                                    {isSubmitting ? (
                                        <>
                                            <span className="material-symbols-outlined animate-spin mr-1 text-base">progress_activity</span>
                                            {pollType === "managed" ? t("polls.new.creating") : t("common.saving")}
                                        </>
                                    ) : (
                                        <>
                                            <span className="material-symbols-outlined mr-1 text-base">add</span>
                                            {pollType === "managed" ? t("polls.new.create_form") : t("polls.new.submit")}
                                        </>
                                    )}
                                </Button>
                                <Button variant="outline" onClick={() => setPollType(null)} disabled={isSubmitting}>
                                    {t("common.actions.back")}
                                </Button>
                            </div>
                        </Form>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
