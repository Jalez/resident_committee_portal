import { ArrowLeft, Save, Send, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { SmartAutofillButton } from "~/components/smart-autofill-button";
import { Button } from "~/components/ui/button";
import { useMailDraftCompose } from "~/contexts/mail-draft-compose-context";

export function MailComposeHeader() {
	const { t } = useTranslation();
	const {
		composeMode,
		draftId,
		relationAId,
		subject,
		body,
		canSubmit,
		isSubmitting,
		missingRequiredReimbursementAttachments,
		saveDisabled,
		handleManualSave,
		handleDeleteDraft,
		handleAutofillSuggestions,
		getRelationshipFormData,
	} = useMailDraftCompose();

	const composeTitleKey =
		composeMode === "reply"
			? "mail.compose_reply"
			: composeMode === "replyAll"
				? "mail.compose_reply_all"
				: composeMode === "forward"
					? "mail.compose_forward"
					: "mail.compose_new";

	return (
		<>
			<div className="flex items-center justify-between border-b border-gray-200 pb-3 dark:border-gray-700">
				<div className="flex items-center gap-2">
					<Button variant="ghost" size="icon" asChild className="shrink-0">
						<Link to="/mail">
							<ArrowLeft className="size-4" />
						</Link>
					</Button>
					<h1 className="text-lg font-semibold text-gray-900 dark:text-white">
						{t(composeTitleKey, {
							defaultValue: t("mail.compose"),
						})}
					</h1>
				</div>
				<div className="flex items-center gap-2">
					{draftId && (
						<SmartAutofillButton
							entityType="mail_thread"
							entityId={relationAId}
							getCurrentValues={() => ({ subject, body })}
							getExtraFormData={getRelationshipFormData}
							onSuggestions={handleAutofillSuggestions}
						/>
					)}
					{draftId && (
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={handleManualSave}
							disabled={saveDisabled}
						>
							<Save className="mr-1 size-4" />
							{t("mail.save_draft", { defaultValue: "Save draft" })}
						</Button>
					)}
					{draftId && (
						<Button
							variant="ghost"
							size="sm"
							type="button"
							className="text-destructive hover:text-destructive hover:bg-destructive/10"
							onClick={handleDeleteDraft}
						>
							<Trash2 className="mr-1 size-4" />
							{t("mail.delete_draft", { defaultValue: "Delete draft" })}
						</Button>
					)}
					<Button
						type="submit"
						disabled={!canSubmit || isSubmitting || missingRequiredReimbursementAttachments}
						size="sm"
					>
						<Send className="mr-1 size-4" />
						{t("mail.send_tooltip")}
					</Button>
				</div>
			</div>
			{missingRequiredReimbursementAttachments && (
				<p className="text-destructive text-sm">
					Link at least one receipt and one minutes document before sending a
					reimbursement email.
				</p>
			)}
		</>
	);
}
