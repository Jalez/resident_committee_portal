import type { CommitteeMailMessage, DatabaseAdapter, MailDraft } from "~/db/server.server";
import { redirect } from "react-router";
import { loadRelationshipsForEntity } from "~/lib/relationships/load-relationships.server";
import { saveRelationshipChanges } from "~/lib/relationships/save-relationships.server";
import {
	cleanupManualDraftAttachments,
	resolveMailDraftAttachments,
} from "~/lib/mail-draft-attachments.server";
import { parseDraftAttachmentState } from "~/lib/mail-draft-attachments";
import type { CommitteeMailRecipient } from "./mail-nodemailer.server";
import { sendCommitteeEmail } from "./mail-nodemailer.server";
import { buildReferencesForReply, computeThreadId } from "./mail-threading.server";

export type ComposeMode = "new" | "reply" | "replyAll" | "forward";

const UUID_REGEX =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loadComposeRecipients(db: DatabaseAdapter) {
	const roles = await db.getAllRoles();
	const rolesExcludingGuest = roles
		.filter((r) => r.name !== "Guest")
		.map((r) => ({ id: r.id, name: r.name }));

	const seenIds = new Set<string>();
	const recipientCandidates: { id: string; name: string; email: string }[] = [];
	for (const role of rolesExcludingGuest) {
		const users = await db.getUsersByRoleId(role.id);
		for (const u of users) {
			if (!seenIds.has(u.id)) {
				seenIds.add(u.id);
				recipientCandidates.push({
					id: u.id,
					name: u.name,
					email: u.email,
				});
			}
		}
	}

	return { rolesExcludingGuest, recipientCandidates };
}

export async function loadDraftComposeContext(
	db: DatabaseAdapter,
	requestUrl: URL,
	draftId: string,
	userPermissions: string[],
) {
	if (!draftId || !UUID_REGEX.test(draftId)) {
		throw new Response("Not Found", { status: 404 });
	}

	const replyTo = requestUrl.searchParams.get("replyTo");
	const replyAllTo = requestUrl.searchParams.get("replyAllTo");
	const forward = requestUrl.searchParams.get("forward");

	let draft: MailDraft | null = null;
	let originalMessage: CommitteeMailMessage | null = null;
	let composeMode: ComposeMode = "new";

	draft = await db.getMailDraftById(draftId);
	if (draft) {
		composeMode = draft.draftType as ComposeMode;
		if (draft.replyToMessageId) {
			originalMessage = await db.getCommitteeMailMessageById(
				draft.replyToMessageId,
			);
		} else if (draft.forwardFromMessageId) {
			originalMessage = await db.getCommitteeMailMessageById(
				draft.forwardFromMessageId,
			);
		}
	}

	if (replyTo && UUID_REGEX.test(replyTo)) {
		originalMessage = await db.getCommitteeMailMessageById(replyTo);
		composeMode = "reply";
	}
	if (replyAllTo && UUID_REGEX.test(replyAllTo)) {
		originalMessage = await db.getCommitteeMailMessageById(replyAllTo);
		composeMode = "replyAll";
	}
	if (forward && UUID_REGEX.test(forward)) {
		originalMessage = await db.getCommitteeMailMessageById(forward);
		composeMode = "forward";
	}

	const threadRelationId = draft?.threadId || draftId;
	const relationships = await loadRelationshipsForEntity(
		db,
		"mail_thread",
		threadRelationId,
		["receipt", "reimbursement", "transaction", "event", "minute"],
		{ userPermissions },
	);

	return {
		draft,
		originalMessage,
		composeMode,
		relationships,
		threadRelationId,
	};
}

export async function getRecipientsByRoleAction(
	db: DatabaseAdapter,
	formData: FormData,
) {
	const roleId = formData.get("roleId") as string;
	const field = (formData.get("field") as "to" | "cc" | "bcc") || "to";
	if (!roleId) {
		return {
			recipients: [] as { id: string; name: string; email: string }[],
			field,
		};
	}
	const users = await db.getUsersByRoleId(roleId);
	return {
		recipients: users.map((u) => ({
			id: u.id,
			name: u.name,
			email: u.email,
		})),
		field,
	};
}

export function parseDraftMutationFields(formData: FormData) {
	return {
		toJson: (formData.get("to_json") as string) ?? "[]",
		ccJson: (formData.get("cc_json") as string) || null,
		bccJson: (formData.get("bcc_json") as string) || null,
		subject: (formData.get("subject") as string) ?? null,
		body: (formData.get("body") as string) ?? null,
		attachmentsJson: (formData.get("attachments_json") as string) || null,
	};
}

export async function saveMailDraftRelationshipsAndContent({
	db,
	formData,
	draftId,
	body,
	userId,
	userPermissions,
}: {
	db: DatabaseAdapter;
	formData: FormData;
	draftId: string;
	body: string | null;
	userId: string | null;
	userPermissions: string[];
}) {
	const threadRelationId = (formData.get("relationAId") as string) || draftId;
	await saveRelationshipChanges(
		db,
		"mail_thread",
		threadRelationId,
		formData,
		userId,
		userPermissions,
	);

	const fields = parseDraftMutationFields(formData);
	return db.updateMailDraft(draftId, {
		toJson: fields.toJson,
		ccJson: fields.ccJson,
		bccJson: fields.bccJson,
		subject: fields.subject,
		body,
		attachmentsJson: fields.attachmentsJson,
	});
}

