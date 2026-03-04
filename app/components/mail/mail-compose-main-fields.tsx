import { useTranslation } from "react-i18next";
import { RecipientField } from "~/components/committee-recipient-field";
import { Input } from "~/components/ui/input";
import { RichTextEditor } from "~/components/ui/rich-text-editor";
import { useMailDraftCompose } from "~/contexts/mail-draft-compose-context";

export function MailComposeMainFields() {
	const { t } = useTranslation();
	const {
		toRecipients,
		ccRecipients,
		bccRecipients,
		addToRecipients,
		addCcRecipients,
		addBccRecipients,
		removeToRecipient,
		removeCcRecipient,
		removeBccRecipient,
		roles,
		recipientCandidates,
		getRecipientsForRole,
		subject,
		setSubject,
		body,
		setBody,
		lastSavedAt,
	} = useMailDraftCompose();

	return (
		<div className="flex flex-col gap-4 lg:col-span-2">
			<RecipientField
				field="to"
				recipients={toRecipients}
				onAdd={addToRecipients}
				onRemove={removeToRecipient}
				roles={roles}
				recipientCandidates={recipientCandidates}
				onGetRecipientsForRole={(roleId) => getRecipientsForRole(roleId, "to")}
				listId="compose-to-list"
				label={t("committee.mail.to")}
			/>
			<RecipientField
				field="cc"
				recipients={ccRecipients}
				onAdd={addCcRecipients}
				onRemove={removeCcRecipient}
				roles={roles}
				recipientCandidates={recipientCandidates}
				onGetRecipientsForRole={(roleId) => getRecipientsForRole(roleId, "cc")}
				listId="compose-cc-list"
				label={t("committee.mail.cc")}
			/>
			<RecipientField
				field="bcc"
				recipients={bccRecipients}
				onAdd={addBccRecipients}
				onRemove={removeBccRecipient}
				roles={roles}
				recipientCandidates={recipientCandidates}
				onGetRecipientsForRole={(roleId) => getRecipientsForRole(roleId, "bcc")}
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
					onChange={(e) => setSubject(e.target.value)}
					className="h-8 flex-1 text-sm"
					placeholder={t("committee.mail.subject_placeholder")}
				/>
			</div>

			<div className="flex flex-col gap-1">
				<RichTextEditor
					value={body}
					onChange={setBody}
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
