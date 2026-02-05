import { useTranslation } from "react-i18next";
import { Form, Link } from "react-router";
import { AddItemButton } from "~/components/add-item-button";
import { PageWrapper, SplitLayout } from "~/components/layout/page-layout";
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
import type { Route } from "./+types/faq";

export function meta({ data }: Route.MetaArgs) {
	return [
		{ title: `${data?.siteConfig?.name || "Portal"} - FAQ / UKK` },
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

	const canRead = permissions.some((p) => p === "faq:read" || p === "*");
	if (!canRead) {
		throw new Response("Not Found", { status: 404 });
	}

	const db = getDatabase();
	const url = new URL(request.url);
	const q = (url.searchParams.get("q") || "").trim().toLowerCase();
	const allFaqs = await db.getFaqs();

	let items = allFaqs;
	if (q) {
		items = items.filter(
			(item) =>
				item.question.toLowerCase().includes(q) ||
				item.answer.toLowerCase().includes(q) ||
				(item.questionSecondary || "").toLowerCase().includes(q) ||
				(item.answerSecondary || "").toLowerCase().includes(q),
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
	await requirePermission(request, "faq:delete", getDatabase);
	const db = getDatabase();
	const formData = await request.formData();
	const actionType = formData.get("_action") as string;
	if (actionType === "delete") {
		const id = formData.get("id") as string;
		if (id) await db.deleteFaq(id);
	}
	return { success: true };
}

export default function Faq({ loaderData }: Route.ComponentProps) {
	const { items, searchQ, systemLanguages } = loaderData;
	const { t, i18n } = useTranslation();
	const { hasPermission } = useUser();
	const canWrite = hasPermission("faq:write");
	const canUpdate = hasPermission("faq:update");
	const canDelete = hasPermission("faq:delete");
	const useSecondary =
		systemLanguages.secondary && i18n.language === systemLanguages.secondary;

	return (
		<PageWrapper>
			<SplitLayout
				header={{
					primary: t("faq.title", { lng: systemLanguages.primary }),
					secondary: t("faq.title", { lng: systemLanguages.secondary ?? systemLanguages.primary }),
				}}
				footer={
					<div className="flex items-center gap-2">
						<SearchMenu
							fields={[
								{
									name: "q",
									label: t("faq.search_placeholder"),
									type: "text",
									placeholder: t("faq.search_placeholder"),
								},
							]}
						/>
						{canWrite && (
							<AddItemButton
								to="/faq/new"
								title={t("faq.add")}
								variant="icon"
							/>
						)}
					</div>
				}
			>
				<div className="space-y-4">
				{items.length === 0 ? (
					<div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-8 text-center">
						<p className="text-gray-600 dark:text-gray-400">
							{searchQ ? t("faq.no_results") : t("faq.empty")}
						</p>
					</div>
				) : (
					<ul className="divide-y divide-gray-200 dark:divide-gray-700">
						{items.map((item) => {
							const question =
								useSecondary && item.questionSecondary
									? item.questionSecondary
									: item.question;
							const answer =
								useSecondary && item.answerSecondary
									? item.answerSecondary
									: item.answer;
							return (
							<li
								key={item.id}
								className="py-4 flex items-start justify-between gap-4"
							>
								<div className="min-w-0 flex-1">
									<Link
										to={`/faq/${item.id}/edit`}
										className="font-semibold text-gray-900 dark:text-white hover:underline"
									>
										{question}
									</Link>
									<p className="mt-1 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
										{answer}
									</p>
								</div>
								{(canUpdate || canDelete) && (
									<div className="flex items-center gap-2 shrink-0">
										{canUpdate && (
											<Button variant="outline" size="sm" asChild>
												<Link to={`/faq/${item.id}/edit`}>
													{t("faq.edit")}
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
														if (!confirm(t("faq.confirm_delete"))) {
															e.preventDefault();
														}
													}}
												>
													{t("faq.delete")}
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
			</SplitLayout>
		</PageWrapper>
	);
}
