import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLoaderData, useRevalidator } from "react-router";
import { toast } from "sonner";
import { PageWrapper, SplitLayout } from "~/components/layout/page-layout";
import { Thumbnail } from "~/components/ui/thumbnail";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { ConfirmDialog } from "~/components/ui/confirm-dialog";
import { getDatabase } from "~/db";
import { requireAnyPermission } from "~/lib/auth.server";
import { getReceiptStorage } from "~/lib/receipts";
import { SITE_CONFIG } from "~/lib/config.server";
import { getSystemLanguageDefaults } from "~/lib/settings.server";
import { TREASURY_PURCHASE_STATUS_VARIANTS } from "~/components/treasury/colored-status-link-badge";
import type { Route } from "./+types/admin.storage.receipts";

export function meta({ data }: Route.MetaArgs) {
	return [
		{
			title: `${data?.siteConfig?.name ?? "Portal"} - Receipt Gallery`,
		},
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request }: Route.LoaderArgs) {
	await requireAnyPermission(
		request,
		["admin:storage:read"],
		getDatabase,
	);

	const storage = getReceiptStorage();
	const receiptsByYear = await storage.listReceiptsByYear();
	const allFiles = receiptsByYear.flatMap((r) =>
		r.files.map((f) => ({ pathname: f.id, url: f.url, name: f.name })),
	);

	const db = getDatabase();
	const dbReceipts = await db.getReceipts();
	const dbByPathname = new Map(dbReceipts.map((r) => [r.pathname, r]));

	const purchaseIds = [
		...new Set(
			dbReceipts
				.map((r) => r.purchaseId)
				.filter((id): id is string => Boolean(id)),
		),
	];
	const purchasesMap = new Map<string, { status: string }>();
	for (const id of purchaseIds) {
		const p = await db.getPurchaseById(id);
		if (p) purchasesMap.set(id, { status: p.status });
	}

	const items = allFiles.map((file) => {
		const receipt = dbByPathname.get(file.pathname);
		const isLinked = Boolean(receipt?.purchaseId);
		const purchaseStatus = receipt?.purchaseId
			? purchasesMap.get(receipt.purchaseId)?.status ?? "pending"
			: null;
		return {
			pathname: file.pathname,
			url: file.url,
			name: file.name,
			isLinked,
			purchaseId: receipt?.purchaseId ?? null,
			purchaseStatus,
		};
	});

	const systemLanguages = await getSystemLanguageDefaults();

	return {
		siteConfig: SITE_CONFIG,
		items,
		systemLanguages,
	};
}

export default function AdminStorageReceipts() {
	const { items, systemLanguages } = useLoaderData<typeof loader>();
	const revalidator = useRevalidator();
	const { t } = useTranslation();
	const [deletingPathname, setDeletingPathname] = useState<string | null>(null);
	const [deleteConfirmPathname, setDeleteConfirmPathname] = useState<string | null>(null);

	const doDelete = useCallback(
		async (pathname: string) => {
			setDeletingPathname(pathname);
			try {
				const res = await fetch("/api/receipts/delete", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ pathname }),
				});
				if (!res.ok) {
					const data = await res.json().catch(() => ({}));
					toast.error(data?.error ?? t("admin.storage.receipts.delete_error"));
					return;
				}
				toast.success(t("admin.storage.receipts.delete_success"));
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
				description={t("admin.storage.receipts.delete_confirm")}
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
					primary: t("admin.storage.receipts.title", {
						lng: systemLanguages.primary,
						defaultValue: "Receipt Gallery",
					}),
					secondary: t("admin.storage.receipts.title", {
						lng: systemLanguages.secondary ?? systemLanguages.primary,
						defaultValue: "Receipt Gallery",
					}),
				}}
			>
				<p className="text-muted-foreground mb-6 -mt-6">
					{t("admin.storage.receipts.description", {
						defaultValue:
							"All receipt files. Linked receipts are attached to a reimbursement request and cannot be deleted.",
					})}
				</p>

				<div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
					{items.length === 0 ? (
						<div className="p-8 text-center text-gray-500">
							<span className="material-symbols-outlined text-4xl text-gray-300 dark:text-gray-600">
								receipt_long
							</span>
							<p className="mt-2 font-medium">
								{t("admin.storage.receipts.empty", {
									defaultValue: "No receipts",
								})}
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
													{t("admin.storage.receipts.open_pdf")}
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
											<Badge
												className={`absolute top-2 right-2 ${TREASURY_PURCHASE_STATUS_VARIANTS[
													item.purchaseStatus ?? "pending"
												] ?? ""
													}`}
											>
												{t("admin.storage.receipts.linked", {
													defaultValue: "Linked",
												})}
											</Badge>
										) : (
											<>
												<Badge
													variant="secondary"
													className="absolute top-2 right-2"
												>
													{t("admin.storage.receipts.unlinked", {
														defaultValue: "Unlinked",
													})}
												</Badge>
												<Button
													type="button"
													variant="destructive"
													size="sm"
													className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
													disabled={deletingPathname === item.pathname}
													onClick={() => handleDeleteClick(item.pathname)}
												>
													{deletingPathname === item.pathname
														? t("common.actions.loading", {
															defaultValue: "...",
														})
														: t("receipts.delete")}
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
										{item.isLinked && item.purchaseId && (
											<Link
												to={`/treasury/reimbursements/${item.purchaseId}`}
												className="text-xs text-blue-600 hover:underline"
											>
												{t("admin.storage.receipts.reimbursement_request")} →
											</Link>
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
