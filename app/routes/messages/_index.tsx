import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Form, Link, useRevalidator, useSearchParams } from "react-router";
import { toast } from "sonner";
import { PageHeader } from "~/components/layout/page-header";
import { PageWrapper } from "~/components/layout/page-layout";
import { Button } from "~/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { getDatabase } from "~/db/server.server";
import { getAuthenticatedUser } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import { cn } from "~/lib/utils";
import type { Route } from "./+types/_index";

export function meta({ data }: Route.MetaArgs) {
	return [
		{ title: `${data?.siteConfig?.name || "Portal"} - Messages / Viestit` },
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request }: Route.LoaderArgs) {
	const authUser = await getAuthenticatedUser(request, getDatabase);

	if (!authUser) {
		throw new Response("Unauthorized", { status: 401 });
	}

	const db = getDatabase();
	const user = await db.findUserByEmail(authUser.email);

	if (!user) {
		throw new Response("User not found", { status: 404 });
	}

	const messages = await db.getMessagesByUserId(user.id, 100); // Get last 100 messages
	const unreadCount = await db.getUnreadMessageCount(user.id);

	return {
		siteConfig: SITE_CONFIG,
		messages,
		unreadCount,
	};
}

export async function action({ request }: Route.ActionArgs) {
	const authUser = await getAuthenticatedUser(request, getDatabase);

	if (!authUser) {
		throw new Response("Unauthorized", { status: 401 });
	}

	const db = getDatabase();
	const user = await db.findUserByEmail(authUser.email);

	if (!user) {
		throw new Response("User not found", { status: 404 });
	}

	const formData = await request.formData();
	const actionType = formData.get("_action") as string;

	if (actionType === "markAsRead") {
		const messageId = formData.get("messageId") as string;
		if (messageId) {
			await db.markMessageAsRead(messageId);
		}
	} else if (actionType === "markAsUnread") {
		const messageId = formData.get("messageId") as string;
		if (messageId) {
			await db.markMessageAsUnread(messageId);
		}
	} else if (actionType === "markAllAsRead") {
		await db.markAllMessagesAsRead(user.id);
	} else if (actionType === "bulkMark") {
		const messageIds = formData.getAll("messageIds") as string[];
		const read = formData.get("read") === "true";
		if (messageIds.length > 0) {
			await Promise.all(
				messageIds.map((id) =>
					read ? db.markMessageAsRead(id) : db.markMessageAsUnread(id),
				),
			);
		}
		return new Response(null, {
			status: 302,
			headers: { Location: "/messages?success=1" },
		});
	}

	return { success: true };
}

