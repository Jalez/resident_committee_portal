import { upload } from "@vercel/blob/client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	Link,
	useLoaderData,
	useRevalidator,
} from "react-router";
import { toast } from "sonner";
import { ReceiptsGridSkeletonOnly } from "~/components/treasury/receipts-skeleton";
import { Thumbnail } from "~/components/ui/thumbnail";
import { PageWrapper } from "~/components/layout/page-layout";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { getDatabase } from "~/db";
import { RECEIPT_ALLOWED_TYPES } from "~/lib/constants";
import { getReceiptsByYear } from "~/lib/receipts";
import { buildReceiptPath } from "~/lib/receipts/utils";
import {
	hasAnyPermission,
	requireAnyPermission,
} from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import type { Route } from "./+types/treasury.receipts";

const THUMBNAIL_WIDTH = 200;

export function meta({ data }: Route.MetaArgs) {
	return [
		{
			title: `${data?.siteConfig?.name ?? "Portal"} - Kuitit / Receipts`,
		},
		{ name: "robots", content: "noindex" } as const,
	];
}

export async function loader({ request }: Route.LoaderArgs) {
	const user = await requireAnyPermission(request, [
		"treasury:read",
		"reimbursements:write",
		"transactions:write",
		"inventory:write",
	], getDatabase);
	const receiptsByYear = await getReceiptsByYear();
	const canWrite = hasAnyPermission(user, [
		"reimbursements:write",
		"transactions:write",
		"inventory:write",
	]);
	return {
		siteConfig: SITE_CONFIG,
		receiptsByYear,
		canWrite,
	};
}

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

function isImageReceipt(name: string): boolean {
	const ext = name.includes(".") ? `.${name.split(".").pop()?.toLowerCase()}` : "";
	return IMAGE_EXTENSIONS.has(ext);
}

