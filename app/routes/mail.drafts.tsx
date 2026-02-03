import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { FileText } from "lucide-react";
import { getDatabase } from "~/db";
import { requirePermission } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import { cn } from "~/lib/utils";
import type { Route } from "./+types/mail.drafts";

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
		return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
	}
	return d.toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
	});
}

export default function MailDrafts({ loaderData }: Route.ComponentProps) {
	const { drafts } = loaderData;
	const { t } = useTranslation();

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
						const preview = firstLine(draft.body);
						return (
							<Link
								key={draft.id}
								to={`/mail/drafts?compose=${draft.id}`}
								className={cn(
									"flex items-start gap-3 px-2 py-3 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800/50",
								)}
							>
								<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-sm font-medium">
									{subject.slice(0, 1).toUpperCase() || "D"}
								</div>
								<div className="min-w-0 flex-1">
									<div className="flex items-center justify-between gap-2">
										<span className="truncate text-sm font-medium text-gray-900 dark:text-white">
											{subject}
										</span>
										<span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
											{formatDraftDate(draft.updatedAt)}
										</span>
									</div>
									{preview && (
										<p className="truncate text-sm text-gray-600 dark:text-gray-300 mt-0.5">
											{preview}
										</p>
									)}
								</div>
							</Link>
						);
					})}
				</div>
			)}
		</div>
	);
}
