import { useState } from "react";
import { Link, useFetcher } from "react-router";
import { useTranslation } from "react-i18next";
import {
	ArrowLeft,
	ChevronDown,
	ChevronUp,
	Forward,
	Reply,
	ReplyAll,
	Trash2,
} from "lucide-react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Button } from "~/components/ui/button";
import { getDatabase } from "~/db";
import { requirePermission } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import type { Route } from "./+types/mail.thread.$threadId";

export function meta({ data }: Route.MetaArgs) {
	const subject = data?.messages?.[0]?.subject;
	return [
		{
			title: subject
				? `${data?.siteConfig?.name || "Portal"} - ${subject}`
				: `${data?.siteConfig?.name || "Portal"} - Thread`,
		},
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request, params }: Route.LoaderArgs) {
	await requirePermission(request, "committee:email", getDatabase);
	const threadId = decodeURIComponent(params.threadId);
	if (!threadId) throw new Response("Not Found", { status: 404 });

	const db = getDatabase();
	const messages =
		await db.getCommitteeMailMessagesByThreadId(threadId);

	if (messages.length === 0) {
		throw new Response("Not Found", { status: 404 });
	}

	return {
		siteConfig: SITE_CONFIG,
		messages,
		threadId,
	};
}

function formatRecipientsJson(json: string | null): string {
	if (!json) return "";
	try {
		const arr = JSON.parse(json) as { email: string; name?: string }[];
		if (!Array.isArray(arr)) return "";
		return arr
			.map((r) => (r.name ? `${r.name} <${r.email}>` : r.email))
			.join(", ");
	} catch {
		return "";
	}
}

