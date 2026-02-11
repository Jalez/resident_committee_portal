import { FileText } from "lucide-react";
import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { MailItem } from "~/components/mail/mail-item";
import { getDatabase } from "~/db";
import { requirePermission } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import type { Route } from "./+types/_index";

export function meta({ data }: Route.MetaArgs) {
	return [
		{ title: `${data?.siteConfig?.name || "Portal"} - Drafts` },
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request }: Route.LoaderArgs) {
	await requirePermission(request, "committee:email", getDatabase);
	const db = getDatabase();
	const drafts = await db.getMailDrafts(50);
	return {
		siteConfig: SITE_CONFIG,
		drafts,
	};
}

function firstLine(body: string | null): string {
	if (!body?.trim()) return "";
	const line = body.split("\n")[0].trim();
	return line.length > 60 ? `${line.slice(0, 57)}...` : line;
}

function formatDraftDate(updatedAt: Date | string | null): string {
	if (!updatedAt) return "";
	const d = typeof updatedAt === "string" ? new Date(updatedAt) : updatedAt;
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

function formatDraftRecipients(toJson: string | null): string {
	if (!toJson) return "";
	try {
		const arr = JSON.parse(toJson) as { email: string; name?: string }[];
		if (!Array.isArray(arr) || arr.length === 0) return "";
		return arr.map((r) => r.name || r.email).join(", ");
	} catch {
		return "";
	}
}

export default function MailDrafts({ loaderData }: Route.ComponentProps) {
	const { drafts } = loaderData;
	const { t } = useTranslation();
	const deleteFetcher = useFetcher();

	const handleDeleteDraft = useCallback(
		(draftId: string) => {
			const formData = new FormData();
			formData.set("_action", "deleteDraft");
			formData.set("draftId", draftId);
			deleteFetcher.submit(formData, { action: "/mail", method: "post" });
		},
		[deleteFetcher],
	);

	useEffect(() => {
		if (deleteFetcher.data && "deleted" in deleteFetcher.data) {
			const data = deleteFetcher.data as { deleted?: boolean; error?: string };
			if (data.deleted) toast.success(t("mail.delete_success"));
			else if (data.error) toast.error(data.error || t("mail.delete_error"));
		}
	}, [deleteFetcher.data, t]);

	return (
		<div className="flex flex-col">
			<div className="border-b border-gray-200 dark:border-gray-700 pb-2 mb-2">
				<h2 className="text-lg font-semibold text-gray-900 dark:text-white">
					{t("mail.drafts")}
				</h2>
			</div>

			{drafts.length === 0 ? (
				<div className="py-12 text-center text-gray-500 dark:text-gray-400">
					<FileText className="mx-auto size-12 opacity-50" />
					<p className="mt-2">{t("mail.no_drafts")}</p>
				</div>
			) : (
				<div className="divide-y divide-gray-200 dark:divide-gray-700">
					{drafts.map((draft) => {
						const subject = draft.subject?.trim() || t("mail.no_subject");
						const recipients = formatDraftRecipients(draft.toJson);
						const preview = firstLine(draft.body);
						return (
							<MailItem
								key={draft.id}
								type="draft"
								id={draft.id}
								primaryText={
									recipients ||
									t("mail.draft_no_recipients", {
										defaultValue: "No recipients",
									})
								}
								secondaryText={subject}
								date={formatDraftDate(draft.updatedAt)}
								preview={preview || undefined}
								href={`/mail/compose?draftId=${draft.id}`}
								onDelete={handleDeleteDraft}
							/>
						);
					})}
				</div>
			)}
		</div>
	);
}
