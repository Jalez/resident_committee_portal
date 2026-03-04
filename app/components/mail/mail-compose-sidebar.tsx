import { useTranslation } from "react-i18next";
import { MailAttachmentsPanel } from "~/components/mail/mail-attachments-panel";
import { RelationshipPicker } from "~/components/relationships/relationship-picker";
import { useMailDraftCompose } from "~/contexts/mail-draft-compose-context";

export function MailComposeSidebar() {
	const { t } = useTranslation();
	const {
		draftId,
		relationAId,
		subject,
		relationships,
		getRelationshipFormData,
		handleLink,
		handleUnlink,
		relationAttachmentItems,
		excludedKeys,
		attachmentState,
		includedRelationAttachmentCount,
		uploadManualAttachment,
		includeRelationAttachment,
		excludeRelationAttachment,
		removeManualAttachment,
	} = useMailDraftCompose();
	if (!draftId) return null;

	return (
		<div className="lg:col-span-1">
			<RelationshipPicker
				relationAType="mail_thread"
				relationAId={relationAId}
				relationAName={subject || t("mail.no_subject")}
				mode="edit"
				currentPath={`/mail/drafts/${draftId}/edit`}
				sections={[
					{ type: "receipt" as const },
					{ type: "reimbursement" as const, maxItems: 1 },
					{ type: "transaction" as const, maxItems: 1 },
					{ type: "event" as const, maxItems: 1 },
					{ type: "minute" as const, maxItems: 1 },
				].flatMap(({ type, maxItems }) => {
					const relData = relationships[type];
					if (!relData) return [];
					return [
						{
							relationBType: type,
							linkedEntities: relData.linked as any[],
							availableEntities: relData.available as any[],
							canWrite: relData.canWrite ?? false,
							maxItems,
						},
					];
				})}
				onLink={handleLink}
				onUnlink={handleUnlink}
				formData={getRelationshipFormData()}
			/>
			<MailAttachmentsPanel
				relationAttachmentItems={relationAttachmentItems}
				excludedKeys={excludedKeys}
				manualAttachments={attachmentState.manualAttachments}
				includedRelationAttachmentCount={includedRelationAttachmentCount}
				onUploadManualAttachment={uploadManualAttachment}
				onIncludeRelationAttachment={includeRelationAttachment}
				onExcludeRelationAttachment={excludeRelationAttachment}
				onRemoveManualAttachment={removeManualAttachment}
			/>
		</div>
	);
}
