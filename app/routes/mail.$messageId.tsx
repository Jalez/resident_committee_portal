import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "~/components/ui/button";
import { getDatabase } from "~/db";
import { requirePermission } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import type { Route } from "./+types/mail.$messageId";

export function meta({ data }: Route.MetaArgs) {
	const subject = data?.message?.subject;
	return [
		{
			title: subject
				? `${data?.siteConfig?.name || "Portal"} - ${subject}`
				: `${data?.siteConfig?.name || "Portal"} - Mail`,
		},
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request, params }: Route.LoaderArgs) {
	await requirePermission(request, "committee:email", getDatabase);
	const messageId = params.messageId;
	if (!messageId) throw new Response("Not Found", { status: 404 });
	const db = getDatabase();
	const message = await db.getCommitteeMailMessageById(messageId);
	if (!message) throw new Response("Not Found", { status: 404 });
	return {
		siteConfig: SITE_CONFIG,
		message,
	};
}

function formatRecipientsJson(json: string | null): string {
	if (!json) return "";
	try {
		const arr = JSON.parse(json) as { email: string; name?: string }[];
		if (!Array.isArray(arr)) return "";
		return arr.map((r) => (r.name ? `${r.name} <${r.email}>` : r.email)).join(", ");
	} catch {
		return "";
	}
}

export default function MailMessage({ loaderData }: Route.ComponentProps) {
	const { message } = loaderData;
	const { t } = useTranslation();
	const backTo =
		message.direction === "sent"
			? "/mail?direction=sent"
			: "/mail?direction=inbox";

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center gap-2">
				<Button variant="ghost" size="sm" asChild>
					<Link to={backTo}>
						<ArrowLeft className="size-4" />
						{t("mail.back")}
					</Link>
				</Button>
			</div>

			{/* Header */}
			<div className="space-y-2 border-b border-gray-200 dark:border-gray-700 pb-4">
				<h1 className="text-xl font-semibold text-gray-900 dark:text-white">
					{message.subject || "(No subject)"}
				</h1>
				<div className="grid gap-1 text-sm text-gray-600 dark:text-gray-400">
					<div className="flex gap-2">
						<span className="shrink-0 font-medium">{t("mail.from")}:</span>
						<span>
							{message.fromName
								? `${message.fromName} <${message.fromAddress}>`
								: message.fromAddress}
						</span>
					</div>
					<div className="flex gap-2">
						<span className="shrink-0 font-medium">{t("mail.to")}:</span>
						<span>{formatRecipientsJson(message.toJson)}</span>
					</div>
					{message.ccJson && (
						<div className="flex gap-2">
							<span className="shrink-0 font-medium">{t("mail.cc")}:</span>
							<span>{formatRecipientsJson(message.ccJson)}</span>
						</div>
					)}
					<div className="flex gap-2">
						<span className="shrink-0 font-medium">{t("mail.date")}:</span>
						<span>
							{new Date(message.date).toLocaleString(undefined, {
								dateStyle: "medium",
								timeStyle: "short",
							})}
						</span>
					</div>
				</div>
			</div>

			{/* Body - email HTML from sent/inbox storage */}
			<div
				className="prose prose-sm dark:prose-invert max-w-none text-gray-900 dark:text-gray-100"
				// biome-ignore lint/security/noDangerouslySetInnerHtml: email body from DB (sent by us or fetched via IMAP)
				dangerouslySetInnerHTML={{ __html: message.bodyHtml }}
			/>
		</div>
	);
}
