import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useFetcher, useRevalidator } from "react-router";
import { toast } from "sonner";
import { AddItemButton } from "~/components/add-item-button";
import { PageWrapper, SplitLayout } from "~/components/layout/page-layout";
import { SearchMenu } from "~/components/search-menu";
import { Button } from "~/components/ui/button";
import { ConfirmDialog } from "~/components/ui/confirm-dialog";
import { EmptyState } from "~/components/ui/empty-state";
import { useUser } from "~/contexts/user-context";
import { getDatabase } from "~/db/server.server";
import { getAuthenticatedUser, getGuestContext } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import { getSystemLanguageDefaults } from "~/lib/settings.server";
import type { Route } from "./+types/_index";

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

	const canWrite = permissions.some((p) => p === "faq:write" || p === "*");

	const db = getDatabase();
	const url = new URL(request.url);
	const q = (url.searchParams.get("q") || "").trim().toLowerCase();
	const allFaqs = await db.getFaqs();

	let items = allFaqs;

	// Filter drafts for non-staff
	if (!canWrite) {
		items = items.filter((item) => (item as any).status !== "draft");
	}
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

export default function Faq({ loaderData }: Route.ComponentProps) {
	const { items, searchQ, systemLanguages } = loaderData;
	const { t, i18n } = useTranslation();
	const { hasPermission } = useUser();
	const canWrite = hasPermission("faq:write");
	const canUpdate = hasPermission("faq:update");
	const canDelete = hasPermission("faq:delete");
	const useSecondary =
		systemLanguages.secondary && i18n.language === systemLanguages.secondary;
	const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
	const _deleteFormRef = useRef<HTMLFormElement>(null);

	const deleteFetcher = useFetcher();
	const revalidator = useRevalidator();
	const deleteProcessedRef = useRef(false);

	useEffect(() => {
		if (
			deleteFetcher.state === "idle" &&
			deleteFetcher.data &&
			!deleteProcessedRef.current
		) {
			deleteProcessedRef.current = true;
			if (deleteFetcher.data.success) {
				toast.success(t("common.actions.deleted", "Deleted successfully"));
				revalidator.revalidate();
			} else if (deleteFetcher.data.error) {
				toast.error(deleteFetcher.data.error as string);
			}
		}
	}, [deleteFetcher.state, deleteFetcher.data, revalidator, t]);

	return (
		<PageWrapper>
			<ConfirmDialog
				open={deleteConfirmId !== null}
				onOpenChange={(open) => !open && setDeleteConfirmId(null)}
				title={t("common.actions.delete")}
				description={t("faq.confirm_delete")}
				confirmLabel={t("common.actions.delete")}
				cancelLabel={t("common.actions.cancel")}
				variant="destructive"
				onConfirm={() => {
					if (deleteConfirmId) {
						deleteProcessedRef.current = false;
						deleteFetcher.submit(null, {
							method: "DELETE",
							action: `/faq/${deleteConfirmId}/delete`,
						});
						setDeleteConfirmId(null);
					}
				}}
				loading={deleteFetcher.state !== "idle"}
			/>
			<SplitLayout
				header={{
					primary: t("faq.title", { lng: systemLanguages.primary }),
					secondary: t("faq.title", {
						lng: systemLanguages.secondary ?? systemLanguages.primary,
					}),
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
								title={t("faq.add")}
								variant="icon"
								createType="faq"
							/>
						)}
					</div>
				}
			>
				<div className="space-y-4">
					{items.length === 0 ? (
						<EmptyState
							message={searchQ ? t("faq.no_results") : t("faq.empty")}
							icon="help"
						/>
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
												to={`/faq/${item.id}`}
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
													<Button
														type="button"
														variant="destructive"
														size="sm"
														onClick={() => setDeleteConfirmId(item.id)}
													>
														{t("faq.delete")}
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
