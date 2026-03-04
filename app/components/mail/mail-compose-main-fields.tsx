import { useTranslation } from "react-i18next";
import type { RecipientEntry } from "~/components/committee-recipient-field";
import { RecipientField } from "~/components/committee-recipient-field";
import { Input } from "~/components/ui/input";
import { RichTextEditor } from "~/components/ui/rich-text-editor";

type RecipientCandidate = { id: string; name: string; email: string };
type RoleOption = { id: string; name: string };

export function MailComposeMainFields({
	toRecipients,
	ccRecipients,
	bccRecipients,
	onAddToRecipients,
	onAddCcRecipients,
	onAddBccRecipients,
	onRemoveToRecipient,
	onRemoveCcRecipient,
	onRemoveBccRecipient,
	roles,
	recipientCandidates,
	onGetRecipientsForRole,
	subject,
	onSubjectChange,
	body,
	onBodyChange,
	lastSavedAt,
}: {
	toRecipients: RecipientEntry[];
	ccRecipients: RecipientEntry[];
	bccRecipients: RecipientEntry[];
	onAddToRecipients: (entries: { email: string; name?: string }[]) => void;
	onAddCcRecipients: (entries: { email: string; name?: string }[]) => void;
	onAddBccRecipients: (entries: { email: string; name?: string }[]) => void;
	onRemoveToRecipient: (id: string) => void;
	onRemoveCcRecipient: (id: string) => void;
	onRemoveBccRecipient: (id: string) => void;
	roles: RoleOption[];
	recipientCandidates: RecipientCandidate[];
	onGetRecipientsForRole: (
		roleId: string,
		field: "to" | "cc" | "bcc",
	) => void;
	subject: string;
	onSubjectChange: (value: string) => void;
	body: string;
	onBodyChange: (value: string) => void;
	lastSavedAt: Date | null;
}) {
	const { t } = useTranslation();

	return (
		<div className="flex flex-col gap-4 lg:col-span-2">
			<RecipientField
				field="to"
				recipients={toRecipients}
				onAdd={onAddToRecipients}
				onRemove={onRemoveToRecipient}
				roles={roles}
				recipientCandidates={recipientCandidates}
				onGetRecipientsForRole={(roleId) => onGetRecipientsForRole(roleId, "to")}
				listId="compose-to-list"
				label={t("committee.mail.to")}
			/>
			<RecipientField
				field="cc"
				recipients={ccRecipients}
				onAdd={onAddCcRecipients}
				onRemove={onRemoveCcRecipient}
				roles={roles}
				recipientCandidates={recipientCandidates}
				onGetRecipientsForRole={(roleId) => onGetRecipientsForRole(roleId, "cc")}
				listId="compose-cc-list"
				label={t("committee.mail.cc")}
			/>
			<RecipientField
				field="bcc"
				recipients={bccRecipients}
				onAdd={onAddBccRecipients}
				onRemove={onRemoveBccRecipient}
				roles={roles}
				recipientCandidates={recipientCandidates}
				onGetRecipientsForRole={(roleId) =>
					onGetRecipientsForRole(roleId, "bcc")
				}
				listId="compose-bcc-list"
				label={t("committee.mail.bcc")}
			/>

			<div className="flex items-center gap-2">
				<span className="w-48 shrink-0 truncate text-sm font-medium">
					{t("committee.mail.subject")}:
				</span>
				<Input
					name="subject"
					type="text"
					required
					value={subject}
					onChange={(e) => onSubjectChange(e.target.value)}
					className="h-8 flex-1 text-sm"
					placeholder={t("committee.mail.subject_placeholder")}
				/>
			</div>

			<div className="flex flex-col gap-1">
				<RichTextEditor
					value={body}
					onChange={onBodyChange}
					placeholder={t("committee.mail.body_placeholder")}
				/>
				{lastSavedAt && (
					<p className="text-muted-foreground text-sm">
						{t("mail.draft_saved_at", {
							time: lastSavedAt.toLocaleTimeString(undefined, {
								hour: "2-digit",
								minute: "2-digit",
							}),
						})}
					</p>
				)}
			</div>
		</div>
	);
}
