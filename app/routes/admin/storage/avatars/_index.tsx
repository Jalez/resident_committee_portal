import { list } from "@vercel/blob";
import { upload } from "@vercel/blob/client";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLoaderData, useRevalidator } from "react-router";
import { toast } from "sonner";
import {
	ContentArea,
	PageWrapper,
	SplitLayout,
} from "~/components/layout/page-layout";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { ConfirmDialog } from "~/components/ui/confirm-dialog";
import { EmptyState } from "~/components/ui/empty-state";
import { Thumbnail } from "~/components/ui/thumbnail";
import { getDatabase } from "~/db/server.server";
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

	const db = getDatabase();
	const allUsers = await db.getAllUsers(1000);
	const userById = new Map(allUsers.map((u) => [u.id, u]));

	const items = blobs.map((b) => {
		// pathname format: avatars/{userId}.{ext}
		const rest = b.pathname.slice(prefix.length);
		const dot = rest.lastIndexOf(".");
		const userId = dot > 0 ? rest.slice(0, dot) : rest;
		const user = userById.get(userId) ?? null;
		return {
			pathname: b.pathname,
			url: b.url,
			linkedUser: user ? { id: user.id, name: user.name } : null,
		};
	});

	const systemLanguages = await getSystemLanguageDefaults();
	return {
		siteConfig: SITE_CONFIG,
		items,
		systemLanguages,
	};
}

function AvatarCard({
	item,
	onDelete,
	onReplace,
	isDeleting,
	isReplacing,
}: {
	item: {
		pathname: string;
		url: string;
		linkedUser: { id: string; name: string } | null;
	};
	onDelete: (pathname: string) => void;
	onReplace: (pathname: string, userId: string, file: File) => void;
	isDeleting: boolean;
	isReplacing: boolean;
}) {
	const { t } = useTranslation();
	const fileInputRef = useRef<HTMLInputElement>(null);

	const handleReplaceClick = () => {
		fileInputRef.current?.click();
	};

	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file || !item.linkedUser) return;
		onReplace(item.pathname, item.linkedUser.id, file);
		e.target.value = "";
	};

	const handleDownload = useCallback(async () => {
		try {
			const res = await fetch(item.url);
			const blob = await res.blob();
			const objectUrl = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = objectUrl;
			const filename = item.pathname.split("/").pop() ?? "avatar";
			a.download = filename;
			a.click();
			URL.revokeObjectURL(objectUrl);
		} catch {
			toast.error(
				t("admin.storage.avatars.download_error", {
					defaultValue: "Download failed",
				}),
			);
		}
	}, [item.url, item.pathname, t]);

	return (
		<li className="group flex flex-col rounded-xl border border-border overflow-hidden bg-card/50">
			<div className="relative aspect-square bg-muted flex items-center justify-center p-2">
				<Thumbnail
					src={item.url}
					alt=""
					objectFit="cover"
					imgClassName="rounded-lg"
				/>
				{item.linkedUser ? (
					<Badge
						variant="secondary"
						className="absolute top-2 left-2 max-w-[calc(100%-1rem)] truncate"
						title={item.linkedUser.name}
					>
						{item.linkedUser.name}
					</Badge>
				) : (
					<Badge variant="outline" className="absolute top-2 left-2">
						{t("admin.storage.avatars.stray", { defaultValue: "Stray" })}
					</Badge>
				)}
			</div>
			<div className="p-2 space-y-1">
				<p
					className="text-xs font-mono text-muted-foreground truncate"
					title={item.pathname}
				>
					{item.pathname}
				</p>
				<div className="flex gap-1 flex-wrap">
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="flex-1"
						onClick={handleDownload}
					>
						<span className="material-symbols-outlined text-sm">download</span>
						{t("common.actions.download", { defaultValue: "Download" })}
					</Button>
					{item.linkedUser && (
						<>
							<input
								ref={fileInputRef}
								type="file"
								accept="image/jpeg,image/png,image/webp"
								className="hidden"
								onChange={handleFileChange}
							/>
							<Button
								type="button"
								variant="outline"
								size="sm"
								className="flex-1"
								disabled={isReplacing}
								onClick={handleReplaceClick}
							>
								<span className="material-symbols-outlined text-sm">
									swap_horiz
								</span>
								{isReplacing
									? t("common.actions.loading", { defaultValue: "..." })
									: t("admin.storage.avatars.replace", {
											defaultValue: "Replace",
										})}
							</Button>
						</>
					)}
					<Button
						type="button"
						variant="destructive"
						size="sm"
						className="flex-1"
						disabled={isDeleting}
						onClick={() => onDelete(item.pathname)}
					>
						{isDeleting
							? t("common.actions.loading", { defaultValue: "..." })
							: t("admin.storage.avatars.delete", { defaultValue: "Delete" })}
					</Button>
				</div>
			</div>
		</li>
	);
}

export default function AdminStorageAvatars() {
	const { items, systemLanguages } = useLoaderData<typeof loader>();
	const revalidator = useRevalidator();
	const { t } = useTranslation();
	const [deletingPathname, setDeletingPathname] = useState<string | null>(null);
	const [deleteConfirmPathname, setDeleteConfirmPathname] = useState<
		string | null
	>(null);
	const [replacingPathname, setReplacingPathname] = useState<string | null>(
		null,
	);

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

	const doReplace = useCallback(
		async (pathname: string, userId: string, file: File) => {
			setReplacingPathname(pathname);
			try {
				const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
				const newPathname = `avatars/${userId}.${ext}`;

				const blob = await upload(newPathname, file, {
					access: "public",
					handleUploadUrl: "/api/avatars/upload",
				});

				const avatarUrl = new URL(blob.url);
				avatarUrl.searchParams.set("v", String(Date.now()));
				const res = await fetch("/api/avatars/set", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ userId, url: avatarUrl.toString() }),
				});
				if (!res.ok) {
					const data = await res.json().catch(() => ({}));
					toast.error(
						data?.error ??
							t("admin.storage.avatars.replace_error", {
								defaultValue: "Replace failed",
							}),
					);
					return;
				}
				toast.success(
					t("admin.storage.avatars.replace_success", {
						defaultValue: "Avatar replaced",
					}),
				);
				revalidator.revalidate();
			} catch (e) {
				console.error(e);
				toast.error(
					t("admin.storage.avatars.replace_error", {
						defaultValue: "Replace failed",
					}),
				);
			} finally {
				setReplacingPathname(null);
			}
		},
		[t, revalidator],
	);

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
				<ContentArea>
					<p className="text-muted-foreground mb-6 -mt-6">
						{t("admin.storage.avatars.description", {
							defaultValue: "All user avatar images stored in the system.",
						})}
					</p>

					<div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
						{items.length === 0 ? (
							<EmptyState
								message={t("admin.storage.avatars.empty", {
									defaultValue: "No avatars",
								})}
								icon="account_circle"
							/>
						) : (
							<ul className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
								{items.map((item) => (
									<AvatarCard
										key={item.pathname}
										item={item}
										onDelete={handleDeleteClick}
										onReplace={doReplace}
										isDeleting={deletingPathname === item.pathname}
										isReplacing={replacingPathname === item.pathname}
									/>
								))}
							</ul>
						)}
					</div>
				</ContentArea>
			</SplitLayout>
		</PageWrapper>
	);
}
