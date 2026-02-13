import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Form, useSearchParams } from "react-router";
import { AddItemButton } from "~/components/add-item-button";
import {
	ContentArea,
	PageWrapper,
	QRPanel,
	SplitLayout,
} from "~/components/layout/page-layout";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { ConfirmDialog } from "~/components/ui/confirm-dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { useLocalReel } from "~/contexts/info-reel-context";
import { useUser } from "~/contexts/user-context";
import { getDatabase } from "~/db/server.server";
import {
	getAuthenticatedUser,
	getGuestContext,
	requirePermission,
} from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import { cn } from "~/lib/utils";
import type { Route } from "./+types/_index";

export function meta({ data }: Route.MetaArgs) {
	return [
		{ title: `${data?.siteConfig?.name || "Portal"} - Some / Social` },
		{
			name: "description",
			content: "Seuraa meitä somessa / Follow us on social media",
		},
	];
}

export async function loader({ request }: Route.LoaderArgs) {
	// Check permission (works for both logged-in users and guests)
	const authUser = await getAuthenticatedUser(request, getDatabase);

	let permissions: string[];
	let languages: { primary: string; secondary: string };

	if (authUser) {
		permissions = authUser.permissions;
		languages = {
			primary: authUser.primaryLanguage,
			secondary: authUser.secondaryLanguage,
		};
	} else {
		const guestContext = await getGuestContext(() => getDatabase());
		permissions = guestContext.permissions;
		languages = guestContext.languages;
	}

	const canRead = permissions.some((p) => p === "social:read" || p === "*");
	if (!canRead) {
		throw new Response("Not Found", { status: 404 });
	}

	const canWrite = permissions.some((p) => p === "social:write" || p === "*");

	const db = getDatabase();
	const links = await db.getSocialLinks();

	// Sort by sortOrder
	const sortedLinks = links.sort((a, b) => a.sortOrder - b.sortOrder);
	const activeLinks = sortedLinks.filter((link) => {
		const isNotDraft = (link as any).status !== "draft";
		const isStaff = canWrite;
		return (isNotDraft && link.isActive) || isStaff;
	});

	return {
		siteConfig: SITE_CONFIG,
		channels: activeLinks.filter(
			(l) => l.isActive && (l as any).status !== "draft",
		), // For public view/reel
		allLinks: sortedLinks, // canWrite uses this
		languages,
	};
}

export async function action({ request }: Route.ActionArgs) {
	// Require permission for any action
	await requirePermission(request, "social:write", getDatabase);

	const db = getDatabase();
	const formData = await request.formData();
	const actionType = formData.get("_action") as string;

	if (actionType === "update") {
		const id = formData.get("id") as string;
		const currentLink = await db.getSocialLinkById(id);

		const updateData: any = {
			name: formData.get("name") as string,
			icon: formData.get("icon") as string,
			url: formData.get("url") as string,
			color: formData.get("color") as string,
			sortOrder: parseInt(formData.get("sortOrder") as string, 10) || 0,
			isActive: formData.get("isActive") === "on",
		};

		// Auto-publish draft
		if (currentLink && (currentLink as any).status === "draft") {
			const { getDraftAutoPublishStatus } = await import(
				"~/lib/draft-auto-publish"
			);
			const newStatus = getDraftAutoPublishStatus(
				"social",
				"draft",
				updateData,
			);
			if (newStatus) {
				updateData.status = newStatus;
			}
		}

		await db.updateSocialLink(id, updateData);
	} else if (actionType === "delete") {
		const id = formData.get("id") as string;
		await db.deleteSocialLink(id);
	} else if (actionType === "setPrimary") {
		const id = formData.get("id") as string;
		await db.setPrimarySocialLink(id);
	} else if (actionType === "clearPrimary") {
		// Clear primary by setting isPrimary to false for all
		const links = await db.getSocialLinks();
		for (const link of links) {
			if (link.isPrimary) {
				await db.updateSocialLink(link.id, { isPrimary: false });
			}
		}
	}

	return { success: true };
}