export default function Messages({ loaderData }: Route.ComponentProps) {
	const { messages, unreadCount } = loaderData;
	const { t, i18n } = useTranslation();
	const revalidator = useRevalidator();
	const [searchParams, setSearchParams] = useSearchParams();
	const [selectedMessages, setSelectedMessages] = useState<Set<string>>(
		new Set(),
	);

	useEffect(() => {
		const success = searchParams.get("success");
		if (success) {
			toast.success(t("messages.marked_as_read"));
			const nextParams = new URLSearchParams(searchParams);
			nextParams.delete("success");
			setSearchParams(nextParams, { replace: true });
			setSelectedMessages(new Set());
			revalidator.revalidate();
		}
	}, [searchParams, setSearchParams, t, revalidator]);

	const formatDate = (date: Date | string) => {
		return new Date(date).toLocaleDateString(
			i18n.language === "fi" ? "fi-FI" : "en-US",
			{
				year: "numeric",
				month: "short",
				day: "numeric",
				hour: "2-digit",
				minute: "2-digit",
			},
		);
	};

	return (
		<PageWrapper>
			<div className="w-full max-w-4xl mx-auto px-4">
				<PageHeader title={t("messages.title")} />

				{/* Actions */}
				<div className="mb-4 flex items-center justify-between gap-2 flex-wrap">
					{/* Mobile: dropdown menu for bulk actions */}
					<div className="md:hidden w-full">
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									variant="default"
									size="sm"
									className="flex items-center gap-1 w-full sm:w-auto"
									disabled={selectedMessages.size === 0}
								>
									<span className="material-symbols-outlined text-base">
										more_vert
									</span>
									{t("messages.selected_count", {
										count: selectedMessages.size,
									})}
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="start" className="w-56">
								<DropdownMenuItem asChild>
									<Form method="post" className="contents">
										{Array.from(selectedMessages).map((id) => (
											<input
												key={id}
												type="hidden"
												name="messageIds"
												value={id}
											/>
										))}
										<input type="hidden" name="_action" value="bulkMark" />
										<input type="hidden" name="read" value="true" />
										<button
											type="submit"
											className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent"
										>
											<span className="material-symbols-outlined text-base">
												mark_email_read
											</span>
											{t("messages.mark_selected_read")}
										</button>
									</Form>
								</DropdownMenuItem>
								<DropdownMenuItem asChild>
									<Form method="post" className="contents">
										{Array.from(selectedMessages).map((id) => (
											<input
												key={id}
												type="hidden"
												name="messageIds"
												value={id}
											/>
										))}
										<input type="hidden" name="_action" value="bulkMark" />
										<input type="hidden" name="read" value="false" />
										<button
											type="submit"
											className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent"
										>
											<span className="material-symbols-outlined text-base">
												mark_email_unread
											</span>
											{t("messages.mark_selected_unread")}
										</button>
									</Form>
								</DropdownMenuItem>
								<DropdownMenuItem
									onClick={() => setSelectedMessages(new Set())}
									className="cursor-pointer"
								>
									<span className="material-symbols-outlined text-base mr-2">
										close
									</span>
									{t("messages.clear_selection")}
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
					{/* Desktop: inline button group */}
					<div className="hidden md:flex items-center gap-2 flex-wrap">
						<span className="text-sm text-muted-foreground">
							{t("messages.selected_count", {
								count: selectedMessages.size,
							})}
						</span>
						<Form method="post">
							{Array.from(selectedMessages).map((id) => (
								<input key={id} type="hidden" name="messageIds" value={id} />
							))}
							<input type="hidden" name="_action" value="bulkMark" />
							<input type="hidden" name="read" value="true" />
							<Button
								type="submit"
								variant="default"
								size="sm"
								className="flex items-center gap-1"
								disabled={selectedMessages.size === 0}
							>
								<span className="material-symbols-outlined text-base">
									mark_email_read
								</span>
								{t("messages.mark_selected_read")}
							</Button>
						</Form>
						<Form method="post">
							{Array.from(selectedMessages).map((id) => (
								<input key={id} type="hidden" name="messageIds" value={id} />
							))}
							<input type="hidden" name="_action" value="bulkMark" />
							<input type="hidden" name="read" value="false" />
							<Button
								type="submit"
								variant="outline"
								size="sm"
								className="flex items-center gap-1"
								disabled={selectedMessages.size === 0}
							>
								<span className="material-symbols-outlined text-base">
									mark_email_unread
								</span>
								{t("messages.mark_selected_unread")}
							</Button>
						</Form>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="flex items-center gap-1"
							onClick={() => setSelectedMessages(new Set())}
							disabled={selectedMessages.size === 0}
						>
							<span className="material-symbols-outlined text-base">close</span>
							{t("messages.clear_selection")}
						</Button>
					</div>

					{unreadCount > 0 && selectedMessages.size === 0 && (
						<div className="ml-auto">
							<Form method="post">
								<input type="hidden" name="_action" value="markAllAsRead" />
								<Button
									type="submit"
									variant="outline"
									size="sm"
									className="flex items-center gap-1"
								>
									<span className="material-symbols-outlined text-base">
										done_all
									</span>
									{t("messages.mark_all_read")}
								</Button>
							</Form>
						</div>
					)}
				</div>

				{/* Messages: card list */}
				<div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
					{messages.length === 0 ? (
						<div className="p-8 text-center text-gray-500">
							{t("messages.empty")}
						</div>
					) : (
						<div className="divide-y divide-gray-200 dark:divide-gray-700">
							{/* Select all checkbox header */}
							<div className="p-4 border-b border-gray-200 dark:border-gray-700">
								<input
									type="checkbox"
									checked={
										messages.length > 0 &&
										messages.every((m) => selectedMessages.has(m.id))
									}
									onChange={(e) => {
										if (e.target.checked) {
											setSelectedMessages(new Set(messages.map((m) => m.id)));
										} else {
											setSelectedMessages(new Set());
										}
									}}
									className="cursor-pointer size-4 rounded border-gray-300"
								/>
								<span className="ml-2 text-sm text-muted-foreground">
									{t("messages.select_all")}
								</span>
							</div>
							{messages.map((message) => (
								<div
									key={message.id}
									className={cn(
										"p-4 flex gap-3",
										!message.read && "bg-blue-50/50 dark:bg-blue-900/10",
									)}
								>
									<div className="shrink-0 pt-0.5">
										<input
											type="checkbox"
											checked={selectedMessages.has(message.id)}
											onChange={(e) => {
												const newSelected = new Set(selectedMessages);
												if (e.target.checked) {
													newSelected.add(message.id);
												} else {
													newSelected.delete(message.id);
												}
												setSelectedMessages(newSelected);
											}}
											className="cursor-pointer size-4 rounded border-gray-300"
										/>
									</div>
									<div className="min-w-0 flex-1 space-y-1">
										<div className="flex items-center gap-2">
											{!message.read && (
												<span className="inline-block w-2 h-2 bg-blue-500 rounded-full shrink-0" />
											)}
											<p className="font-mono text-xs text-muted-foreground">
												{formatDate(message.createdAt)}
											</p>
										</div>
										<p className="font-medium text-sm">{message.title}</p>
										<p
											className="text-sm text-gray-600 dark:text-gray-400 whitespace-normal"
											style={{ wordBreak: "break-word" }}
										>
											{message.content}
										</p>
										<div className="flex flex-wrap items-center gap-2 pt-2">
											{message.relatedPurchaseId && (
												<Link
													to={`/treasury/reimbursements/${message.relatedPurchaseId}`}
													className="text-primary hover:underline text-sm"
												>
													{t("messages.view_purchase")}
												</Link>
											)}
											{message.relatedNewsId && (
												<Link
													to={`/news/${message.relatedNewsId}/edit`}
													className="text-primary hover:underline text-sm"
												>
													{t("messages.view_news")}
												</Link>
											)}
											{!message.read && (
												<Form method="post" className="inline-block">
													<input
														type="hidden"
														name="_action"
														value="markAsRead"
													/>
													<input
														type="hidden"
														name="messageId"
														value={message.id}
													/>
													<Button
														type="submit"
														variant="outline"
														size="sm"
														className="h-8 flex items-center gap-1"
													>
														<span className="material-symbols-outlined text-base">
															done
														</span>
														{t("messages.mark_as_read")}
													</Button>
												</Form>
											)}
										</div>
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			</div>
		</PageWrapper>
	);
}