export async function deleteDraftAndCleanupAttachments(
	db: DatabaseAdapter,
	draftId: string,
) {
	const draft = await db.getMailDraftById(draftId);
	if (draft?.attachmentsJson) {
		await cleanupManualDraftAttachments(
			parseDraftAttachmentState(draft.attachmentsJson),
		);
	}
	return db.deleteMailDraft(draftId);
}

export async function sendMailDraftAndPersist({
	db,
	formData,
	request,
	userId,
	userPermissions,
	userName,
	signatureRegards,
	ensureHtmlBody,
	ensureSignedHtmlBody,
	htmlToText,
}: {
	db: DatabaseAdapter;
	formData: FormData;
	request: Request;
	userId: string | null;
	userPermissions: string[];
	userName?: string | null;
	signatureRegards: string;
	ensureHtmlBody: (value: string) => string;
	ensureSignedHtmlBody: (
		htmlBody: string,
		name?: string | null,
		regardsLine?: string,
	) => string;
	htmlToText: (value: string) => string;
}) {
	const subject = (formData.get("subject") as string)?.trim();
	const body = (formData.get("body") as string) || "";
	const draftAttachmentState = parseDraftAttachmentState(
		(formData.get("attachments_json") as string) || null,
	);
	const toEmails = (formData.getAll("to") as string[]).filter(Boolean);
	const ccEmails = (formData.getAll("cc") as string[]).filter(Boolean);
	const bccEmails = (formData.getAll("bcc") as string[]).filter(Boolean);
	const draftId = (formData.get("draftId") as string) || null;
	const threadRelationId =
		(formData.get("relationAId") as string) || draftId || "";
	const replyToMessageId = (formData.get("replyToMessageId") as string) || null;
	const forwardFromMessageId =
		(formData.get("forwardFromMessageId") as string) || null;
	const composeMode = (formData.get("composeMode") as ComposeMode) || "new";

	if (!subject || !htmlToText(body)) {
		return { sent: false, error: "Missing subject or body" } as const;
	}
	if (toEmails.length === 0) {
		return { sent: false, error: "Add at least one To recipient" } as const;
	}

	const signedBody = ensureSignedHtmlBody(
		ensureHtmlBody(body),
		userName,
		signatureRegards,
	);

	let mailAttachments: {
		filename: string;
		content: string;
		contentType?: string;
	}[] = [];
	if (draftId) {
		await saveRelationshipChanges(
			db,
			"mail_thread",
			threadRelationId,
			formData,
			userId,
			userPermissions,
		);

		const relationshipData = await loadRelationshipsForEntity(
			db,
			"mail_thread",
			threadRelationId,
			["receipt", "reimbursement", "minute"],
			{ userPermissions },
		);
		const linkedReimbursements = (
			relationshipData.reimbursement?.linked || []
		) as Array<Record<string, unknown>>;
		const linkedMinutes = (relationshipData.minute?.linked || []) as Array<
			Record<string, unknown>
		>;
		const linkedReceipts = (relationshipData.receipt?.linked || []) as Array<
			Record<string, unknown>
		>;

		if (
			linkedReimbursements.length > 0 &&
			(linkedMinutes.length === 0 || linkedReceipts.length === 0)
		) {
			return {
				sent: false,
				error:
					"A reimbursement email requires both a linked minutes document and at least one linked receipt before sending.",
			} as const;
		}

		const requestOrigin = new URL(request.url).origin;
		const resolved = await resolveMailDraftAttachments({
			db,
			requestOrigin,
			linkedMinutes,
			linkedReceipts,
			draftAttachmentState,
		});
		mailAttachments = resolved.attachments;
		for (const warning of resolved.warnings) {
			console.warn(`[mail-draft-send] ${warning}`);
		}

		if (
			linkedReimbursements.length > 0 &&
			!resolved.includedRelationAttachmentKeys.some((key) =>
				key.startsWith("minute:"),
			)
		) {
			return {
				sent: false,
				error:
					"A reimbursement email requires at least one included minutes attachment.",
			} as const;
		}
		if (
			linkedReimbursements.length > 0 &&
			!resolved.includedRelationAttachmentKeys.some((key) =>
				key.startsWith("receipt:"),
			)
		) {
			return {
				sent: false,
				error:
					"A reimbursement email requires at least one included receipt attachment.",
			} as const;
		}
	}

	const to: CommitteeMailRecipient[] = toEmails.map((email) => ({ email }));
	const cc: CommitteeMailRecipient[] | undefined = ccEmails.length
		? ccEmails.map((email) => ({ email }))
		: undefined;
	const bcc: CommitteeMailRecipient[] | undefined = bccEmails.length
		? bccEmails.map((email) => ({ email }))
		: undefined;

	let inReplyToHeader: string | undefined;
	let referencesHeader: string[] | undefined;
	let parentMessage: Awaited<ReturnType<typeof db.getCommitteeMailMessageById>> =
		null;

	const parentMsgId = replyToMessageId || forwardFromMessageId;
	if (parentMsgId && (composeMode === "reply" || composeMode === "replyAll")) {
		parentMessage = await db.getCommitteeMailMessageById(parentMsgId);
		if (parentMessage?.messageId) {
			inReplyToHeader = parentMessage.messageId;
			const parentRefs = parentMessage.referencesJson
				? (JSON.parse(parentMessage.referencesJson) as string[])
				: null;
			referencesHeader = buildReferencesForReply(
				parentMessage.messageId,
				parentRefs,
			);
		}
	}

	const bodyHtml = signedBody;
	let quotedReply:
		| {
				date: string;
				fromName: string;
				fromEmail: string;
				bodyHtml: string;
		  }
		| undefined;

	if (parentMessage && (composeMode === "reply" || composeMode === "replyAll")) {
		quotedReply = {
			date: new Date(parentMessage.date).toLocaleString("en-US", {
				weekday: "short",
				year: "numeric",
				month: "short",
				day: "numeric",
				hour: "2-digit",
				minute: "2-digit",
			}),
			fromName: parentMessage.fromName || "",
			fromEmail: parentMessage.fromAddress,
			bodyHtml: parentMessage.bodyHtml,
		};
	}

	const html = quotedReply
		? `${bodyHtml}<br><br>On ${quotedReply.date}, ${quotedReply.fromName || quotedReply.fromEmail} &lt;${quotedReply.fromEmail}&gt; wrote:<br>${quotedReply.bodyHtml}`
		: bodyHtml;

	const result = await sendCommitteeEmail({
		to,
		cc,
		bcc,
		subject,
		html,
		inReplyTo: inReplyToHeader,
		references: referencesHeader,
		attachments: mailAttachments.length > 0 ? mailAttachments : undefined,
	});

	if (!result.success) {
		return { sent: false, error: result.error } as const;
	}

	if (draftId) {
		await db.deleteMailDraft(draftId);
	}
	await cleanupManualDraftAttachments(draftAttachmentState);

	const fromEmail = process.env.COMMITTEE_FROM_EMAIL || "";
	const fromName =
		process.env.COMMITTEE_FROM_NAME || process.env.SITE_NAME || "Committee";
	const toJson = JSON.stringify(to.map((r) => ({ email: r.email, name: r.name })));
	const ccJson = cc?.length
		? JSON.stringify(cc.map((r) => ({ email: r.email, name: r.name })))
		: null;
	const bccJson = bcc?.length
		? JSON.stringify(bcc.map((r) => ({ email: r.email, name: r.name })))
		: null;

	const sentMessageId = result.messageId || null;
	const parentRefs = parentMessage?.referencesJson
		? (JSON.parse(parentMessage.referencesJson) as string[])
		: null;
	const threadId = computeThreadId(
		sentMessageId,
		inReplyToHeader || null,
		referencesHeader || parentRefs,
	);

	if (threadId) {
		await db.ensureCommitteeMailThread(threadId, subject);
	}

	const inserted = await db.insertCommitteeMailMessage({
		direction: "sent",
		fromAddress: fromEmail,
		fromName: fromName || null,
		toJson,
		ccJson,
		bccJson,
		subject,
		bodyHtml: html,
		bodyText: null,
		date: new Date(),
		messageId: sentMessageId,
		inReplyTo: inReplyToHeader || null,
		referencesJson: referencesHeader ? JSON.stringify(referencesHeader) : null,
		threadId,
	});

	if (threadRelationId) {
		const draftRelationships = await db.getEntityRelationships(
			"mail_thread",
			threadRelationId,
		);
		for (const rel of draftRelationships) {
			const relationAType = rel.relationAType;
			const relationId =
				rel.relationAType === "mail_thread" &&
				rel.relationId === threadRelationId &&
				threadId
					? threadId
					: rel.relationId;
			const relationBType = rel.relationBType;
			const relationBId =
				rel.relationBType === "mail_thread" &&
				rel.relationBId === threadRelationId &&
				threadId
					? threadId
					: rel.relationBId;

			const exists = await db.entityRelationshipExists(
				relationAType as any,
				relationId,
				relationBType as any,
				relationBId,
			);

			if (!exists) {
				await db.createEntityRelationship({
					relationAType: relationAType as any,
					relationId,
					relationBType: relationBType as any,
					relationBId,
					createdBy: null,
				});
			}

			if (threadId && threadRelationId !== threadId) {
				await db.deleteEntityRelationshipByPair(
					rel.relationAType as any,
					rel.relationId,
					rel.relationBType as any,
					rel.relationBId,
				);
			}
		}
	}

	if (threadId) {
		const sentThread = await db.getCommitteeMailThreadById(threadId);
		const dest = sentThread?.slug
			? `/mail/thread/${sentThread.slug}`
			: `/mail/thread/${encodeURIComponent(threadId)}`;
		return redirect(dest);
	}
	return redirect(`/mail/messages/${inserted.id}`);
}
