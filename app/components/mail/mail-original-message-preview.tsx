import { useTranslation } from "react-i18next";
import type { CommitteeMailMessage } from "~/db/client";

type Props = {
	composeMode: "new" | "reply" | "replyAll" | "forward";
	originalMessage: CommitteeMailMessage | null;
};

export function MailOriginalMessagePreview({ composeMode, originalMessage }: Props) {
	const { t } = useTranslation();
	if (!originalMessage) return null;

	if (composeMode === "reply" || composeMode === "replyAll") {
		return (
			<div className="rounded-md border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900">
				<p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
					{t("mail.quoted_reply_header", {
						date: new Date(originalMessage.date).toLocaleString(),
						name: originalMessage.fromName || originalMessage.fromAddress,
						email: originalMessage.fromAddress,
						defaultValue: `On ${new Date(originalMessage.date).toLocaleString()}, ${originalMessage.fromName || originalMessage.fromAddress} wrote:`,
					})}
				</p>
				<div
					className="prose prose-sm dark:prose-invert max-w-none border-l-2 border-gray-300 pl-3 text-gray-500 dark:border-gray-600 dark:text-gray-400"
					// biome-ignore lint/security/noDangerouslySetInnerHtml: original email body from DB
					dangerouslySetInnerHTML={{ __html: originalMessage.bodyHtml ?? "" }}
				/>
			</div>
		);
	}

	if (composeMode === "forward") {
		return (
			<div className="rounded-md border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900">
				<p className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">
					---------- {t("mail.forwarded_message", { defaultValue: "Forwarded message" })} ----------
				</p>
				<div className="mb-2 grid gap-1 text-xs text-gray-500 dark:text-gray-400">
					<p>
						{t("mail.from")}: {originalMessage.fromName ? `${originalMessage.fromName} <${originalMessage.fromAddress}>` : originalMessage.fromAddress}
					</p>
					<p>
						{t("mail.date")}: {new Date(originalMessage.date).toLocaleString()}
					</p>
					<p>
						{t("committee.mail.subject")}: {originalMessage.subject}
					</p>
				</div>
				<div className="prose prose-sm dark:prose-invert max-w-none text-gray-500 dark:text-gray-400">
					<div
						className="[&_*]:!bg-transparent [&_*]:text-inherit"
						// biome-ignore lint/security/noDangerouslySetInnerHtml: forwarded email body from DB
						dangerouslySetInnerHTML={{ __html: originalMessage.bodyHtml ?? "" }}
					/>
				</div>
			</div>
		);
	}

	return null;
}
