import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
	Form,
	useActionData,
	useFetcher,
	useSearchParams,
} from "react-router";
import { Mail } from "lucide-react";
import { toast } from "sonner";
import { MailItem } from "~/components/mail/mail-item";
import { getDatabase } from "~/db";
import { requirePermission } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import type { Route } from "./+types/mail._index";

export function meta({ data }: Route.MetaArgs) {
	return [
		{ title: `${data?.siteConfig?.name || "Portal"} - Mail` },
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request }: Route.LoaderArgs) {
	await requirePermission(request, "committee:email", getDatabase);
	const url = new URL(request.url);
	const direction = (url.searchParams.get("direction") || "inbox") as
		| "inbox"
		| "sent";
	const db = getDatabase();

	// Use threaded view
	const threads = await db.getCommitteeMailThreads(direction, 50, 0);

	return {
		siteConfig: SITE_CONFIG,
		threads,
		direction,
	};
}

export async function action({ request }: Route.ActionArgs) {
	await requirePermission(request, "committee:email", getDatabase);
	const formData = await request.formData();
	const intent = formData.get("_action") as string;
	if (intent === "refreshInbox") {
		const { fetchInboxMessages } = await import("~/lib/mail-imap.server");
		const db = getDatabase();
		const result = await fetchInboxMessages(db, 50);
		return {
			refreshed: true,
			count: result.count,
			error: result.error,
		};
	}
	return { refreshed: false };
}

function formatRecipients(toJson: string, direction: string): string {
	try {
		const arr = JSON.parse(toJson) as { email: string; name?: string }[];
		if (!Array.isArray(arr) || arr.length === 0) return "";
		if (direction === "sent") {
			return arr.map((r) => r.name || r.email).join(", ");
		}
		return arr[0]?.name || arr[0]?.email || "";
	} catch {
		return "";
	}
}

function formatDate(date: Date | string): string {
	const d = typeof date === "string" ? new Date(date) : date;
	const now = new Date();
	const sameDay =
		d.getDate() === now.getDate() &&
		d.getMonth() === now.getMonth() &&
		d.getFullYear() === now.getFullYear();
	if (sameDay) {
		return d.toLocaleTimeString(undefined, {
			hour: "2-digit",
			minute: "2-digit",
		});
	}
	return d.toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
	});
}

export default function MailIndex({ loaderData }: Route.ComponentProps) {
	const { threads, direction } = loaderData;
	const { t } = useTranslation();
	const [searchParams] = useSearchParams();
	const actionData = useActionData<typeof action>();
	const currentDirection = searchParams.get("direction") || "inbox";
	const deleteFetcher = useFetcher();

	const handleDeleteMessage = useCallback(
		(messageId: string) => {
			const formData = new FormData();
			formData.set("_action", "deleteMessage");
			formData.set("messageId", messageId);
			formData.set("direction", currentDirection);
			deleteFetcher.submit(formData, {
				action: "/mail",
				method: "post",
			});
		},
		[currentDirection, deleteFetcher],
	);

	useEffect(() => {
		if (actionData && "refreshed" in actionData && actionData.refreshed) {
			const data = actionData as { count?: number; error?: string };
			if (data.error) toast.error(data.error);
			else if (typeof data.count === "number" && data.count > 0)
				toast.success(t("mail.refreshed", { count: data.count }));
		}
	}, [actionData, t]);

	useEffect(() => {
		if (deleteFetcher.data && "deleted" in deleteFetcher.data) {
			const data = deleteFetcher.data as {
				deleted?: boolean;
				error?: string;
			};
			if (data.deleted) toast.success(t("mail.delete_success"));
			else if (data.error)
				toast.error(data.error || t("mail.delete_error"));
		}
	}, [deleteFetcher.data, t]);

	return (
		<div className="flex flex-col">
			{/* Toolbar: Refresh for inbox */}
			<div className="mb-2 flex items-center justify-between border-b border-gray-200 pb-2 dark:border-gray-700">
				<h2 className="text-lg font-semibold text-gray-900 dark:text-white">
					{currentDirection === "sent"
						? t("mail.sent")
						: t("mail.inbox")}
				</h2>
				{currentDirection === "inbox" && (
					<Form method="post">
						<input
							type="hidden"
							name="_action"
							value="refreshInbox"
						/>
						<button
							type="submit"
							className="text-sm text-primary hover:underline"
						>
							{t("mail.refresh")}
						</button>
					</Form>
				)}
			</div>

			{/* Thread list */}
			<div className="divide-y divide-gray-200 dark:divide-gray-700">
				{threads.length === 0 ? (
					<div className="py-12 text-center text-gray-500 dark:text-gray-400">
						<Mail className="mx-auto size-12 opacity-50" />
						<p className="mt-2">{t("mail.no_messages")}</p>
					</div>
				) : (
					threads.map((thread) => {
						const msg = thread.latestMessage;
						const threadHref = msg.threadId
							? `/mail/thread/${encodeURIComponent(msg.threadId)}`
							: `/mail/${msg.id}`;
						return (
							<MailItem
								key={thread.threadId}
								type="message"
								id={msg.id}
								primaryText={
									direction === "sent"
										? formatRecipients(
												msg.toJson,
												"sent",
											)
										: msg.fromName ||
											msg.fromAddress ||
											""
								}
								secondaryText={
									msg.subject || t("mail.no_subject")
								}
								date={formatDate(msg.date)}
								href={threadHref}
								onDelete={handleDeleteMessage}
								threadCount={thread.messageCount}
							/>
						);
					})
				)}
			</div>
		</div>
	);
}
