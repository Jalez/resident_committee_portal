import { useTranslation } from "react-i18next";
import { MailAttachmentsPanel } from "~/components/mail/mail-attachments-panel";
import type { RelationAttachmentItem } from "~/components/mail/mail-attachments-panel";
import { RelationshipPicker } from "~/components/relationships/relationship-picker";
import type { RelationshipEntityType } from "~/db/types";
import type { DraftAttachmentState, RelationAttachmentKey } from "~/lib/mail-draft-attachments";

type RelationshipSectionData = {
	linked: unknown[];
	available: unknown[];
	canWrite?: boolean;
};

export function MailComposeSidebar({
	draftId,
	relationAId,
	subject,
	relationships,
	formData,
	onLink,
	onUnlink,
	relationAttachmentItems,
	excludedKeys,
	attachmentState,
	includedRelationAttachmentCount,
	onUploadManualAttachment,
	onIncludeRelationAttachment,
	onExcludeRelationAttachment,
	onRemoveManualAttachment,
}: {
	draftId: string;
	relationAId: string;
	subject: string;
	relationships: Record<string, RelationshipSectionData | undefined>;
	formData: Record<string, string>;
	onLink: (
		relationBType: RelationshipEntityType,
		relationBId: string,
		metadata?: Record<string, unknown>,
	) => void;
	onUnlink: (relationBType: RelationshipEntityType, relationBId: string) => void;
	relationAttachmentItems: RelationAttachmentItem[];
	excludedKeys: Set<string>;
	attachmentState: DraftAttachmentState;
	includedRelationAttachmentCount: number;
	onUploadManualAttachment: (file: File | null) => void | Promise<void>;
	onIncludeRelationAttachment: (key: RelationAttachmentKey) => void;
	onExcludeRelationAttachment: (key: RelationAttachmentKey) => void;
	onRemoveManualAttachment: (id: string) => Promise<void>;
}) {
	const { t } = useTranslation();

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
				onLink={onLink}
				onUnlink={onUnlink}
				formData={formData}
			/>
			<MailAttachmentsPanel
				relationAttachmentItems={relationAttachmentItems}
				excludedKeys={excludedKeys}
				manualAttachments={attachmentState.manualAttachments}
				includedRelationAttachmentCount={includedRelationAttachmentCount}
				onUploadManualAttachment={onUploadManualAttachment}
				onIncludeRelationAttachment={onIncludeRelationAttachment}
				onExcludeRelationAttachment={onExcludeRelationAttachment}
				onRemoveManualAttachment={onRemoveManualAttachment}
			/>
		</div>
	);
}
