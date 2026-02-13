import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLoaderData, useRevalidator } from "react-router";
import { toast } from "sonner";
import { PageWrapper, SplitLayout } from "~/components/layout/page-layout";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { ConfirmDialog } from "~/components/ui/confirm-dialog";
import { Thumbnail } from "~/components/ui/thumbnail";
import { getDatabase } from "~/db/server.server";
import { requireAnyPermission } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import { getMinuteStorage } from "~/lib/minutes/storage.server";
import { getSystemLanguageDefaults } from "~/lib/settings.server";
import type { Route } from "./+types/_index";

export function meta({ data }: Route.MetaArgs) {
	return [
		{
			title: `${data?.siteConfig?.name ?? "Portal"} - Minutes Gallery`,
		},
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request }: Route.LoaderArgs) {
	await requireAnyPermission(request, ["admin:storage:read"], getDatabase);

	const storage = getMinuteStorage();
	const minuteFiles = await storage.listMinutes();

	// Normalize file objects
	const allFiles = minuteFiles.map((f) => ({
		pathname: f.pathname,
		url: f.url,
		name: f.pathname.split("/").pop() || f.pathname,
	}));

	const db = getDatabase();
	const dbMinutes = await db.getMinutes();
	const dbByPathname = new Map(dbMinutes.map((m) => [m.fileKey, m]));

	const items = allFiles.map((file) => {
		const minute = dbByPathname.get(file.pathname);
		const isLinked = !!minute;

		return {
			pathname: file.pathname,
			url: file.url,
			name: file.name,
			isLinked,
			minuteId: minute?.id ?? null,
			minuteDate: minute?.date
				? new Date(minute.date).toISOString().split("T")[0]
				: null,
			minuteTitle: minute?.title ?? null,
		};
	});

	//Sort by name desc (usually dates)
	items.sort((a, b) => b.name.localeCompare(a.name));

	const systemLanguages = await getSystemLanguageDefaults();

	return {
		siteConfig: SITE_CONFIG,
		items,
		systemLanguages,
	};
}

export async function action({ request }: Route.ActionArgs) {
	// Reuse receipt delete logic? Or strictly minute delete?
	// Receipts deletion is likely an API route.
	// We should implement delete here or reuse a generic delete API if available.
	// Receipts uses `/api/receipts/delete`. We should probably create `/api/minutes/delete`?
	// Or just handle it in this action.

	await requireAnyPermission(
		request,
		["admin:storage:write", "minutes:delete"],
		getDatabase,
	);

	const formData = await request.formData();
	const pathname = formData.get("pathname") as string;

	if (!pathname) {
		return { error: "Pathname is required" };
	}

	const storage = getMinuteStorage();
	await storage.deleteFile(pathname);

	return { success: true };
}

export default function AdminStorageMinutes() {
	const { items, systemLanguages } = useLoaderData<typeof loader>();
	const revalidator = useRevalidator();
	const { t } = useTranslation();
	const [deletingPathname, setDeletingPathname] = useState<string | null>(null);
	const [deleteConfirmPathname, setDeleteConfirmPathname] = useState<
		string | null
	>(null);
	const _submit = useRevalidator(); // actually we can use useSubmit or just fetch.
	// Receipts used fetch to an API route.
	// Since I put action in this file, let's use useSubmit?
	// Actually receipts used fetch.
	// I implemented an action above. I can use useSubmit.

	const doDelete = useCallback(
		async (pathname: string) => {
			setDeletingPathname(pathname);
			try {
				const formData = new FormData();
				formData.append("pathname", pathname);
				const res = await fetch(window.location.href, {
					// POST to self
					method: "POST",
					body: formData,
				});
				if (!res.ok) {
					toast.error("Failed to delete");
					return;
				}
				toast.success("Deleted successfully");
				revalidator.revalidate();
			} catch (_e) {
				toast.error("Failed to delete");
			} finally {
				setDeletingPathname(null);
			}
		},
		[revalidator],
	);

	return (
		<PageWrapper>
			<ConfirmDialog
				open={deleteConfirmPathname !== null}
				onOpenChange={(open) => !open && setDeleteConfirmPathname(null)}
				title={t("common.actions.delete")}
				description={t(
					"admin.storage.minutes.delete_confirm",
					"Are you sure you want to delete this file? This cannot be undone.",
				)}
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
					primary: "Minutes Gallery", // TODO: Translate
					secondary: "Pöytäkirjagalleria",
				}}
			>
				<p className="text-muted-foreground mb-6 -mt-6">
					{t(
						"admin.storage.minutes.description",
						"Manage uploaded minute files. Linked files correspond to existing minute entries.",
					)}
				</p>

				<div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
					{items.length === 0 ? (
						<div className="p-8 text-center text-gray-500">
							<span className="material-symbols-outlined text-4xl text-gray-300 dark:text-gray-600">
								description
							</span>
							<p className="mt-2 font-medium">
								{t("admin.storage.minutes.empty", "No minutes found")}
							</p>
						</div>
					) : (
						<ul className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
							{items.map((item) => (
								<li
									key={item.pathname}
									className="group flex flex-col rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-800/50"
								>
									<div className="relative aspect-[4/3] bg-gray-100 dark:bg-gray-900 flex items-center justify-center p-2">
										{item.url.toLowerCase().endsWith(".pdf") ? (
											<a
												href={item.url}
												target="_blank"
												rel="noopener noreferrer"
												className="flex flex-col items-center justify-center w-full h-full text-muted-foreground hover:text-foreground"
											>
												<span className="material-symbols-outlined text-5xl mb-2">
													picture_as_pdf
												</span>
												<span className="text-xs">
													{t("common.actions.open_pdf", "Open PDF")}
												</span>
											</a>
										) : (
											<Thumbnail
												src={item.url}
												alt={item.name}
												objectFit="contain"
												imgClassName="rounded-lg"
											/>
										)}
										{item.isLinked ? (
											<Badge className="absolute top-2 right-2 bg-green-500 hover:bg-green-600">
												{t("common.status.linked", "Linked")}
											</Badge>
										) : (
											<>
												<Badge
													variant="secondary"
													className="absolute top-2 right-2 bg-yellow-500/10 text-yellow-600 hover:bg-yellow-500/20 border-yellow-200 dark:border-yellow-900"
												>
													{t("common.status.unlinked", "Unlinked")}
												</Badge>
												<Button
													type="button"
													variant="destructive"
													size="sm"
													className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
													disabled={deletingPathname === item.pathname}
													onClick={() =>
														setDeleteConfirmPathname(item.pathname)
													}
												>
													{deletingPathname === item.pathname
														? "..."
														: t("common.actions.delete")}
												</Button>
											</>
										)}
									</div>
									<div className="p-2 space-y-1">
										<p
											className="text-xs font-mono text-muted-foreground truncate"
											title={item.pathname}
										>
											{item.name}
										</p>
										{item.isLinked && (
											<div className="text-xs">
												<div className="font-semibold truncate">
													{item.minuteTitle}
												</div>
												<div className="text-muted-foreground">
													{item.minuteDate}
												</div>
												{/* Edit Link */}
												<Link
													to={`/minutes/${item.minuteId}`}
													className="text-blue-600 hover:underline"
												>
													{t("common.actions.view", "View")} &rarr;
												</Link>
											</div>
										)}
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
