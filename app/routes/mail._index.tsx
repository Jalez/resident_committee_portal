import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Form, Link, useActionData, useSearchParams } from "react-router";
import { Mail } from "lucide-react";
import { toast } from "sonner";
import { getDatabase } from "~/db";
import { requirePermission } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import { cn } from "~/lib/utils";
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
	const direction = (url.searchParams.get("direction") || "inbox") as "inbox" | "sent";
	const db = getDatabase();
	const messages = await db.getCommitteeMailMessages(direction, 50, 0);
	return {
		siteConfig: SITE_CONFIG,
		messages,
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
		return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
	}
	return d.toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
	});
}

export default function MailIndex({ loaderData }: Route.ComponentProps) {
	const { messages, direction } = loaderData;
	const { t } = useTranslation();
	const [searchParams] = useSearchParams();
	const actionData = useActionData<typeof action>();
	const currentDirection = searchParams.get("direction") || "inbox";

	useEffect(() => {
		if (actionData && "refreshed" in actionData && actionData.refreshed) {
			const data = actionData as { count?: number; error?: string };
			if (data.error) toast.error(data.error);
			else if (typeof data.count === "number" && data.count > 0)
				toast.success(t("mail.refreshed", { count: data.count }));
		}
	}, [actionData, t]);

	return (
		<div className="flex flex-col">
			{/* Toolbar: Refresh for inbox */}
			<div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 pb-2 mb-2">
				<h2 className="text-lg font-semibold text-gray-900 dark:text-white">
					{currentDirection === "sent" ? t("mail.sent") : t("mail.inbox")}
				</h2>
				{currentDirection === "inbox" && (
					<Form method="post">
						<input type="hidden" name="_action" value="refreshInbox" />
						<button
							type="submit"
							className="text-sm text-primary hover:underline"
						>
							{t("mail.refresh")}
						</button>
					</Form>
				)}
			</div>

			{/* Message list */}
			<div className="divide-y divide-gray-200 dark:divide-gray-700">
				{messages.length === 0 ? (
					<div className="py-12 text-center text-gray-500 dark:text-gray-400">
						<Mail className="mx-auto size-12 opacity-50" />
						<p className="mt-2">{t("mail.no_messages")}</p>
					</div>
				) : (
					messages.map((msg) => (
						<Link
							key={msg.id}
							to={`/mail/${msg.id}`}
							className={cn(
								"flex items-start gap-3 px-2 py-3 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800/50",
							)}
						>
							<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-sm font-medium">
								{(direction === "sent"
									? formatRecipients(msg.toJson, "sent")
									: msg.fromName || msg.fromAddress
								).slice(0, 1).toUpperCase()}
							</div>
							<div className="min-w-0 flex-1">
								<div className="flex items-center justify-between gap-2">
									<span className="truncate text-sm font-medium text-gray-900 dark:text-white">
										{direction === "sent"
											? formatRecipients(msg.toJson, "sent")
											: msg.fromName || msg.fromAddress}
									</span>
									<span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
										{formatDate(msg.date)}
									</span>
								</div>
								<p className="truncate text-sm text-gray-600 dark:text-gray-300">
									{msg.subject || "(No subject)"}
								</p>
							</div>
						</Link>
					))
				)}
			</div>
		</div>
	);
}
