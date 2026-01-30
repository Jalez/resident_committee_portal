import { useTranslation } from "react-i18next";
import { Form, Link } from "react-router";
import { PageWrapper } from "~/components/layout/page-layout";
import { SearchMenu } from "~/components/search-menu";
import { Button } from "~/components/ui/button";
import { getDatabase } from "~/db";
import {
	getAuthenticatedUser,
	getGuestContext,
	requirePermission,
} from "~/lib/auth.server";
import { getSystemLanguageDefaults } from "~/lib/settings.server";
import { SITE_CONFIG } from "~/lib/config.server";
import { useUser } from "~/contexts/user-context";
import type { Route } from "./+types/news";

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

	const db = getDatabase();
	const url = new URL(request.url);
	const q = (url.searchParams.get("q") || "").trim().toLowerCase();
	const allNews = await db.getNews();

	let items = allNews;
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

export async function action({ request }: Route.ActionArgs) {
	await requirePermission(request, "news:delete", getDatabase);
	const db = getDatabase();
	const formData = await request.formData();
	const actionType = formData.get("_action") as string;
	if (actionType === "delete") {
		const id = formData.get("id") as string;
		if (id) await db.deleteNews(id);
	}
	return { success: true };
}

export default function News({ loaderData }: Route.ComponentProps) {
	const { items, searchQ, systemLanguages } = loaderData;
	const { t, i18n } = useTranslation();
	const { hasPermission } = useUser();
	const canWrite = hasPermission("news:write");
	const canUpdate = hasPermission("news:update");
	const canDelete = hasPermission("news:delete");
	const useSecondary =
		systemLanguages.secondary && i18n.language === systemLanguages.secondary;

	return (
		<PageWrapper>
			<div className="w-full max-w-4xl mx-auto px-4">
				{/* Header - same pattern as treasury.reimbursements */}
				<div className="mb-6 flex flex-wrap items-start justify-between gap-4">
					<div>
						<h1 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white">
							{t("news.title")}
						</h1>
					</div>
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
							<Link
								to="/news/new"
								className="p-2 text-gray-500 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
								title={t("news.add")}
							>
								<span className="material-symbols-outlined text-xl">add</span>
							</Link>
						)}
					</div>
				</div>
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
										to={`/news/${item.id}/edit`}
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
											<Form method="post">
												<input type="hidden" name="_action" value="delete" />
												<input type="hidden" name="id" value={item.id} />
												<Button
													type="submit"
													variant="destructive"
													size="sm"
													onClick={(e) => {
														if (!confirm(t("news.confirm_delete"))) {
															e.preventDefault();
														}
													}}
												>
													{t("news.delete")}
												</Button>
											</Form>
										)}
									</div>
								)}
							</li>
							);
						})}
					</ul>
				)}
			</div>
			</div>
		</PageWrapper>
	);
}
