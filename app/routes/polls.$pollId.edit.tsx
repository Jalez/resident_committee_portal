import { useRef, useState } from "react";
import { Form, redirect, useActionData, useNavigate, useNavigation } from "react-router";
import { useTranslation } from "react-i18next";
import { PageWrapper, SplitLayout } from "~/components/layout/page-layout";
import { getDatabase } from "~/db";
import { getAuthenticatedUser } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import { getSystemLanguageDefaults } from "~/lib/settings.server";
import { getAnalyticsSheets } from "~/lib/google.server";
import type { AnalyticsSheet } from "~/lib/google.server";
import type { Route } from "./+types/polls.$pollId.edit";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { ConfirmDialog } from "~/components/ui/confirm-dialog";
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
import type { Poll } from "~/db/schema";
import { Separator } from "~/components/ui/separator";

// ============================================================================
// Meta
// ============================================================================

export function meta({ data }: Route.MetaArgs) {
    const title = `${data?.siteConfig?.name || "Portal"} - Edit Poll`;
    return [
        { title },
        { name: "description", content: "Edit poll details" },
    ];
}

// ============================================================================
// Loader
// ============================================================================

export async function loader({ request, params }: Route.LoaderArgs) {
    const authUser = await getAuthenticatedUser(request, getDatabase);

    if (!authUser) {
        throw new Response("Not Found", { status: 404 });
    }

    const { pollId } = params;
    const db = getDatabase();

    // Check permissions (Allow update or write)
    const canUpdate = authUser.permissions.some(
        (p) => p === "polls:update" || p === "polls:write" || p === "*",
    );
    // Also check delete for UI
    const canDelete = authUser.permissions.some(
        (p) => p === "polls:delete" || p === "*",
    );

    if (!canUpdate && !canDelete) {
        // If they can't update OR delete, they shouldn't be here (or read-only? but this is EDIT route)
        // Let's enforce canUpdate for the main form, but if they have canDelete they might come just to delete?
        // Simpler: Require canUpdate to view the edit form.
        throw new Response("Forbidden", { status: 403 });
    }

    // Get Poll
    const poll = await db.getPollById(pollId);
    if (!poll) {
        throw new Response("Not Found", { status: 404 });
    }

    // Get analytics sheets
    let analyticsSheets: AnalyticsSheet[] = [];
    const canViewAnalytics = authUser.permissions.some(
        (p) => p === "forms:read" || p === "*",
    );
    if (canViewAnalytics) {
        try {
            analyticsSheets = await getAnalyticsSheets(undefined, false);
        } catch (error) {
            console.error("Failed to fetch analytics sheets:", error);
        }
    }

    const systemLanguages = await getSystemLanguageDefaults();
    return {
        siteConfig: SITE_CONFIG,
        poll,
        analyticsSheets,
        canUpdate,
        canDelete,
        systemLanguages,
        returnUrl: new URL(request.url).searchParams.get("returnUrl"),
    };
}

// ============================================================================
// Action
// ============================================================================

export async function action({ request, params }: Route.ActionArgs) {
    const authUser = await getAuthenticatedUser(request, getDatabase);
    if (!authUser) {
        throw new Response("Not Found", { status: 404 });
    }

    // Permissions are checked based on action type below

    const { pollId } = params;
    const db = getDatabase();
    const poll = await db.getPollById(pollId);
    if (!poll) {
        throw new Response("Not Found", { status: 404 });
    }

    const formData = await request.formData();
    const actionType = formData.get("actionType");

    if (actionType === "delete") {
        const canDelete = authUser.permissions.some(
            (p) => p === "polls:delete" || p === "*",
        );
        if (!canDelete) {
            throw new Response("Forbidden", { status: 403 });
        }
        await db.deletePoll(pollId);
        return redirect("/polls");
    }

    // For update, require canUpdate (or write)
    const canUpdate = authUser.permissions.some(
        (p) => p === "polls:update" || p === "polls:write" || p === "*",
    );
    if (!canUpdate) {
        throw new Response("Forbidden", { status: 403 });
    }

    // Update
    const analyticsSheetId = formData.get("analyticsSheetId") as string;
    const status = formData.get("status") as "active" | "closed";

    // Parse deadline
    const deadlineDate = formData.get("deadlineDate") as string;
    const deadlineTime = formData.get("deadlineTime") as string;
    let deadline: Date | null = null;

    if (deadlineDate && deadlineTime) {
        deadline = new Date(`${deadlineDate}T${deadlineTime}`);
        if (Number.isNaN(deadline.getTime())) {
            return { error: "Invalid deadline date/time" };
        }
    }

    const updates: Partial<Poll> = {
        analyticsSheetId: analyticsSheetId && analyticsSheetId !== "none" ? analyticsSheetId : null,
        status,
        deadline,
    };

    if (poll.type === "external") {
        const name = formData.get("name") as string;
        const description = formData.get("description") as string;
        const externalUrl = formData.get("externalUrl") as string;

        if (!name || !name.trim()) return { error: "Name is required" };
        if (!externalUrl || !externalUrl.trim()) return { error: "URL is required" };

        updates.name = name.trim();
        updates.description = description?.trim() || null;
        updates.externalUrl = externalUrl.trim();
    } else if (poll.type === "linked") {
        // Optionally sync name/desc from Google Form?
        // For now, keep them read-only in UI and don't update them here unless requested.
        // If we wanted to re-fetch, we'd need another action.
    }

    await db.updatePoll(pollId, updates);

    // Handle returnUrl redirect (from source entity picker)
    const returnUrl = formData.get("_returnUrl") as string | null;
    if (returnUrl) {
        return redirect(returnUrl);
    }

    return redirect("/polls");
}

