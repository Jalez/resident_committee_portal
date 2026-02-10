import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { PageWrapper, SplitLayout } from "~/components/layout/page-layout";
import { Button } from "~/components/ui/button";
import { getDatabase } from "~/db";
import {
    getAuthenticatedUser,
    getGuestContext,
} from "~/lib/auth.server";
import { getSystemLanguageDefaults } from "~/lib/settings.server";
import { SITE_CONFIG } from "~/lib/config.server";
import { useUser } from "~/contexts/user-context";
import type { Route } from "./+types/news.$newsId";

export function meta({ data }: Route.MetaArgs) {
    return [
        {
            title: `${data?.siteConfig?.name || "Portal"} - ${data?.item?.title ?? "News"}`,
        },
        { name: "robots", content: "noindex" },
    ];
}

export async function loader({ request, params }: Route.LoaderArgs) {
    const authUser = await getAuthenticatedUser(request, getDatabase);
    let permissions: string[];
    if (authUser) {
        permissions = authUser.permissions;
    } else {
        const guestContext = await getGuestContext(() => getDatabase());
        permissions = guestContext.permissions;
    }
    const canRead = permissions.some((p) => p === "news:read" || p === "*");
    if (!canRead) {
        throw new Response("Not Found", { status: 404 });
    }
    const db = getDatabase();
    const item = await db.getNewsById(params.newsId);
    if (!item) {
        throw new Response("Not Found", { status: 404 });
    }
    const systemLanguages = await getSystemLanguageDefaults();

    return {
        siteConfig: SITE_CONFIG,
        item,
        systemLanguages,
    };
}

export default function NewsView({ loaderData }: Route.ComponentProps) {
    const { item, systemLanguages } = loaderData;
    const { t, i18n } = useTranslation();
    const { hasPermission } = useUser();
    const canUpdate = hasPermission("news:update");

    const useSecondary =
        systemLanguages.secondary &&
        systemLanguages.secondary === i18n.language;

    const title =
        useSecondary && item.titleSecondary
            ? item.titleSecondary
            : item.title;
    const summary =
        useSecondary && item.summarySecondary
            ? item.summarySecondary
            : item.summary;
    const content =
        useSecondary && item.contentSecondary
            ? item.contentSecondary
            : item.content;

    const headerPrimary = title;
    const headerSecondary = useSecondary ? item.title : (item.titleSecondary || title);

    return (
        <PageWrapper>
            <SplitLayout
                header={{
                    primary: headerPrimary,
                    secondary: headerSecondary,
                }}
            >
                <div className="max-w-2xl space-y-6">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-sm border border-gray-200 dark:border-gray-700 space-y-6">
                        <div className="space-y-4">
                            <h1 className="text-3xl font-bold text-gray-900 dark:text-white leading-tight">
                                {title}
                            </h1>
                            {summary && (
                                <p className="text-lg text-gray-600 dark:text-gray-400 font-medium border-l-4 border-primary pl-4 py-1">
                                    {summary}
                                </p>
                            )}
                        </div>

                        <div className="prose dark:prose-invert max-w-none whitespace-pre-wrap text-gray-700 dark:text-gray-300 text-lg leading-relaxed">
                            {content}
                        </div>

                        <div className="pt-6 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between text-sm text-gray-500">
                            <span>{new Date(item.createdAt).toLocaleDateString(i18n.language === "fi" ? "fi-FI" : "en-US")}</span>
                            {canUpdate && (
                                <Button variant="outline" size="sm" asChild>
                                    <Link to={`/news/${item.id}/edit`}>
                                        <span className="material-symbols-outlined mr-2 text-sm">edit</span>
                                        {t("news.edit")}
                                    </Link>
                                </Button>
                            )}
                        </div>
                    </div>

                    <div className="flex justify-start">
                        <Button variant="ghost" asChild>
                            <Link to="/news" className="flex items-center">
                                <span className="material-symbols-outlined mr-2">arrow_back</span>
                                {t("common.actions.back")}
                            </Link>
                        </Button>
                    </div>
                </div>
            </SplitLayout>
        </PageWrapper>
    );
}