export default function TreasuryReceipts() {
	const { receiptsByYear, canWrite } = useLoaderData<typeof loader>();
	const revalidator = useRevalidator();
	const { t } = useTranslation();
	const [selectedYear, setSelectedYear] = useState<string>(() => {
		const current = new Date().getFullYear().toString();
		const hasCurrent = receiptsByYear.some((r) => r.year === current);
		return hasCurrent ? current : (receiptsByYear[0]?.year ?? current);
	});
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editValue, setEditValue] = useState("");
	const [isUploading, setIsUploading] = useState(false);
	const [deletingId, setDeletingId] = useState<string | null>(null);
	const [optimisticReceipts, setOptimisticReceipts] = useState<
		Map<string, { id: string; name: string; url: string; createdTime: string }[]>
	>(new Map());
	const fileInputRef = useRef<HTMLInputElement>(null);

	const yearData = receiptsByYear.find((r) => r.year === selectedYear);
	const serverFiles = yearData?.files ?? [];
	const optimisticForYear = optimisticReceipts.get(selectedYear) ?? [];
	const serverIds = new Set(serverFiles.map((f) => f.id));
	const optimisticOnly = optimisticForYear.filter((o) => !serverIds.has(o.id));
	const receipts = [...serverFiles, ...optimisticOnly];

	// Prune optimistic receipts once they appear in server data
	useEffect(() => {
		if (optimisticReceipts.size === 0) return;
		setOptimisticReceipts((prev) => {
			const next = new Map(prev);
			for (const [year, list] of next) {
				const serverIds = new Set(
					receiptsByYear.find((r) => r.year === year)?.files.map((f) => f.id) ?? [],
				);
				const kept = list.filter((o) => !serverIds.has(o.id));
				if (kept.length === 0) next.delete(year);
				else next.set(year, kept);
			}
			return next;
		});
	}, [receiptsByYear, optimisticReceipts.size]);

	const handleRename = useCallback(
		async (pathname: string, newName: string) => {
			if (!newName.trim()) return;
			const res = await fetch("/api/receipts/rename", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ pathname, newName: newName.trim() }),
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				toast.error(data?.error ?? t("treasury.receipts.rename_error"));
				return;
			}
			toast.success(t("treasury.receipts.rename_success"));
			setEditingId(null);
			setEditValue("");
			revalidator.revalidate();
		},
		[t, revalidator],
	);

	const handleDelete = useCallback(
		async (pathname: string) => {
			if (!canWrite) return;
			if (!window.confirm(t("treasury.receipts.delete_confirm"))) return;
			setDeletingId(pathname);
			try {
				const res = await fetch("/api/receipts/delete", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ pathname }),
				});
				if (!res.ok) {
					const data = await res.json().catch(() => ({}));
					toast.error(data?.error ?? t("treasury.receipts.delete_error"));
					return;
				}
				toast.success(t("treasury.receipts.delete_success"));
				revalidator.revalidate();
			} finally {
				setDeletingId(null);
			}
		},
		[canWrite, t, revalidator],
	);

	const handleUpload = useCallback(
		async (file: File) => {
			const pathname = buildReceiptPath(selectedYear, file.name, "kuitti");
			setIsUploading(true);
			try {
				const blob = await upload(pathname, file, {
					access: "public",
					handleUploadUrl: "/api/receipts/upload",
				});
				const name = blob.pathname.split("/").pop() ?? file.name;
				const newReceipt = {
					id: blob.pathname,
					name,
					url: blob.url,
					createdTime: new Date().toISOString(),
				};
				setOptimisticReceipts((prev) => {
					const next = new Map(prev);
					const list = next.get(selectedYear) ?? [];
					next.set(selectedYear, [...list, newReceipt]);
					return next;
				});
				toast.success(t("treasury.receipts.upload_success"));
				revalidator.revalidate(); // Sync in background; optimistic add avoids full reload
			} catch (e) {
				console.error(e);
				toast.error(t("treasury.receipts.upload_error"));
			} finally {
				setIsUploading(false);
			}
		},
		[selectedYear, t, revalidator],
	);

	const onFileChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (!file) return;
			const ext = `.${file.name.split(".").pop()?.toLowerCase()}`;
			if (!RECEIPT_ALLOWED_TYPES.includes(ext as (typeof RECEIPT_ALLOWED_TYPES)[number])) {
				toast.error(t("receipts.invalid_type", { types: RECEIPT_ALLOWED_TYPES.join(", ") }));
				return;
			}
			handleUpload(file);
			e.target.value = "";
		},
		[handleUpload, t],
	);

	return (
		<PageWrapper>
			<div className="w-full max-w-5xl mx-auto px-4">
				{/* Header - same pattern as reimbursements / transactions */}
				<div className="mb-6 flex flex-wrap items-start justify-between gap-4">
					<div>
						<Link
							to="/treasury"
							className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-primary mb-2"
						>
							<span className="material-symbols-outlined text-base">
								arrow_back
							</span>
							{t("common.actions.back")}
						</Link>
						<h1 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white">
							{t("treasury.receipts.title")}
						</h1>
					</div>
					<div className="flex flex-wrap items-center gap-4">
						{receiptsByYear.length > 0 && (
							<div className="flex gap-2">
								{receiptsByYear.map((y) => (
									<Button
										key={y.year}
										type="button"
										variant={selectedYear === y.year ? "default" : "secondary"}
										size="sm"
										onClick={() => setSelectedYear(y.year)}
										className="font-bold rounded-xl"
									>
										{y.year}
									</Button>
								))}
							</div>
						)}
						{canWrite && (
							<>
								<input
									ref={fileInputRef}
									type="file"
									className="hidden"
									accept={RECEIPT_ALLOWED_TYPES.join(",")}
									onChange={onFileChange}
									disabled={isUploading}
								/>
								<button
									type="button"
									onClick={() => fileInputRef.current?.click()}
									disabled={isUploading}
									className="p-2 text-gray-500 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
									title={t("treasury.receipts.add")}
								>
									<span
									className={`material-symbols-outlined text-xl ${isUploading ? "animate-spin" : ""}`}
								>
									{isUploading ? "progress_activity" : "add"}
								</span>
								</button>
							</>
						)}
					</div>
				</div>

				{/* Content - no wrapper background; only each receipt card is white */}
				{revalidator.state === "loading" && receipts.length === 0 ? (
					<ReceiptsGridSkeletonOnly />
				) : receipts.length === 0 ? (
					<div className="p-8 text-center text-gray-500">
						<span className="material-symbols-outlined text-4xl text-gray-300 dark:text-gray-600">
							receipt_long
						</span>
						<p className="mt-2 font-medium">{t("treasury.receipts.no_receipts")}</p>
						{canWrite && (
							<button
								type="button"
								onClick={() => fileInputRef.current?.click()}
								disabled={isUploading}
								className="mt-4 inline-flex items-center gap-1 p-2 text-gray-500 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
								title={t("treasury.receipts.add")}
							>
								<span
									className={`material-symbols-outlined text-xl ${isUploading ? "animate-spin" : ""}`}
								>
									{isUploading ? "progress_activity" : "add"}
								</span>
								{t("treasury.receipts.add")}
							</button>
						)}
					</div>
				) : (
					<ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
						{receipts.map((receipt) => (
							<li
								key={receipt.id}
								className="group flex flex-col rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-800 shadow-sm"
							>
								{/* Thumbnail - use neutral background, padding and rounded top like other item thumbnails */}
								<div className="relative aspect-4/3 w-full bg-gray-50 dark:bg-gray-800/50 flex items-center justify-center shrink-0 border-b border-gray-100 dark:border-gray-700 p-3 rounded-t-xl">
									{isImageReceipt(receipt.name) ? (
										<Thumbnail
											src={`/api/receipts/thumbnail?pathname=${encodeURIComponent(receipt.id)}&w=${THUMBNAIL_WIDTH}`}
											alt=""
										/>
										) : (
											<a
												href={receipt.url}
												target="_blank"
												rel="noopener noreferrer"
												className="flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-primary"
											>
												<span className="material-symbols-outlined text-4xl">description</span>
												<span className="text-xs">{t("treasury.receipts.open_pdf")}</span>
											</a>
										)}
										{canWrite && (
											<button
												type="button"
												onClick={(e) => {
													e.preventDefault();
													handleDelete(receipt.id);
												}}
												disabled={deletingId === receipt.id}
												className="absolute top-2 right-2 p-1.5 rounded-lg bg-red-500/90 text-white opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:bg-red-600 disabled:opacity-50"
												title={t("treasury.receipts.delete")}
											>
												<span className="material-symbols-outlined text-lg">delete</span>
											</button>
										)}
									</div>
									<div className="p-2 flex-1 min-w-0">
										{editingId === receipt.id ? (
											<Input
												className="h-8 text-sm"
												value={editValue}
												onChange={(e) => setEditValue(e.target.value)}
												onBlur={() => {
													if (editValue.trim()) handleRename(receipt.id, editValue);
													else setEditingId(null);
												}}
												onKeyDown={(e) => {
													if (e.key === "Enter" && editValue.trim()) {
														handleRename(receipt.id, editValue);
													}
													if (e.key === "Escape") {
														setEditingId(null);
														setEditValue("");
													}
												}}
												autoFocus
											/>
										) : (
											<button
												type="button"
												className="w-full text-left text-sm font-medium truncate block hover:bg-gray-100 dark:hover:bg-gray-700 rounded px-1 py-0.5 -mx-1"
												onClick={() => {
													if (canWrite) {
														setEditingId(receipt.id);
														setEditValue(receipt.name);
													}
												}}
											>
												{receipt.name}
											</button>
										)}
									</div>
								</li>
							))}
						</ul>
					)}
			</div>
		</PageWrapper>
	);
}
