import { Loader2, Mail, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
	Await,
	Form,
	useActionData,
	useFetcher,
	useNavigation,
	useRevalidator,
} from "react-router";
import { Suspense, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { MailItem } from "~/components/mail/mail-item";
import { Button } from "~/components/ui/button";
import { getDatabase } from "~/db/server.server";
import { requirePermission } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import type { RelationBadgeData } from "~/lib/relations-column.server";
import { loadRelationsMapForEntities } from "~/lib/relations-column.server";
import type { Route } from "./+types/_index";

export function meta({ data }: Route.MetaArgs) {
	return [
		{ title: `${data?.siteConfig?.name || "Portal"} - Mail` },
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request }: Route.LoaderArgs) {
	const user = await requirePermission(request, "committee:email", getDatabase);
	const url = new URL(request.url);
	const pathname = url.pathname;
	const direction = pathname.endsWith("/sent") ? "sent" : "inbox";
	const db = getDatabase();

	const loadData = async () => {
		const threads = await db.getCommitteeMailThreads(direction, 50, 0);
		const messageIds = threads.map((thread) => thread.latestMessage.id);
		const relationsMap = await loadRelationsMapForEntities(
			db,
			"mail",
			messageIds,
			undefined,
			user.permissions,
		);
		const serializedRelationsMap: Record<string, RelationBadgeData[]> = {};
		for (const [id, relations] of relationsMap) {
			serializedRelationsMap[id] = relations;
		}

		return {
			threads,
			relationsMap: serializedRelationsMap,
		};
	};

	return {
		siteConfig: SITE_CONFIG,
		direction,
		dataPromise: loadData(),
	};
}

export async function action({ request }: Route.ActionArgs) {
	await requirePermission(request, "committee:email", getDatabase);
	const formData = await request.formData();
	const intent = formData.get("_action") as string;
	if (intent === "refreshInbox") {
		const { syncCommitteeMail } = await import("~/lib/mail-imap.server");
		const db = getDatabase();
		const result = await syncCommitteeMail(db, 50);
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

export default function MailInbox({ loaderData }: Route.ComponentProps) {
	const { direction, dataPromise } = loaderData;
	const { t } = useTranslation();
	const actionData = useActionData<typeof action>();
	const deleteFetcher = useFetcher();
	const navigation = useNavigation();
	const revalidator = useRevalidator();
	const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

	const handleDeleteMessage = useCallback(
		(messageId: string) => {
			const formData = new FormData();
			formData.set("_action", "deleteMessage");
			formData.set("messageId", messageId);
			formData.set("direction", direction);
			deleteFetcher.submit(formData, {
				action: "/mail",
				method: "post",
			});
		},
		[direction, deleteFetcher],
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
			else if (data.error) toast.error(data.error || t("mail.delete_error"));
		}
	}, [deleteFetcher.data, t]);

	useEffect(() => {
		if (
			(actionData && "refreshed" in actionData) ||
			navigation.state === "idle"
		) {
			setLastRefreshed(new Date());
		}
	}, [actionData, navigation.state]);

	return (
		<div className="flex flex-col">
			<div className="mb-2 flex items-center justify-between border-b border-gray-200 pb-2 dark:border-gray-700">
				<h2 className="text-lg font-semibold text-gray-900 dark:text-white">
					{direction === "sent" ? t("mail.sent") : t("mail.inbox")}
				</h2>
				<div className="flex items-center gap-4">
					<span className="text-xs text-gray-500 dark:text-gray-400">
						{t("mail.last_refreshed", {
							defaultValue: "Updated: {{time}}",
							time: lastRefreshed.toLocaleTimeString([], {
								hour: "2-digit",
								minute: "2-digit",
							}),
						})}
					</span>
					<Form method="post" className="flex">
						<input type="hidden" name="_action" value="refreshInbox" />
						<Button
							variant="ghost"
							size="sm"
							type="submit"
							disabled={navigation.state === "submitting"}
							className="h-8 px-2 text-primary hover:text-primary hover:bg-primary/10"
						>
							{navigation.state === "submitting" &&
								navigation.formData?.get("_action") === "refreshInbox" ? (
								<Loader2 className="mr-2 size-4 animate-spin" />
							) : (
								<RefreshCw className="mr-2 size-4" />
							)}
							{t("mail.refresh")}
						</Button>
					</Form>
				</div>
			</div>

			<div className="divide-y divide-gray-200 dark:divide-gray-700">
				<Suspense
					fallback={
						<div className="py-12 flex justify-center">
							<Loader2 className="animate-spin size-8 text-primary/50" />
						</div>
					}
				>
					<Await resolve={dataPromise}>
						{(data) => {
							const { threads, relationsMap: relationsMapRaw } = data;
							const relationsMap = new Map(
								Object.entries(
									(relationsMapRaw ?? {}) as Record<string, RelationBadgeData[]>,
								),
							);

							if (threads.length === 0) {
								return (
									<div className="py-12 text-center text-gray-500 dark:text-gray-400">
										<Mail className="mx-auto size-12 opacity-50" />
										<p className="mt-2">{t("mail.no_messages")}</p>
									</div>
								);
							}

							return threads.map((thread) => {
								const msg = thread.latestMessage;
								const threadHref = msg.threadId
									? `/mail/thread/${encodeURIComponent(msg.threadId)}`
									: `/mail/messages/${msg.id}`;
								return (
									<MailItem
										key={thread.threadId}
										type="message"
										id={msg.id}
										primaryText={
											direction === "sent"
												? formatRecipients(msg.toJson, "sent")
												: msg.fromName || msg.fromAddress || ""
										}
										secondaryText={msg.subject || t("mail.no_subject")}
										date={formatDate(msg.date)}
										href={threadHref}
										onDelete={handleDeleteMessage}
										threadCount={thread.messageCount}
										relations={relationsMap.get(msg.id) || []}
									/>
								);
							});
						}}
					</Await>
				</Suspense>
			</div>
		</div>
	);
}
