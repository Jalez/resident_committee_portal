export type RelationAttachmentKey = `minute:${string}` | `receipt:${string}`;

export interface DraftManualAttachment {
	id: string;
	name: string;
	contentType: string;
	url: string;
	pathname: string;
	size: number;
	uploadedAt: string;
}

export interface DraftAttachmentState {
	manualAttachments: DraftManualAttachment[];
	excludedRelationAttachmentKeys: RelationAttachmentKey[];
}

export const EMPTY_ATTACHMENT_STATE: DraftAttachmentState = {
	manualAttachments: [],
	excludedRelationAttachmentKeys: [],
};

export function parseDraftAttachmentState(
	json: string | null | undefined,
): DraftAttachmentState {
	if (!json?.trim()) return EMPTY_ATTACHMENT_STATE;
	try {
		const parsed = JSON.parse(json) as Partial<DraftAttachmentState>;
		const manualAttachments = Array.isArray(parsed.manualAttachments)
			? parsed.manualAttachments.filter(
				(item): item is DraftManualAttachment => {
					return (
						typeof item === "object" &&
						item !== null &&
						typeof (item as DraftManualAttachment).id === "string" &&
						typeof (item as DraftManualAttachment).name === "string" &&
						typeof (item as DraftManualAttachment).contentType === "string" &&
						typeof (item as DraftManualAttachment).url === "string" &&
						typeof (item as DraftManualAttachment).pathname === "string" &&
						typeof (item as DraftManualAttachment).size === "number" &&
						typeof (item as DraftManualAttachment).uploadedAt === "string"
					);
				},
			)
			: [];
		const excludedRelationAttachmentKeys = Array.isArray(
			parsed.excludedRelationAttachmentKeys,
		)
			? parsed.excludedRelationAttachmentKeys.filter(
				(value): value is RelationAttachmentKey =>
					typeof value === "string" &&
					(value.startsWith("minute:") || value.startsWith("receipt:")),
			)
			: [];
		return {
			manualAttachments,
			excludedRelationAttachmentKeys,
		};
	} catch {
		return EMPTY_ATTACHMENT_STATE;
	}
}