export default function MailThread({ loaderData }: Route.ComponentProps) {
	const { messages, threadId } = loaderData;
	const { t } = useTranslation();
	const deleteFetcher = useFetcher();
	const [expandedMessages, setExpandedMessages] = useState<Set<string>>(
		() => {
			// Expand the last message by default
			const set = new Set<string>();
			if (messages.length > 0) {
				set.add(messages[messages.length - 1].id);
			}
			return set;
		},
	);
	const [deleteMessageId, setDeleteMessageId] = useState<string | null>(
		null,
	);

	const threadSubject =
		messages[0]?.subject?.replace(/^(Re|Fwd|Fw):\s*/gi, "") ||
		t("mail.no_subject");

	const toggleExpand = (id: string) => {
		setExpandedMessages((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	const handleDeleteMessage = () => {
		if (!deleteMessageId) return;
		const msg = messages.find((m) => m.id === deleteMessageId);
		const formData = new FormData();
		formData.set("_action", "deleteMessage");
		formData.set("messageId", deleteMessageId);
		formData.set("direction", msg?.direction || "inbox");
		deleteFetcher.submit(formData, { action: "/mail", method: "post" });
		setDeleteMessageId(null);
	};

	return (
		<div className="flex flex-col gap-4">
			{/* Thread header */}
			<div className="flex items-center gap-2 border-b border-gray-200 pb-3 dark:border-gray-700">
				<Button
					variant="ghost"
					size="icon"
					asChild
					className="shrink-0"
				>
					<Link to="/mail">
						<ArrowLeft className="size-4" />
					</Link>
				</Button>
				<h1 className="text-xl font-semibold text-gray-900 dark:text-white">
					{threadSubject}
				</h1>
				<span className="text-muted-foreground ml-2 text-sm">
					{t("mail.messages_in_thread", {
						count: messages.length,
						defaultValue: `${messages.length} messages`,
					})}
				</span>
			</div>

			{/* Message list */}
			<div className="flex flex-col gap-3">
				{messages.map((msg) => {
					const isExpanded = expandedMessages.has(msg.id);
					const fromDisplay = msg.fromName
						? `${msg.fromName} <${msg.fromAddress}>`
						: msg.fromAddress;
					const dateStr = new Date(msg.date).toLocaleString(
						undefined,
						{
							dateStyle: "medium",
							timeStyle: "short",
						},
					);

					return (
						<div
							key={msg.id}
							className="overflow-hidden rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/60"
						>
							{/* Message header (always visible) */}
							<button
								type="button"
								onClick={() => toggleExpand(msg.id)}
								className="flex w-full items-center justify-between gap-2 bg-gray-100 px-4 py-3 text-left hover:bg-gray-200/70 dark:bg-gray-800/70 dark:hover:bg-gray-800/90"
							>
								<div className="flex min-w-0 flex-1 flex-col gap-0.5">
									<div className="flex items-center gap-2">
										<span className="truncate text-sm font-medium text-gray-900 dark:text-white">
											{msg.fromName ||
												msg.fromAddress}
										</span>
										{msg.direction === "sent" && (
											<span className="shrink-0 rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700 dark:bg-blue-900 dark:text-blue-300">
												{t("mail.sent")}
											</span>
										)}
									</div>
									{!isExpanded && (
										<p className="truncate text-xs text-gray-500 dark:text-gray-400">
											{msg.bodyText?.slice(0, 100) ||
												msg.bodyHtml
													?.replace(
														/<[^>]+>/g,
														"",
													)
													.slice(0, 100)}
										</p>
									)}
								</div>
								<div className="flex shrink-0 items-center gap-2">
									<span className="text-xs text-gray-500 dark:text-gray-400">
										{dateStr}
									</span>
									{isExpanded ? (
										<ChevronUp className="size-4 text-gray-400" />
									) : (
										<ChevronDown className="size-4 text-gray-400" />
									)}
								</div>
							</button>

							{/* Expanded content */}
							{isExpanded && (
								<div className="border-t border-gray-200 px-4 py-3 dark:border-gray-700">
									{/* Full headers */}
									<div className="mb-3 grid gap-1 text-sm text-gray-600 dark:text-gray-400">
										<div className="flex gap-2">
											<span className="shrink-0 font-medium">
												{t("mail.from")}:
											</span>
											<span>{fromDisplay}</span>
										</div>
										<div className="flex gap-2">
											<span className="shrink-0 font-medium">
												{t("mail.to")}:
											</span>
											<span>
												{formatRecipientsJson(
													msg.toJson,
												)}
											</span>
										</div>
										{msg.ccJson && (
											<div className="flex gap-2">
												<span className="shrink-0 font-medium">
													{t("mail.cc")}:
												</span>
												<span>
													{formatRecipientsJson(
														msg.ccJson,
													)}
												</span>
											</div>
										)}
										<div className="flex gap-2">
											<span className="shrink-0 font-medium">
												{t("mail.date")}:
											</span>
											<span>{dateStr}</span>
										</div>
									</div>

									{/* Body */}
									<div
										className="prose prose-sm dark:prose-invert max-w-none text-gray-900 dark:text-gray-100"
										// biome-ignore lint/security/noDangerouslySetInnerHtml: email body from DB
										dangerouslySetInnerHTML={{
											__html: msg.bodyHtml,
										}}
									/>

									{/* Actions */}
									<div className="mt-4 flex items-center gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
										<Button
											variant="outline"
											size="sm"
											asChild
										>
											<Link
												to={`/mail/compose?replyTo=${msg.id}`}
											>
												<Reply className="mr-1 size-4" />
												{t("mail.reply", {
													defaultValue: "Reply",
												})}
											</Link>
										</Button>
										<Button
											variant="outline"
											size="sm"
											asChild
										>
											<Link
												to={`/mail/compose?replyAllTo=${msg.id}`}
											>
												<ReplyAll className="mr-1 size-4" />
												{t("mail.reply_all", {
													defaultValue:
														"Reply All",
												})}
											</Link>
										</Button>
										<Button
											variant="outline"
											size="sm"
											asChild
										>
											<Link
												to={`/mail/compose?forward=${msg.id}`}
											>
												<Forward className="mr-1 size-4" />
												{t("mail.forward", {
													defaultValue:
														"Forward",
												})}
											</Link>
										</Button>
										<div className="flex-1" />
										<Button
											variant="ghost"
											size="sm"
											className="text-destructive hover:text-destructive hover:bg-destructive/10"
											onClick={() =>
												setDeleteMessageId(msg.id)
											}
										>
											<Trash2 className="size-4" />
										</Button>
									</div>
								</div>
							)}
						</div>
					);
				})}
			</div>

			{/* Delete confirmation dialog */}
			<AlertDialog
				open={!!deleteMessageId}
				onOpenChange={(open) => !open && setDeleteMessageId(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{t("mail.delete")}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{t("mail.delete_confirm")}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>
							{t("common.actions.cancel")}
						</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleDeleteMessage}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						>
							{t("common.actions.delete")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
