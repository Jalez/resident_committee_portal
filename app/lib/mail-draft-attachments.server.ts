import { Buffer } from "node:buffer";
import type { DatabaseAdapter } from "~/db/adapters/types";
import type { CommitteeMailAttachment } from "~/lib/mail-nodemailer.server";
import { deleteTempFile } from "~/lib/file-upload.server";
import {
	buildMinutesAttachment,
	buildReceiptAttachments,
} from "~/lib/email.server";
import type {
	DraftAttachmentState,
	RelationAttachmentKey,
} from "./mail-draft-attachments";
import { parseDraftAttachmentState } from "./mail-draft-attachments";

export interface ResolveMailDraftAttachmentsInput {
	db: DatabaseAdapter;
	requestOrigin: string;
	linkedMinutes: Array<Record<string, unknown>>;
	linkedReceipts: Array<Record<string, unknown>>;
	draftAttachmentState: DraftAttachmentState;
}

export interface ResolveMailDraftAttachmentsResult {
	attachments: CommitteeMailAttachment[];
	includedRelationAttachmentKeys: RelationAttachmentKey[];
	warnings: string[];
}


function toText(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function sanitizeFilename(name: string, fallback: string): string {
	const cleaned = name
		.trim()
		.replace(/[\x00-\x1F\x7F]/g, "")
		.replace(/[\\/]/g, "-")
		.replace(/\s+/g, " ")
		.trim();
	return cleaned || fallback;
}

async function fetchAsBase64(url: string): Promise<string | null> {
	if (!url) return null;
	try {
		const res = await fetch(url);
		if (!res.ok) return null;
		const bytes = await res.arrayBuffer();
		return Buffer.from(bytes).toString("base64");
	} catch {
		return null;
	}
}

export async function cleanupManualDraftAttachments(
	state: DraftAttachmentState,
): Promise<void> {
	if (!state.manualAttachments.length) return;
	await Promise.all(
		state.manualAttachments.map(async (file) => {
			if (!file.pathname) return;
			await deleteTempFile(file.pathname, "mail_attachment");
		}),
	);
}

export async function resolveMailDraftAttachments({
	db,
	requestOrigin,
	linkedMinutes,
	linkedReceipts,
	draftAttachmentState,
}: ResolveMailDraftAttachmentsInput): Promise<ResolveMailDraftAttachmentsResult> {
	const attachments: CommitteeMailAttachment[] = [];
	const includedRelationAttachmentKeys: RelationAttachmentKey[] = [];
	const warnings: string[] = [];
	const excluded = new Set(draftAttachmentState.excludedRelationAttachmentKeys);

	const includedMinutes = linkedMinutes.filter((minute) => {
		const id = toText(minute.id);
		return id && !excluded.has(`minute:${id}`);
	});

	const minuteAttachments = (
		await Promise.all(
			includedMinutes.map(async (minute) => {
				const minuteId = toText(minute.id);
				if (!minuteId) return null;
				const attachment = await buildMinutesAttachment(
					minuteId,
					toText(minute.title) || null,
				);
				if (attachment) {
					includedRelationAttachmentKeys.push(`minute:${minuteId}`);
					return {
						filename: sanitizeFilename(attachment.name, `minutes-${minuteId}.pdf`),
						content: attachment.content,
						contentType: attachment.type,
					};
				}
				warnings.push(`Failed to resolve minute attachment for ${minuteId}`);
				return null;
			}),
		)
	).filter((item) => item !== null);
	attachments.push(...minuteAttachments);

	const receiptLinks: Array<{ id: string; name: string; url: string }> = [];
	for (const receipt of linkedReceipts) {
		const receiptId = toText(receipt.id);
		if (!receiptId) continue;
		if (excluded.has(`receipt:${receiptId}`)) continue;

		let current = receipt;
		let url =
			toText(current.url) ||
			toText(current.fileUrl) ||
			(toText(current.pathname)
				? `${requestOrigin}${toText(current.pathname).startsWith("/") ? toText(current.pathname) : `/${toText(current.pathname)}`}`
				: "");

		if (!url) {
			const dbReceipt = await db.getReceiptById(receiptId);
			if (dbReceipt) {
				current = dbReceipt as unknown as Record<string, unknown>;
				url =
					toText(current.url) ||
					toText(current.fileUrl) ||
					(toText(current.pathname)
						? `${requestOrigin}${toText(current.pathname).startsWith("/") ? toText(current.pathname) : `/${toText(current.pathname)}`}`
						: "");
			}
		}

		if (!url) {
			warnings.push(`Failed to resolve receipt URL for ${receiptId}`);
			continue;
		}

		receiptLinks.push({
			id: receiptId,
			name:
				toText(current.name) ||
				toText(current.description) ||
				toText(current.storeName) ||
				`receipt-${receiptId.slice(0, 8)}`,
			url,
		});
		includedRelationAttachmentKeys.push(`receipt:${receiptId}`);
	}

	const receiptAttachments = await buildReceiptAttachments(receiptLinks);
	attachments.push(
		...receiptAttachments.map((attachment) => ({
			filename: sanitizeFilename(attachment.name, "receipt.pdf"),
			content: attachment.content,
			contentType: attachment.type,
		})),
	);

	for (const manual of draftAttachmentState.manualAttachments) {
		const content = await fetchAsBase64(manual.url);
		if (!content) {
			warnings.push(`Failed to download manual attachment ${manual.id}`);
			continue;
		}
		attachments.push({
			filename: sanitizeFilename(manual.name, `attachment-${manual.id}`),
			content,
			contentType: manual.contentType || "application/octet-stream",
		});
	}

	return { attachments, includedRelationAttachmentKeys, warnings };
}
