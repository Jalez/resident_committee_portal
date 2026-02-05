import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { PageWrapper, SplitLayout } from "~/components/layout/page-layout";
import { getDatabase } from "~/db";
import { getAuthenticatedUser } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import { getSystemLanguageDefaults } from "~/lib/settings.server";
import { updateFormPublishingState } from "~/lib/google.server";
import type { Route } from "./+types/polls";
import { AddItemButton } from "~/components/add-item-button";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import type { Poll } from "~/db/schema";

// ============================================================================
// Meta
// ============================================================================

export function meta({ data }: Route.MetaArgs) {
    const title = `${data?.siteConfig?.name || "Portal"} - Polls`;
    return [
        { title },
        { name: "description", content: "View and manage polls" },
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

    const canRead = authUser.permissions.some(
        (p) => p === "polls:read" || p === "*",
    );
    if (!canRead) {
        throw new Response("Not Found", { status: 404 });
    }

    const canWrite = authUser.permissions.some(
        (p) => p === "polls:write" || p === "*",
    );
    const canUpdate = authUser.permissions.some(
        (p) => p === "polls:update" || p === "*",
    );
    const canDelete = authUser.permissions.some(
        (p) => p === "polls:delete" || p === "*",
    );
    const canViewAnalytics = authUser.permissions.some(
        (p) => p === "forms:read" || p === "*",
    );

    const db = getDatabase();
    const currentYear = new Date().getFullYear();

    // Get polls from database
    let allPolls = await db.getPolls(currentYear);

    // Auto-close expired polls (Lazy check)
    const now = new Date();
    const expiredPolls = allPolls.filter((p: Poll) =>
        p.status === "active" &&
        p.deadline &&
        new Date(p.deadline) < now
    );

    if (expiredPolls.length > 0) {
        console.log(`[Polls] Found ${expiredPolls.length} expired polls. Closing...`);

        for (const poll of expiredPolls) {
            try {
                // 1. Close in Google Forms if it has an ID
                if (poll.googleFormId) {
                    await updateFormPublishingState(poll.googleFormId, false);
                }

                // 2. Update status in database
                await db.updatePoll(poll.id, { status: "closed" });

                console.log(`[Polls] Closed expired poll: ${poll.name}`);
            } catch (error) {
                console.error(`[Polls] Failed to close poll ${poll.id}:`, error);
            }
        }

        // Re-fetch polls to show updated status
        allPolls = await db.getPolls(currentYear);
    }

    const activePolls = allPolls.filter((p: Poll) => p.status === "active");
    const closedPolls = allPolls.filter((p: Poll) => p.status === "closed");

    const systemLanguages = await getSystemLanguageDefaults();
    return {
        siteConfig: SITE_CONFIG,
        activePolls,
        closedPolls,
        canWrite,
        canUpdate,
        canDelete,
        canViewAnalytics,
        currentYear,
        systemLanguages,
    };
}

// ============================================================================
// Helper: Calculate time remaining
// ============================================================================

function getTimeRemaining(deadline: Date | null): {
    label: string;
    isUrgent: boolean;
    isPast: boolean;
    daysLeft: number;
    hoursLeft: number;
} {
    if (!deadline) {
        return { label: "", isUrgent: false, isPast: false, daysLeft: 0, hoursLeft: 0 };
    }

    const now = new Date();
    const diff = deadline.getTime() - now.getTime();

    const daysLeft = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
    const hoursLeft = Math.max(0, Math.ceil(diff / (1000 * 60 * 60)));

    if (diff <= 0) {
        return { label: "closed", isUrgent: false, isPast: true, daysLeft: 0, hoursLeft: 0 };
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (days === 0 && hours === 0) {
        return { label: "less_than_hour", isUrgent: true, isPast: false, daysLeft, hoursLeft };
    }
    if (days === 0) {
        return { label: "hours", isUrgent: true, isPast: false, daysLeft, hoursLeft };
    }
    if (days === 1) {
        return { label: "tomorrow", isUrgent: true, isPast: false, daysLeft, hoursLeft };
    }
    if (days <= 3) {
        return { label: "days", isUrgent: true, isPast: false, daysLeft, hoursLeft };
    }
    return { label: "days", isUrgent: false, isPast: false, daysLeft, hoursLeft };
}

// ============================================================================
// Component: Poll Card (Database polls)
// ============================================================================

interface PollCardProps {
    poll: Poll;
    canViewAnalytics: boolean;
    canUpdate?: boolean;
    canDelete?: boolean;
    t: (key: string, options?: Record<string, unknown>) => string;
}

function PollCard({ poll, canViewAnalytics, canUpdate, canDelete, t }: PollCardProps) {
    const timeRemaining = getTimeRemaining(poll.deadline);

    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                    <div>
                        <CardTitle className="text-lg">{poll.name}</CardTitle>
                    </div>
                    {poll.status === "active" && poll.deadline && (
                        <Badge variant={timeRemaining.isUrgent ? "destructive" : "secondary"}>
                            {timeRemaining.label === "tomorrow" && t("polls.ends_tomorrow")}
                            {timeRemaining.label === "hours" && t("polls.time_remaining", { time: `${timeRemaining.hoursLeft}h` })}
                            {timeRemaining.label === "days" && t("polls.time_remaining", { time: `${timeRemaining.daysLeft}d` })}
                            {timeRemaining.label === "less_than_hour" && t("polls.ends_today")}
                        </Badge>
                    )}
                    {poll.status === "closed" && (
                        <Badge variant="outline">{t("polls.status_closed")}</Badge>
                    )}
                </div>
            </CardHeader>
            <CardContent className="pt-0">
                <div className="flex flex-wrap gap-2">
                    {poll.status === "active" && (
                        <Button asChild size="sm">
                            <a href={poll.externalUrl} target="_blank" rel="noopener noreferrer">
                                <span className="material-symbols-outlined mr-1 text-base">open_in_new</span>
                                {t("polls.fill_poll")}
                            </a>
                        </Button>
                    )}
                    {canViewAnalytics && poll.analyticsSheetId && (
                        <Button asChild variant="outline" size="sm">
                            <Link to={`/polls/analytics?sheetId=${poll.analyticsSheetId}`}>
                                <span className="material-symbols-outlined mr-1 text-base">analytics</span>
                                {t("polls.view_results")}
                            </Link>
                        </Button>
                    )}
                    {canUpdate && (
                        <Button asChild variant="ghost" size="sm">
                            <Link to={`/polls/${poll.id}/edit`}>
                                <span className="material-symbols-outlined mr-1 text-base">edit</span>
                                {t("common.actions.edit")}
                            </Link>
                        </Button>
                    )}
                    {canDelete && (
                        <form method="post" action={`/polls/${poll.id}/edit`} onSubmit={(e) => {
                            if (!confirm(t("common.confirm_delete") || "Are you sure?")) {
                                e.preventDefault();
                            }
                        }}>
                            <input type="hidden" name="actionType" value="delete" />
                            <Button type="submit" variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                                <span className="material-symbols-outlined text-base">delete</span>
                            </Button>
                        </form>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

// ============================================================================
// Page Component
// ============================================================================

export default function Polls({ loaderData }: Route.ComponentProps) {
    const { t } = useTranslation();
    const {
        activePolls,
        closedPolls,
        canWrite,
        canUpdate,
        canDelete,
        canViewAnalytics,
        systemLanguages,
    } = loaderData;

    // Total active count includes only database polls
    const totalActiveCount = activePolls.length;

    return (
        <PageWrapper>
            <SplitLayout
                header={{
                    primary: t("polls.title", { lng: systemLanguages.primary }),
                    secondary: t("polls.title", { lng: systemLanguages.secondary ?? systemLanguages.primary }),
                }}
                footer={
                    <div className="flex gap-2">
                        {canWrite && (
                            <AddItemButton
                                to="/polls/new"
                                title={t("polls.add_poll")}
                                variant="button"
                            />
                        )}
                    </div>
                }
            >
                <p className="text-muted-foreground mb-8">{t("polls.description")}</p>

                {/* Active Polls Section */}
                <section className="mb-8">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <span className="material-symbols-outlined text-green-600">radio_button_checked</span>
                    {t("polls.active")} ({totalActiveCount})
                </h2>
                {totalActiveCount === 0 ? (
                    <Card>
                        <CardContent className="py-8 text-center text-muted-foreground">
                            {t("polls.no_active_polls")}
                        </CardContent>
                    </Card>
                ) : (
                    <div className="space-y-4">
                        {activePolls.map((poll: Poll) => (
                            <PollCard
                                key={poll.id}
                                poll={poll}
                                canViewAnalytics={canViewAnalytics}
                                canUpdate={canUpdate}
                                canDelete={canDelete}
                                t={t}
                            />
                        ))}
                    </div>
                )}
            </section>

            {/* Closed Polls Section */}
            {closedPolls.length > 0 && (
                <section>
                    <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <span className="material-symbols-outlined text-gray-400">check_circle</span>
                        {t("polls.closed")} ({closedPolls.length})
                    </h2>
                    <div className="space-y-4">
                        {closedPolls.map((poll: Poll) => (
                            <PollCard
                                key={poll.id}
                                poll={poll}
                                canViewAnalytics={canViewAnalytics}
                                canUpdate={canUpdate}
                                canDelete={canDelete}
                                t={t}
                            />
                        ))}
                    </div>
                </section>
            )}
            </SplitLayout>
        </PageWrapper>
    );
}
