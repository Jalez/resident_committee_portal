import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import type {
	DraftAttachmentState,
	DraftManualAttachment,
} from "~/lib/mail-draft-attachments";

export type MailRelationAttachmentItem = {
	key: `minute:${string}` | `receipt:${string}`;
	name: string;
	type: "minute" | "receipt";
};

type UseMailDraftAttachmentsOptions = {
	initialState: DraftAttachmentState;
	linkedReceipts: Array<Record<string, unknown>>;
	linkedMinutes: Array<Record<string, unknown>>;
	linkedReimbursements: Array<Record<string, unknown>>;
	displayAttachmentName: (entity: Record<string, unknown>, fallback: string) => string;
	makeId: () => string;
};

export function useMailDraftAttachments({
	initialState,
	linkedReceipts,
	linkedMinutes,
	linkedReimbursements,
	displayAttachmentName,
	makeId,
}: UseMailDraftAttachmentsOptions) {
	const [attachmentState, setAttachmentState] = useState<DraftAttachmentState>(
		initialState,
	);

	const relationAttachmentItems = useMemo<MailRelationAttachmentItem[]>(
		() => [
			...linkedMinutes
				.filter((minute) => typeof minute.id === "string")
				.map((minute) => ({
					key: `minute:${String(minute.id)}` as const,
					name: `Minutes: ${displayAttachmentName(minute, "minutes.pdf")}`,
					type: "minute" as const,
				})),
			...linkedReceipts
				.filter((receipt) => typeof receipt.id === "string")
				.map((receipt) => ({
					key: `receipt:${String(receipt.id)}` as const,
					name: `Receipt: ${displayAttachmentName(receipt, "receipt-file")}`,
					type: "receipt" as const,
				})),
		],
		[linkedMinutes, linkedReceipts, displayAttachmentName],
	);

	const excludedKeys = useMemo(
		() => new Set(attachmentState.excludedRelationAttachmentKeys),
		[attachmentState.excludedRelationAttachmentKeys],
	);

	const includedRelationAttachmentCount = useMemo(
		() => relationAttachmentItems.filter((item) => !excludedKeys.has(item.key)).length,
		[relationAttachmentItems, excludedKeys],
	);

	const missingRequiredReimbursementAttachments = useMemo(
		() =>
			linkedReimbursements.length > 0 &&
			(
				linkedReceipts.filter(
					(receipt) =>
						typeof receipt.id === "string" &&
						!excludedKeys.has(`receipt:${String(receipt.id)}`),
				).length === 0 ||
				linkedMinutes.filter(
					(minute) =>
						typeof minute.id === "string" &&
						!excludedKeys.has(`minute:${String(minute.id)}`),
				).length === 0
			),
		[linkedReimbursements.length, linkedReceipts, linkedMinutes, excludedKeys],
	);

	const uploadManualAttachment = useCallback(
		async (file: File | null) => {
			if (!file) return;
			const formData = new FormData();
			formData.append("entityType", "mail_attachment");
			formData.append("file", file);
			const response = await fetch("/api/files/upload-temp", {
				method: "POST",
				body: formData,
			});
			const data = await response.json();
			if (!response.ok || !data.success) {
				toast.error(data.error || "Failed to upload attachment");
				return;
			}
			const manualAttachment: DraftManualAttachment = {
				id: makeId(),
				name: file.name,
				contentType: file.type || "application/octet-stream",
				size: file.size,
				uploadedAt: new Date().toISOString(),
				url: data.url,
				pathname: data.pathname,
			};
			setAttachmentState((prev) => ({
				...prev,
				manualAttachments: [...prev.manualAttachments, manualAttachment],
			}));
		},
		[makeId],
	);

	const excludeRelationAttachment = useCallback(
		(key: `minute:${string}` | `receipt:${string}`) => {
			setAttachmentState((prev) => ({
				...prev,
				excludedRelationAttachmentKeys: prev.excludedRelationAttachmentKeys.includes(
					key,
				)
					? prev.excludedRelationAttachmentKeys
					: [...prev.excludedRelationAttachmentKeys, key],
			}));
		},
		[],
	);

	const includeRelationAttachment = useCallback(
		(key: `minute:${string}` | `receipt:${string}`) => {
			setAttachmentState((prev) => ({
				...prev,
				excludedRelationAttachmentKeys:
					prev.excludedRelationAttachmentKeys.filter((value) => value !== key),
			}));
		},
		[],
	);

	const removeManualAttachment = useCallback(
		async (attachmentId: string) => {
			const existing = attachmentState.manualAttachments.find(
				(item) => item.id === attachmentId,
			);
			setAttachmentState((prev) => ({
				...prev,
				manualAttachments: prev.manualAttachments.filter(
					(item) => item.id !== attachmentId,
				),
			}));
			if (existing?.pathname) {
				await fetch("/api/files/delete-temp", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						entityType: "mail_attachment",
						pathname: existing.pathname,
					}),
				});
			}
		},
		[attachmentState.manualAttachments],
	);

	return {
		attachmentState,
		setAttachmentState,
		relationAttachmentItems,
		excludedKeys,
		includedRelationAttachmentCount,
		missingRequiredReimbursementAttachments,
		uploadManualAttachment,
		excludeRelationAttachment,
		includeRelationAttachment,
		removeManualAttachment,
	};
}
