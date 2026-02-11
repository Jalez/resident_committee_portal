import { list } from "@vercel/blob";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLoaderData, useRevalidator } from "react-router";
import { toast } from "sonner";
import { PageWrapper, SplitLayout } from "~/components/layout/page-layout";
import { Button } from "~/components/ui/button";
import { ConfirmDialog } from "~/components/ui/confirm-dialog";
import { Thumbnail } from "~/components/ui/thumbnail";
import { getDatabase } from "~/db";
import { requireAnyPermission } from "~/lib/auth.server";
import { getAvatarsPrefix } from "~/lib/avatars/utils";
import { SITE_CONFIG } from "~/lib/config.server";
import { getSystemLanguageDefaults } from "~/lib/settings.server";
import type { Route } from "./+types/_index";

export function meta({ data }: Route.MetaArgs) {
	return [
		{
			title: `${data?.siteConfig?.name ?? "Portal"} - Avatars`,
		},
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request }: Route.LoaderArgs) {
	await requireAnyPermission(
		request,
		["admin:storage:read", "avatars:read"],
		getDatabase,
	);
	const prefix = getAvatarsPrefix();
	const { blobs } = await list({ prefix, limit: 500 });
	const systemLanguages = await getSystemLanguageDefaults();
	return {
		siteConfig: SITE_CONFIG,
		blobs: blobs.map((b) => ({
			pathname: b.pathname,
			url: b.url,
		})),
		systemLanguages,
	};
}

export default function AdminStorageAvatars() {
	const { blobs, systemLanguages } = useLoaderData<typeof loader>();
	const revalidator = useRevalidator();
	const { t } = useTranslation();
	const [deletingPathname, setDeletingPathname] = useState<string | null>(null);
	const [deleteConfirmPathname, setDeleteConfirmPathname] = useState<
		string | null
	>(null);

	const doDelete = useCallback(
		async (pathname: string) => {
			setDeletingPathname(pathname);
			try {
				const res = await fetch("/api/avatars/delete", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ pathname }),
				});
				if (!res.ok) {
					const data = await res.json().catch(() => ({}));
					toast.error(data?.error ?? t("admin.storage.avatars.delete_error"));
					return;
				}
				toast.success(t("admin.storage.avatars.delete_success"));
				revalidator.revalidate();
			} finally {
				setDeletingPathname(null);
			}
		},
		[t, revalidator],
	);

	const handleDeleteClick = useCallback((pathname: string) => {
		setDeleteConfirmPathname(pathname);
	}, []);

	return (
		<PageWrapper>
			<ConfirmDialog
				open={deleteConfirmPathname !== null}
				onOpenChange={(open) => !open && setDeleteConfirmPathname(null)}
				title={t("common.actions.delete")}
				description={t("admin.storage.avatars.delete_confirm")}
				confirmLabel={t("common.actions.delete")}
				cancelLabel={t("common.actions.cancel")}
				variant="destructive"
				onConfirm={() => {
					if (deleteConfirmPathname) {
						doDelete(deleteConfirmPathname);
						setDeleteConfirmPathname(null);
					}
				}}
			/>
			<SplitLayout
				header={{
					primary: t("admin.storage.avatars.title", {
						lng: systemLanguages.primary,
						defaultValue: "Avatars",
					}),
					secondary: t("admin.storage.avatars.title", {
						lng: systemLanguages.secondary ?? systemLanguages.primary,
						defaultValue: "Avatars",
					}),
				}}
			>
				<p className="text-muted-foreground mb-6 -mt-6">
					{t("admin.storage.avatars.description", {
						defaultValue: "All user avatar images stored in the system.",
					})}
				</p>

				<div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
					{blobs.length === 0 ? (
						<div className="p-8 text-center text-gray-500">
							<span className="material-symbols-outlined text-4xl text-gray-300 dark:text-gray-600">
								account_circle
							</span>
							<p className="mt-2 font-medium">
								{t("admin.storage.avatars.empty", {
									defaultValue: "No avatars",
								})}
							</p>
						</div>
					) : (
						<ul className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
							{blobs.map((blob) => (
								<li
									key={blob.pathname}
									className="group flex flex-col rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-800/50"
								>
									<div className="relative aspect-square bg-gray-100 dark:bg-gray-900 flex items-center justify-center p-2">
										<Thumbnail
											src={blob.url}
											alt=""
											objectFit="cover"
											imgClassName="rounded-lg"
										/>
										<Button
											type="button"
											variant="destructive"
											size="sm"
											className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
											disabled={deletingPathname === blob.pathname}
											onClick={() => handleDeleteClick(blob.pathname)}
										>
											{deletingPathname === blob.pathname
												? t("common.actions.loading", { defaultValue: "..." })
												: t("admin.storage.avatars.delete", {
														defaultValue: "Delete",
													})}
										</Button>
									</div>
									<div className="p-2">
										<p
											className="text-xs font-mono text-muted-foreground truncate"
											title={blob.pathname}
										>
											{blob.pathname}
										</p>
									</div>
								</li>
							))}
						</ul>
					)}
				</div>
			</SplitLayout>
		</PageWrapper>
	);
}