export default function Social({ loaderData }: Route.ComponentProps) {
	const { channels, allLinks, languages } = loaderData;
	const { t, i18n } = useTranslation();
	const { hasPermission } = useUser();
	const canWrite = hasPermission("social:write");
	const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
	const deleteFormRef = useRef<HTMLFormElement>(null);

	const [editingId, setEditingId] = useState<string | null>(null);
	const [searchParams, setSearchParams] = useSearchParams();

	// Handle edit query param (from create-draft redirect)
	useEffect(() => {
		const editId = searchParams.get("edit");
		if (editId) {
			setEditingId(editId);
			// Clean up param
			setSearchParams(
				(prev) => {
					prev.delete("edit");
					return prev;
				},
				{ replace: true },
			);
		}
	}, [searchParams, setSearchParams]);

	// Determine which language to show as secondary (small text)
	const secondaryDisplayLang =
		i18n.language === languages.secondary
			? languages.primary
			: languages.secondary;

	// Use local reel for cycling through channels in info reel mode
	const {
		activeIndex,
		activeItem: activeChannel,
		isInfoReel,
		itemFillProgress,
		itemOpacity,
	} = useLocalReel({
		items: channels,
	});

	// Fallback to first channel if no active item
	const displayChannel = activeChannel || channels[0];

	// QR Panel only shown in info reel mode, cycling through channels
	const RightContent = displayChannel ? (
		<QRPanel
			qrUrl={displayChannel.url}
			key={displayChannel.id}
			opacity={itemOpacity}
			title={
				<h2
					className="text-3xl font-black tracking-tight uppercase"
					style={{
						color: `color-mix(in srgb, var(--foreground) ${itemOpacity * 100}%, transparent ${(1 - itemOpacity) * 100}%)`,
					}}
				>
					{displayChannel.name}
				</h2>
			}
		/>
	) : null;

	// Use allLinks for staff view (shows inactive too), channels for regular view
	const displayLinks = canWrite && !isInfoReel ? allLinks : channels;

	// Footer with add link for staff
	const FooterContent =
		canWrite && !isInfoReel ? (
			<div className="flex items-center gap-2">
				<AddItemButton
					title={t("common.actions.add")}
					variant="icon"
					createType="social"
				/>
			</div>
		) : undefined;

	return (
		<PageWrapper>
			<SplitLayout
				right={RightContent}
				header={{
					primary: t("social.header"),
					secondary: t("social.header", { lng: secondaryDisplayLang }),
				}}
				footer={FooterContent}
			>
				<ContentArea className="space-y-2">
					{canWrite && (
						<Form method="post" className="hidden" ref={deleteFormRef}>
							<input type="hidden" name="_action" value="delete" />
							<input type="hidden" name="id" value={deleteConfirmId ?? ""} />
						</Form>
					)}
					{displayLinks.map((channel, index) => {
						const isActive = isInfoReel && index === activeIndex;
						const isEditing = editingId === channel.id;

						// Edit form
						if (isEditing && canWrite) {
							return (
								<div
									key={channel.id}
									className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700"
								>
									<Form
										method="post"
										className="space-y-3"
										onSubmit={() => setEditingId(null)}
									>
										<input type="hidden" name="_action" value="update" />
										<input type="hidden" name="id" value={channel.id} />
										<div className="grid grid-cols-2 gap-3">
											<div>
												<Label className="text-xs">
													{t("common.fields.name")}
												</Label>
												<Input
													name="name"
													required
													defaultValue={channel.name}
													className="h-8"
												/>
											</div>
											<div>
												<Label className="text-xs">
													{t("common.fields.icon")}
												</Label>
												<Input
													name="icon"
													required
													defaultValue={channel.icon}
													className="h-8"
												/>
											</div>
										</div>
										<div>
											<Label className="text-xs">
												{t("common.fields.url")}
											</Label>
											<Input
												name="url"
												type="url"
												required
												defaultValue={channel.url}
												className="h-8"
											/>
										</div>
										<div className="grid grid-cols-2 gap-3">
											<div>
												<Label className="text-xs">
													{t("common.fields.color")}
												</Label>
												<Input
													name="color"
													defaultValue={channel.color}
													className="h-8"
												/>
											</div>
											<div>
												<Label className="text-xs">
													{t("common.fields.order")}
												</Label>
												<Input
													name="sortOrder"
													type="number"
													defaultValue={channel.sortOrder}
													className="h-8"
												/>
											</div>
										</div>
										<div className="flex items-center gap-2">
											<Checkbox
												id={`edit-isActive-${channel.id}`}
												name="isActive"
												defaultChecked={channel.isActive}
											/>
											<Label
												htmlFor={`edit-isActive-${channel.id}`}
												className="text-xs"
											>
												{t("common.fields.active")}
											</Label>
										</div>
										<div className="flex gap-2">
											<Button
												type="button"
												variant="outline"
												size="sm"
												onClick={() => setEditingId(null)}
											>
												{t("common.actions.cancel")}
											</Button>
											<Button type="submit" size="sm">
												{t("common.actions.save")}
											</Button>
										</div>
									</Form>
								</div>
							);
						}

						return (
							<div
								key={channel.id}
								className={cn(
									"relative w-full flex items-center gap-6 p-5 rounded-xl transition-all text-left group outline-none overflow-hidden",
									!isActive &&
									"bg-transparent hover:bg-gray-50 dark:hover:bg-gray-800/50",
									!channel.isActive && "opacity-50",
								)}
							>
								{/* Animated filling background for active channel */}
								{isActive && (
									<div
										className="absolute inset-0 bg-primary/10 pointer-events-none"
										style={{
											clipPath: `inset(0 ${100 - itemFillProgress}% 0 0)`,
											opacity: itemOpacity,
										}}
									/>
								)}

								<a
									href={channel.url}
									target="_blank"
									rel="noreferrer"
									className="flex items-center gap-6 flex-1"
								>
									<span
										className={cn(
											"relative material-symbols-outlined text-3xl transition-transform group-hover:scale-110",
											!isActive && "text-gray-400 dark:text-gray-500",
										)}
										style={
											isActive
												? {
													color: `color-mix(in srgb, var(--primary) ${itemOpacity * 100}%, var(--muted-foreground) ${(1 - itemOpacity) * 100}%)`,
												}
												: undefined
										}
									>
										{channel.icon}
									</span>
									<div className="relative flex-1">
										<h3
											className={cn(
												"text-2xl font-black leading-tight uppercase tracking-wide",
												!isActive &&
												"text-gray-900 dark:text-white group-hover:text-primary",
											)}
											style={
												isActive
													? {
														color: `color-mix(in srgb, var(--primary) ${itemOpacity * 100}%, var(--foreground) ${(1 - itemOpacity) * 100}%)`,
													}
													: undefined
											}
										>
											{channel.name}
										</h3>
										{!channel.isActive && canWrite && (
											<span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300">
												{t("common.fields.hidden")}
											</span>
										)}
									</div>
									<span
										className={cn(
											"relative material-symbols-outlined ml-auto text-2xl",
											!isActive &&
											"text-gray-300 dark:text-gray-600 group-hover:text-primary group-hover:translate-x-1",
										)}
										style={
											isActive
												? {
													color: `color-mix(in srgb, var(--primary) ${itemOpacity * 100}%, var(--muted-foreground) ${(1 - itemOpacity) * 100}%)`,
												}
												: undefined
										}
									>
										open_in_new
									</span>
								</a>

								{/* Staff actions */}
								{canWrite && !isInfoReel && (
									<div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
										{/* Set/Unset Primary */}
										<Form method="post" className="inline">
											<input
												type="hidden"
												name="_action"
												value={
													channel.isPrimary ? "clearPrimary" : "setPrimary"
												}
											/>
											<input type="hidden" name="id" value={channel.id} />
											<Button
												type="submit"
												variant="ghost"
												size="icon"
												className={cn(
													"h-8 w-8",
													channel.isPrimary
														? "text-yellow-500 hover:text-gray-400"
														: "text-gray-400 hover:text-yellow-500",
												)}
												title={
													channel.isPrimary
														? t("social.clear_primary")
														: t("social.set_primary")
												}
											>
												<span className="material-symbols-outlined text-xl">
													{channel.isPrimary ? "star" : "star_outline"}
												</span>
											</Button>
										</Form>
										<Button
											type="button"
											variant="ghost"
											size="icon"
											onClick={() => setEditingId(channel.id)}
											className="text-gray-400 hover:text-primary h-8 w-8"
										>
											<span className="material-symbols-outlined text-xl">
												edit
											</span>
										</Button>
										<Button
											type="button"
											variant="ghost"
											size="icon"
											className="text-gray-400 hover:text-red-500 h-8 w-8"
											onClick={() => setDeleteConfirmId(channel.id)}
										>
											<span className="material-symbols-outlined text-xl">
												delete
											</span>
										</Button>
									</div>
								)}
							</div>
						);
					})}

					<ConfirmDialog
						open={deleteConfirmId !== null}
						onOpenChange={(open) => !open && setDeleteConfirmId(null)}
						title={t("common.actions.delete")}
						description={t("social.delete_confirm")}
						confirmLabel={t("common.actions.delete")}
						cancelLabel={t("common.actions.cancel")}
						variant="destructive"
						onConfirm={() => {
							deleteFormRef.current?.requestSubmit();
							setDeleteConfirmId(null);
						}}
					/>
					{displayLinks.length === 0 && (
						<div className="text-center py-12 text-gray-400">
							<span className="material-symbols-outlined text-5xl mb-4 block opacity-50">
								share
							</span>
							<p className="font-medium">{t("social.no_channels")}</p>
							{canWrite && (
								<AddItemButton
									title={t("social.add_first")}
									variant="button"
									className="mt-4"
									createType="social"
								/>
							)}
						</div>
					)}
				</ContentArea>
			</SplitLayout>
		</PageWrapper>
	);
}