// ============================================================================
// Component
// ============================================================================

export default function EditPoll({ loaderData }: Route.ComponentProps) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { poll, analyticsSheets, systemLanguages } = loaderData;
    const actionData = useActionData<typeof action>();
    const navigation = useNavigation();
    const isSubmitting = navigation.state === "submitting";
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const deleteFormRef = useRef<HTMLFormElement>(null);

    const deadlineIso = poll.deadline ? new Date(poll.deadline).toISOString() : "";
    const defaultDate = deadlineIso ? deadlineIso.split("T")[0] : "";
    const defaultTime = deadlineIso ? deadlineIso.split("T")[1].substring(0, 5) : "";

    return (
        <PageWrapper>
            <Form method="post" className="hidden" ref={deleteFormRef}>
                <input type="hidden" name="actionType" value="delete" />
            </Form>
            <ConfirmDialog
                open={showDeleteConfirm}
                onOpenChange={setShowDeleteConfirm}
                title={t("common.actions.delete")}
                description={t("common.confirm_delete") || "Are you sure?"}
                confirmLabel={t("common.actions.delete")}
                cancelLabel={t("common.actions.cancel")}
                variant="destructive"
                onConfirm={() => {
                    deleteFormRef.current?.requestSubmit();
                    setShowDeleteConfirm(false);
                }}
            />
            <SplitLayout
                header={{
                    primary: `${t("common.actions.edit", { lng: systemLanguages.primary })} Poll`,
                    secondary: `${t("common.actions.edit", { lng: systemLanguages.secondary ?? systemLanguages.primary })} Poll`,
                }}
            >
                <div className="max-w-2xl">
            {actionData?.error && (
                <Alert variant="destructive" className="mb-6">
                    <AlertTitle>{t("common.error")}</AlertTitle>
                    <AlertDescription>{actionData.error}</AlertDescription>
                </Alert>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>{t("polls.details")}</CardTitle>
                    <CardDescription>{t(`polls.new.type_${poll.type}`)}</CardDescription>
                </CardHeader>
                <CardContent>
                    <Form method="post" className="space-y-6">
                        <input type="hidden" name="actionType" value="update" />
                        {loaderData.returnUrl && <input type="hidden" name="_returnUrl" value={loaderData.returnUrl} />}

                        {poll.type === "linked" ? (
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label>Name</Label>
                                    <div className="p-2 bg-muted rounded-md text-sm">{poll.name}</div>
                                </div>
                                <div className="space-y-2">
                                    <Label>Description</Label>
                                    <div className="p-2 bg-muted rounded-md text-sm whitespace-pre-wrap">{poll.description || "-"}</div>
                                </div>
                                <div className="space-y-2">
                                    <Label>Google Form URL</Label>
                                    <div className="p-2 bg-muted rounded-md text-sm truncate">
                                        <a href={poll.externalUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                                            {poll.externalUrl}
                                        </a>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="space-y-2">
                                    <Label htmlFor="name">{t("polls.new.name")}</Label>
                                    <Input id="name" name="name" defaultValue={poll.name} required />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="description">{t("polls.new.description")}</Label>
                                    <Textarea id="description" name="description" defaultValue={poll.description || ""} rows={3} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="externalUrl">{t("polls.new.url")}</Label>
                                    <Input id="externalUrl" name="externalUrl" defaultValue={poll.externalUrl} type="url" required />
                                </div>
                            </>
                        )}

                        <Separator />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="deadlineDate">{t("polls.new.deadline")} ({t("common.date") || "Date"})</Label>
                                <Input id="deadlineDate" name="deadlineDate" type="date" defaultValue={defaultDate} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="deadlineTime">{t("polls.new.deadline")} ({t("common.time") || "Time"})</Label>
                                <Input id="deadlineTime" name="deadlineTime" type="time" defaultValue={defaultTime} />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="status">Status</Label>
                            <Select name="status" defaultValue={poll.status}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="active">{t("polls.active") || "Active"}</SelectItem>
                                    <SelectItem value="closed">{t("polls.closed") || "Closed"}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {analyticsSheets.length > 0 && (
                            <div className="space-y-2">
                                <Label htmlFor="analyticsSheetId">{t("polls.new.analytics_sheet")}</Label>
                                <Select name="analyticsSheetId" defaultValue={poll.analyticsSheetId || "none"}>
                                    <SelectTrigger>
                                        <SelectValue />
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
                            </div>
                        )}

                        <div className="flex justify-between pt-4">
                            <div className="flex gap-2">
                                <Button type="submit" disabled={isSubmitting}>
                                    {isSubmitting ? t("common.saving") : t("common.actions.save")}
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => navigate(loaderData.returnUrl || "/polls")}
                                >
                                    {t("common.actions.cancel")}
                                </Button>
                            </div>

                            <Button
                                type="button"
                                variant="destructive"
                                disabled={isSubmitting}
                                onClick={() => setShowDeleteConfirm(true)}
                            >
                                {t("common.actions.delete")}
                            </Button>
                        </div>
                    </Form>
                </CardContent>
            </Card>
                </div>
            </SplitLayout>
        </PageWrapper>
    );
}
