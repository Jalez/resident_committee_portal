import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useFetcher } from "react-router";
import { toast } from "sonner";
import { useFormatDate } from "~/hooks/use-format-date";
import { AddItemButton } from "~/components/add-item-button";
import { PageWrapper, SplitLayout } from "~/components/layout/page-layout";
import { RelationsColumn } from "~/components/relations-column";
import { SearchMenu } from "~/components/search-menu";
import { Button } from "~/components/ui/button";
import { ConfirmDialog } from "~/components/ui/confirm-dialog";
import { EmptyState } from "~/components/ui/empty-state";
import { useUser } from "~/contexts/user-context";
import { getDatabase } from "~/db/server.server";
import { getAuthenticatedUser, getGuestContext } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import type { RelationBadgeData } from "~/lib/relations-column.server";
import { loadRelationsMapForEntities } from "~/lib/relations-column.server";
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

	// Load relations for all news items (same pattern as events index)
	const newsIds = items.map((item) => item.id);
	const relationsMapRaw = await loadRelationsMapForEntities(
		db,
		"news",
		newsIds,
		undefined,
		permissions,
	);

	// Convert Map to plain object for serialization over the loader boundary
	const relationsMap: Record<string, RelationBadgeData[]> = {};
	for (const [id, badges] of relationsMapRaw.entries()) {
		relationsMap[id] = badges;
	}

	return {
		siteConfig: SITE_CONFIG,
		items,
		searchQ: url.searchParams.get("q") || "",
		systemLanguages,
		relationsMap,
	};
}

// Deletion is now handled by /api/news/:newsId/delete

export default function News({ loaderData }: Route.ComponentProps) {
	const { items, searchQ, systemLanguages, relationsMap } = loaderData;
	const { t, i18n } = useTranslation();
	const { formatDate } = useFormatDate();
	const { hasPermission } = useUser();
	const canWrite = hasPermission("news:write");
	const canUpdate = hasPermission("news:update");
	const canDelete = hasPermission("news:delete");
	const canExport = hasPermission("news:export");
	const canImport = hasPermission("news:import");
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
				canExport={canExport}
				canImport={canImport}
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
				<div className="space-y-6 pb-12">
					{items.length === 0 ? (
						<EmptyState
							message={searchQ ? t("news.no_results") : t("news.empty")}
							icon="article"
						/>
					) : (
						<div className="divide-y divide-gray-100 dark:divide-gray-800">
							{items.map((item) => {
								const title =
									useSecondary && item.titleSecondary
										? item.titleSecondary
										: item.title;
								const summary =
									useSecondary && item.summarySecondary
										? item.summarySecondary
										: item.summary;
								const relations = (relationsMap as any)?.[item.id] || [];
								return (
									<div
										key={item.id}
										className="group flex items-start gap-6 py-6 first:pt-0"
									>
										<div className="min-w-0 flex-1">
											<div className="flex items-center gap-3 mb-1">
												<span className="text-sm font-medium text-gray-500 dark:text-gray-500 flex items-center gap-1.5">
													<span className="material-symbols-outlined text-base">calendar_today</span>
													{formatDate(new Date(item.createdAt))}
												</span>
												{(item as any).status === "draft" && (
													<span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
														{t("common.status.draft", "Draft")}
													</span>
												)}
												{relations.length > 0 && (
													<RelationsColumn relations={relations} />
												)}
											</div>
											<Link
												to={`/news/${item.id}`}
												className="block"
											>
												<h3 className="text-xl font-bold text-gray-900 dark:text-white group-hover:text-primary transition-colors leading-tight">
													{title}
												</h3>
											</Link>
											{summary && (
												<p className="mt-1 text-gray-600 dark:text-gray-400 line-clamp-2 leading-relaxed">
													{summary}
												</p>
											)}
										</div>

										<div className="flex items-center gap-1 shrink-0">
											{canUpdate && (
												<Link
													to={`/news/${item.id}/edit`}
													className="p-2 text-gray-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
													title={t("common.actions.edit")}
												>
													<span className="material-symbols-outlined text-lg">edit</span>
												</Link>
											)}
											{canDelete && (
												<button
													type="button"
													onClick={() => setDeleteConfirmId(item.id)}
													className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
													title={t("common.actions.delete")}
												>
													<span className="material-symbols-outlined text-lg">delete</span>
												</button>
											)}
										</div>
									</div>
								);
							})}
						</div>
					)}
				</div>
			</SplitLayout>
		</PageWrapper>
	);
}
