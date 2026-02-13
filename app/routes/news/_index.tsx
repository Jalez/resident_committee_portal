import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useFetcher } from "react-router";
import { AddItemButton } from "~/components/add-item-button";
import { PageWrapper, SplitLayout } from "~/components/layout/page-layout";
import { SearchMenu } from "~/components/search-menu";
import { Button } from "~/components/ui/button";
import { ConfirmDialog } from "~/components/ui/confirm-dialog";
import { useUser } from "~/contexts/user-context";
import { getDatabase } from "~/db/server.server";
import { getAuthenticatedUser, getGuestContext } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import { getSystemLanguageDefaults } from "~/lib/settings.server";
import type { Route } from "./+types/_index";

export function meta({ data }: Route.MetaArgs) {
	return [
		{ title: `${data?.siteConfig?.name || "Portal"} - News / Uutiset` },
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request }: Route.LoaderArgs) {
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

	const canWrite = permissions.some((p) => p === "news:write" || p === "*");

	const db = getDatabase();
	const url = new URL(request.url);
	const q = (url.searchParams.get("q") || "").trim().toLowerCase();
	const allNews = await db.getNews();

	let items = allNews;

	// Filter drafts for non-staff
	if (!canWrite) {
		items = items.filter((item) => (item as any).status !== "draft");
	}
	if (q) {
		items = items.filter(
			(item) =>
				item.title.toLowerCase().includes(q) ||
				(item.summary || "").toLowerCase().includes(q) ||
				item.content.toLowerCase().includes(q) ||
				(item.titleSecondary || "").toLowerCase().includes(q) ||
				(item.summarySecondary || "").toLowerCase().includes(q) ||
				(item.contentSecondary || "").toLowerCase().includes(q),
		);
	}

	const systemLanguages = await getSystemLanguageDefaults();
	return {
		siteConfig: SITE_CONFIG,
		items,
		searchQ: url.searchParams.get("q") || "",
		systemLanguages,
	};
}

// Deletion is now handled by /api/news/:newsId/delete

export default function News({ loaderData }: Route.ComponentProps) {
	const { items, searchQ, systemLanguages } = loaderData;
	const { t, i18n } = useTranslation();
	const { hasPermission } = useUser();
	const canWrite = hasPermission("news:write");
	const canUpdate = hasPermission("news:update");
	const canDelete = hasPermission("news:delete");
	const useSecondary =
		systemLanguages.secondary && i18n.language === systemLanguages.secondary;
	const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
	const _deleteFormRef = useRef<HTMLFormElement>(null);

	const deleteFetcher = useFetcher();

	return (
		<PageWrapper>
			<ConfirmDialog
				open={deleteConfirmId !== null}
				onOpenChange={(open) => !open && setDeleteConfirmId(null)}
				title={t("common.actions.delete")}
				description={t("news.confirm_delete")}
				confirmLabel={t("common.actions.delete")}
				cancelLabel={t("common.actions.cancel")}
				variant="destructive"
				onConfirm={() => {
					if (deleteConfirmId) {
						deleteFetcher.submit(null, {
							method: "DELETE",
							action: `/news/${deleteConfirmId}/delete`,
						});
						setDeleteConfirmId(null);
					}
				}}
				loading={deleteFetcher.state !== "idle"}
			/>
			<SplitLayout
				header={{
					primary: t("news.title", { lng: systemLanguages.primary }),
					secondary: t("news.title", {
						lng: systemLanguages.secondary ?? systemLanguages.primary,
					}),
				}}
				footer={
					<div className="flex items-center gap-2">
						<SearchMenu
							fields={[
								{
									name: "q",
									label: t("news.search_placeholder"),
									type: "text",
									placeholder: t("news.search_placeholder"),
								},
							]}
						/>
						{canWrite && (
							<AddItemButton
								title={t("news.add")}
								variant="icon"
								createType="news"
							/>
						)}
					</div>
				}
			>
				<div className="space-y-4">
					{items.length === 0 ? (
						<div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-8 text-center">
							<p className="text-gray-600 dark:text-gray-400">
								{searchQ ? t("news.no_results") : t("news.empty")}
							</p>
						</div>
					) : (
						<ul className="divide-y divide-gray-200 dark:divide-gray-700">
							{items.map((item) => {
								const title =
									useSecondary && item.titleSecondary
										? item.titleSecondary
										: item.title;
								const summary =
									useSecondary && item.summarySecondary
										? item.summarySecondary
										: item.summary;
								return (
									<li
										key={item.id}
										className="py-4 flex items-start justify-between gap-4"
									>
										<div className="min-w-0 flex-1">
											<Link
												to={`/news/${item.id}`}
												className="font-semibold text-gray-900 dark:text-white hover:underline"
											>
												{title}
											</Link>
											{summary && (
												<p className="mt-1 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
													{summary}
												</p>
											)}
											<p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
												{new Date(item.createdAt).toLocaleDateString()}
											</p>
										</div>
										{(canUpdate || canDelete) && (
											<div className="flex items-center gap-2 shrink-0">
												{canUpdate && (
													<Button variant="outline" size="sm" asChild>
														<Link to={`/news/${item.id}/edit`}>
															{t("news.edit")}
														</Link>
													</Button>
												)}
												{canDelete && (
													<Button
														type="button"
														variant="destructive"
														size="sm"
														onClick={() => setDeleteConfirmId(item.id)}
													>
														{t("news.delete")}
													</Button>
												)}
											</div>
										)}
									</li>
								);
							})}
						</ul>
					)}
				</div>
			</SplitLayout>
		</PageWrapper>
	);
}
