import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { Trash2 } from "lucide-react";
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
	const [deleteOpen, setDeleteOpen] = useState(false);
	const deleteFetcher = useFetcher();

	const handleConfirmDelete = () => {
		const formData = new FormData();
		formData.set("_action", "deleteMessage");
		formData.set("messageId", message.id);
		formData.set("direction", message.direction);
		deleteFetcher.submit(formData, { action: "/mail", method: "post" });
		setDeleteOpen(false);
	};

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-end gap-2">
				<Button
					variant="ghost"
					size="sm"
					className="text-destructive hover:text-destructive hover:bg-destructive/10"
					onClick={() => setDeleteOpen(true)}
					aria-label={t("mail.delete")}
				>
					<Trash2 className="size-4" />
					{t("mail.delete")}
				</Button>
			</div>

			<AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t("mail.delete")}</AlertDialogTitle>
						<AlertDialogDescription>
							{t("mail.delete_confirm")}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{t("common.actions.cancel")}</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleConfirmDelete}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						>
							{t("common.actions.delete")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

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
