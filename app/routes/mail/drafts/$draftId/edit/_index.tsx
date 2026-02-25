import { ArrowLeft, Save, Send, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	Form,
	Link,
	redirect,
	useActionData,
	useFetcher,
	useNavigate,
	useNavigation,
	useSearchParams,
} from "react-router";
import { toast } from "sonner";
import {
	type RecipientEntry,
	RecipientField,
} from "~/components/committee-recipient-field";
import { RelationshipPicker } from "~/components/relationships/relationship-picker";
import { SmartAutofillButton } from "~/components/smart-autofill-button";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { useUser } from "~/contexts/user-context";
import { type CommitteeMailMessage, getDatabase, type MailDraft } from "~/db/server.server";
import { useRelationshipPicker } from "~/hooks/use-relationship-picker";
import { requirePermission } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import {
	buildMinutesAttachment,
	buildReceiptAttachments,
	primaryText,
} from "~/lib/email.server";
import {
	type CommitteeMailRecipient,
	isCommitteeMailConfigured,
	sendCommitteeEmail,
} from "~/lib/mail-nodemailer.server";
import { loadRelationshipsForEntity } from "~/lib/relationships/load-relationships.server";
import { addForwardPrefix, addReplyPrefix } from "~/lib/mail-utils";
import { saveRelationshipChanges } from "~/lib/relationships/save-relationships.server";
import { getSystemLanguageDefaults } from "~/lib/settings.server";
import { IsolatedEmailContent } from "~/components/isolated-email-content";
import type { Route } from "./+types/_index";

type ComposeMode = "new" | "reply" | "replyAll" | "forward";

const UUID_REGEX =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DRAFT_SAVE_DEBOUNCE_MS = 1200;

function makeId() {
	return (
		crypto.randomUUID?.() ??
		`id-${Date.now()}-${Math.random().toString(36).slice(2)}`
	);
}

function parseRecipients(json: string | null): RecipientEntry[] {
	if (!json?.trim()) return [];
	try {
		const arr = JSON.parse(json) as { email: string; name?: string }[];
		if (!Array.isArray(arr)) return [];
		return arr.map((r) => ({
			id: makeId(),
			email: r.email ?? "",
			name: r.name,
		}));
	} catch {
		return [];
	}
}

function displayAttachmentName(entity: Record<string, unknown>, fallback: string) {
	return (
		(typeof entity.name === "string" && entity.name.trim()) ||
		(typeof entity.title === "string" && entity.title.trim()) ||
		(typeof entity.description === "string" && entity.description.trim()) ||
		fallback
	);
}

function buildSignature(
	name?: string | null,
	regardsLine = "Best regards,",
) {
	const trimmedName = name?.trim();
	if (!trimmedName) return null;
	return `${regardsLine}\n${trimmedName}`;
}

function ensureSignedBody(
	body: string,
	name?: string | null,
	regardsLine = "Best regards,",
) {
	const signature = buildSignature(name, regardsLine);
	if (!signature) return body;
	if (body.includes(signature)) return body;
	if (body.includes(regardsLine)) return body;
	const trimmed = body.trimEnd();
	return trimmed ? `${trimmed}\n\n${signature}` : signature;
}

export function meta({ data }: Route.MetaArgs) {
	return [
		{
			title: `${data?.siteConfig?.name || "Portal"} - Compose`,
		},
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request, params }: Route.LoaderArgs) {
	const currentUser = await requirePermission(
		request,
		"committee:email",
		getDatabase,
	);
	const db = getDatabase();
	const { primary: primaryLanguage } = await getSystemLanguageDefaults();
	const signatureRegards = primaryText(primaryLanguage, "mail.signature.regards");

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

	const url = new URL(request.url);
	const draftId = params.draftId;
	if (!draftId || !UUID_REGEX.test(draftId)) {
		throw new Response("Not Found", { status: 404 });
	}

	const replyTo = url.searchParams.get("replyTo");
	const replyAllTo = url.searchParams.get("replyAllTo");
	const forward = url.searchParams.get("forward");

	let draft: MailDraft | null = null;
	let originalMessage: CommitteeMailMessage | null = null;
	let composeMode: ComposeMode = "new";

	// Load existing draft
	if (draftId && UUID_REGEX.test(draftId)) {
		draft = await db.getMailDraftById(draftId);
		if (draft) {
			composeMode = draft.draftType as ComposeMode;
			// Load original message for reply/forward drafts
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
	}

	const relationshipTypes = [
		"receipt",
		"reimbursement",
		"transaction",
		"event",
		"minute",
	] as const;
	const relationships = await loadRelationshipsForEntity(
		db,
		"mail",
		draftId,
		[...relationshipTypes],
		{ userPermissions: currentUser.permissions },
	);

	// Reply to a message
	if (replyTo && UUID_REGEX.test(replyTo)) {
		originalMessage = await db.getCommitteeMailMessageById(replyTo);
		composeMode = "reply";
	}

	// Reply all to a message
	if (replyAllTo && UUID_REGEX.test(replyAllTo)) {
		originalMessage = await db.getCommitteeMailMessageById(replyAllTo);
		composeMode = "replyAll";
	}

	// Forward a message
	if (forward && UUID_REGEX.test(forward)) {
		originalMessage = await db.getCommitteeMailMessageById(forward);
		composeMode = "forward";
	}

	return {
		siteConfig: SITE_CONFIG,
		committeeMailConfigured: isCommitteeMailConfigured(),
		committeeFromEmail: process.env.COMMITTEE_FROM_EMAIL || "",
		roles: rolesExcludingGuest,
		recipientCandidates,
		draft,
		originalMessage,
		composeMode,
		relationships,
		signatureRegards,
	};
}

export async function action({ request }: Route.ActionArgs) {
	const currentUser = await requirePermission(
		request,
		"committee:email",
		getDatabase,
	);
	const { buildReferencesForReply, computeThreadId } = await import(
		"~/lib/mail-threading.server"
	);
	const formData = await request.formData();
	const intent = formData.get("_action") as string;
	const db = getDatabase();
	const { primary: primaryLanguage } = await getSystemLanguageDefaults();
	const signatureRegards = primaryText(primaryLanguage, "mail.signature.regards");

	if (intent === "getRecipients") {
		const roleId = formData.get("roleId") as string;
		const field = (formData.get("field") as "to" | "cc" | "bcc") || "to";
		if (!roleId) {
			return {
				recipients: [] as {
					id: string;
					name: string;
					email: string;
				}[],
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

	if (intent === "createDraft") {
		const draftType = (formData.get("draftType") as ComposeMode) || "new";
		const replyToMessageId =
			(formData.get("replyToMessageId") as string) || null;
		const forwardFromMessageId =
			(formData.get("forwardFromMessageId") as string) || null;

		const draft = await db.insertMailDraft({
			toJson: "[]",
			ccJson: null,
			bccJson: null,
			subject: null,
			body: null,
			draftType,
			replyToMessageId,
			forwardFromMessageId,
		});
		return { draftId: draft.id, draft };
	}

	if (intent === "updateDraft") {
		const draftId = formData.get("draftId") as string;
		if (!draftId) return { error: "Missing draftId" };
		const toJson = (formData.get("to_json") as string) ?? "[]";
		const ccJson = (formData.get("cc_json") as string) || null;
		const bccJson = (formData.get("bcc_json") as string) || null;
		const subject = (formData.get("subject") as string) ?? null;
		const body = (formData.get("body") as string) ?? null;
		const updated = await db.updateMailDraft(draftId, {
			toJson,
			ccJson,
			bccJson,
			subject,
			body,
		});
		return updated
			? { draft: updated, updatedAt: updated.updatedAt }
			: { error: "Draft not found" };
	}

	if (intent === "saveDraft") {
		const draftId = formData.get("draftId") as string;
		if (!draftId) return { saved: false, error: "Missing draftId" };

		const toJson = (formData.get("to_json") as string) ?? "[]";
		const ccJson = (formData.get("cc_json") as string) || null;
		const bccJson = (formData.get("bcc_json") as string) || null;
		const subject = (formData.get("subject") as string) ?? null;
		const body = (formData.get("body") as string) ?? null;
		const signedBody = body
			? ensureSignedBody(body, currentUser.name, signatureRegards)
			: body;

		await saveRelationshipChanges(
			db,
			"mail",
			draftId,
			formData,
			currentUser.userId || null,
			currentUser.permissions,
		);
		const updated = await db.updateMailDraft(draftId, {
			toJson,
			ccJson,
			bccJson,
			subject,
			body: signedBody,
		});

		return updated
			? { saved: true, updatedAt: updated.updatedAt, draft: updated }
			: { saved: false, error: "Draft not found" };
	}

	if (intent === "send") {
		const subject = (formData.get("subject") as string)?.trim();
		const body = (formData.get("body") as string)?.trim();
		const toEmails = (formData.getAll("to") as string[]).filter(Boolean);
		const ccEmails = (formData.getAll("cc") as string[]).filter(Boolean);
		const bccEmails = (formData.getAll("bcc") as string[]).filter(Boolean);
		const draftId = (formData.get("draftId") as string) || null;
		const replyToMessageId =
			(formData.get("replyToMessageId") as string) || null;
		const forwardFromMessageId =
			(formData.get("forwardFromMessageId") as string) || null;
		const composeMode = (formData.get("composeMode") as ComposeMode) || "new";

		if (!subject || !body) {
			return { sent: false, error: "Missing subject or body" };
		}
		if (toEmails.length === 0) {
			return {
				sent: false,
				error: "Add at least one To recipient",
			};
		}

		const signedBody = ensureSignedBody(
			body,
			currentUser.name,
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
				"mail",
				draftId,
				formData,
				currentUser.userId || null,
				currentUser.permissions,
			);

			const relationshipData = await loadRelationshipsForEntity(
				db,
				"mail",
				draftId,
				["receipt", "reimbursement", "minute"],
				{ userPermissions: currentUser.permissions },
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
				};
			}

			const minuteAttachments = (
				await Promise.all(
					linkedMinutes.map((minute) =>
						buildMinutesAttachment(
							String(minute.id),
							typeof minute.title === "string" ? minute.title : null,
						),
					),
				)
			).filter((attachment): attachment is NonNullable<typeof attachment> =>
				Boolean(attachment),
			);

			const requestOrigin = new URL(request.url).origin;
			const receiptLinks = linkedReceipts
				.filter((receipt) => typeof receipt.id === "string")
				.map((receipt) => ({
					id: String(receipt.id),
					name:
						(typeof receipt.name === "string" && receipt.name) ||
						(typeof receipt.description === "string" && receipt.description) ||
						`receipt-${String(receipt.id).slice(0, 8)}`,
					url:
						(typeof receipt.url === "string" && receipt.url) ||
						(typeof receipt.fileUrl === "string" && receipt.fileUrl) ||
						(typeof receipt.pathname === "string" && receipt.pathname
							? `${requestOrigin}${receipt.pathname.startsWith("/") ? receipt.pathname : `/${receipt.pathname}`}`
							: "") ||
						"",
				}));
			const receiptAttachments = await buildReceiptAttachments(receiptLinks);

			const reimbursementAttachments: {
				filename: string;
				content: string;
				contentType: string;
			}[] = [];

			mailAttachments = [
				...minuteAttachments.map((attachment) => ({
					filename: attachment.name,
					content: attachment.content,
					contentType: attachment.type,
				})),
				...receiptAttachments.map((attachment) => ({
					filename: attachment.name,
					content: attachment.content,
					contentType: attachment.type,
				})),
				...reimbursementAttachments,
			];
		}

		const to: CommitteeMailRecipient[] = toEmails.map((email) => ({
			email,
		}));
		const cc: CommitteeMailRecipient[] | undefined = ccEmails.length
			? ccEmails.map((email) => ({ email }))
			: undefined;
		const bcc: CommitteeMailRecipient[] | undefined = bccEmails.length
			? bccEmails.map((email) => ({ email }))
			: undefined;

		// Build threading headers for replies
		let inReplyToHeader: string | undefined;
		let referencesHeader: string[] | undefined;
		let parentMessage: Awaited<
			ReturnType<typeof db.getCommitteeMailMessageById>
		> = null;

		const parentMsgId = replyToMessageId || forwardFromMessageId;
		if (
			parentMsgId &&
			(composeMode === "reply" || composeMode === "replyAll")
		) {
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

		// Render HTML with React Email template
		const bodyHtml = signedBody.replace(/\n/g, "<br>\n");
		let quotedReply:
			| {
				date: string;
				fromName: string;
				fromEmail: string;
				bodyHtml: string;
			}
			| undefined;

		if (
			parentMessage &&
			(composeMode === "reply" || composeMode === "replyAll")
		) {
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
			return { sent: false, error: result.error };
		}

		// Delete draft
		if (draftId) {
			await db.deleteMailDraft(draftId);
		}

		// Store sent message
		const fromEmail = process.env.COMMITTEE_FROM_EMAIL || "";
		const fromName =
			process.env.COMMITTEE_FROM_NAME || process.env.SITE_NAME || "Committee";
		const toJson = JSON.stringify(
			to.map((r) => ({ email: r.email, name: r.name })),
		);
		const ccJson = cc?.length
			? JSON.stringify(cc.map((r) => ({ email: r.email, name: r.name })))
			: null;
		const bccJson = bcc?.length
			? JSON.stringify(bcc.map((r) => ({ email: r.email, name: r.name })))
			: null;

		// Compute thread ID for the sent message
		const sentMessageId = result.messageId || null;
		const parentRefs = parentMessage?.referencesJson
			? (JSON.parse(parentMessage.referencesJson) as string[])
			: null;
		const threadId = computeThreadId(
			sentMessageId,
			inReplyToHeader || null,
			referencesHeader || parentRefs,
		);

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
			referencesJson: referencesHeader
				? JSON.stringify(referencesHeader)
				: null,
			threadId,
		});

		if (draftId) {
			const draftRelationships = await db.getEntityRelationships("mail", draftId);
			for (const rel of draftRelationships) {
				const relationAType = rel.relationAType;
				const relationId =
					rel.relationAType === "mail" && rel.relationId === draftId
						? inserted.id
						: rel.relationId;
				const relationBType = rel.relationBType;
				const relationBId =
					rel.relationBType === "mail" && rel.relationBId === draftId
						? inserted.id
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

				await db.deleteEntityRelationshipByPair(
					rel.relationAType as any,
					rel.relationId,
					rel.relationBType as any,
					rel.relationBId,
				);

				// If this mail is linked to a reimbursement that doesn't have a primary thread,
				// set this newly sent email as its primary thread.
				const isReimbA = rel.relationAType === "reimbursement";
				const isReimbB = rel.relationBType === "reimbursement";
				if (isReimbA || isReimbB) {
					const reimbursementId = isReimbA ? rel.relationId : rel.relationBId;
					const purchase = await db.getPurchaseById(reimbursementId);
					if (purchase && !purchase.emailMessageId && sentMessageId) {
						await db.updatePurchase(reimbursementId, { emailMessageId: sentMessageId });
					}
				}
			}
		}

		// Navigate to thread view if part of a thread, otherwise to the message
		if (threadId) {
			return redirect(`/mail/thread/${encodeURIComponent(threadId)}`);
		}
		return redirect(`/mail/messages/${inserted.id}`);
	}

	if (intent === "deleteDraft") {
		const draftId = formData.get("draftId") as string;
		if (!draftId) return { deleted: false, error: "Missing draftId" };
		const ok = await db.deleteMailDraft(draftId);
		if (!ok) return { deleted: false, error: "Draft not found" };
		return redirect("/mail/drafts");
	}

	return { error: "Unknown action" };
}

/** Skip revalidating loaders after updateDraft fetcher. */
export function shouldRevalidate({
	formData,
	defaultShouldRevalidate,
}: {
	formData?: FormData | null;
	defaultShouldRevalidate: boolean;
}) {
	const action = formData?.get("_action");
	if (action === "updateDraft") return false;
	return defaultShouldRevalidate;
}

export default function MailCompose({ loaderData }: Route.ComponentProps) {
	const {
		committeeMailConfigured,
		committeeFromEmail,
		roles,
		recipientCandidates,
		draft: initialDraft,
		originalMessage,
		composeMode: initialComposeMode,
		relationships,
		signatureRegards,
	} = loaderData;
	const { t } = useTranslation();
	const { user } = useUser();
	const navigate = useNavigate();
	const navigation = useNavigation();
	const [_searchParams] = useSearchParams();
	const actionData = useActionData<{ sent?: boolean; error?: string }>();

	useEffect(() => {
		if (actionData?.error) {
			toast.error(actionData.error);
		}
	}, [actionData]);

	const composeMode = initialComposeMode as ComposeMode;

	// Determine initial recipients based on compose mode
	const getInitialTo = (): RecipientEntry[] => {
		if (initialDraft) return parseRecipients(initialDraft.toJson);
		if (!originalMessage) return [];
		if (composeMode === "reply") {
			return [
				{
					id: makeId(),
					email: originalMessage.fromAddress,
					name: originalMessage.fromName || undefined,
				},
			];
		}
		if (composeMode === "replyAll") {
			const recipients: RecipientEntry[] = [
				{
					id: makeId(),
					email: originalMessage.fromAddress,
					name: originalMessage.fromName || undefined,
				},
			];
			// Add all original To recipients (except ourselves)
			const toList = parseRecipients(originalMessage.toJson);
			for (const r of toList) {
				if (r.email.toLowerCase() !== committeeFromEmail.toLowerCase()) {
					recipients.push(r);
				}
			}
			return recipients;
		}
		return []; // forward: empty To
	};

	const getInitialCc = (): RecipientEntry[] => {
		if (initialDraft) return parseRecipients(initialDraft.ccJson);
		if (composeMode === "replyAll" && originalMessage?.ccJson) {
			const ccList = parseRecipients(originalMessage.ccJson);
			return ccList.filter(
				(r) => r.email.toLowerCase() !== committeeFromEmail.toLowerCase(),
			);
		}
		return [];
	};

	const getInitialSubject = (): string => {
		if (initialDraft?.subject) return initialDraft.subject;
		if (!originalMessage) return "";
		if (composeMode === "reply" || composeMode === "replyAll") {
			return addReplyPrefix(originalMessage.subject);
		}
		if (composeMode === "forward") {
			return addForwardPrefix(originalMessage.subject);
		}
		return "";
	};

	const getInitialBody = (): string => {
		if (initialDraft?.body) return initialDraft.body;
		if (composeMode === "forward" && originalMessage) {
			// Include forwarded message body as plain text
			const text =
				originalMessage.bodyText ||
				originalMessage.bodyHtml.replace(/<[^>]+>/g, "");
			return `\n\n---------- Forwarded message ----------\nFrom: ${originalMessage.fromName || ""} <${originalMessage.fromAddress}>\nDate: ${new Date(originalMessage.date).toLocaleString()}\nSubject: ${originalMessage.subject}\n\n${text}`;
		}
		return "";
	};

	// State
	const createFetcher = useFetcher<{ draftId?: string; draft?: MailDraft }>();
	const updateFetcher = useFetcher<{ updatedAt?: string }>();
	const saveDraftFetcher = useFetcher<{
		saved?: boolean;
		updatedAt?: string;
		error?: string;
	}>();
	const getRecipientsFetcher = useFetcher<{
		recipients?: { id: string; name: string; email: string }[];
		field?: "to" | "cc" | "bcc";
	}>();
	const deleteFetcher = useFetcher();

	const [toRecipients, setToRecipients] =
		useState<RecipientEntry[]>(getInitialTo);
	const [ccRecipients, setCcRecipients] =
		useState<RecipientEntry[]>(getInitialCc);
	const [bccRecipients, setBccRecipients] = useState<RecipientEntry[]>(() =>
		initialDraft ? parseRecipients(initialDraft.bccJson) : [],
	);
	const [subject, setSubject] = useState(getInitialSubject);
	const [body, setBody] = useState(getInitialBody);
	const [lastSavedAt, setLastSavedAt] = useState<Date | null>(
		initialDraft?.updatedAt ? new Date(initialDraft.updatedAt) : null,
	);

	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const updateFetcherRef = useRef(updateFetcher);
	updateFetcherRef.current = updateFetcher;

	const draftId = initialDraft?.id as string;
	const _isNew = !draftId;
	const relationshipPicker = useRelationshipPicker({
		relationAType: "mail",
		relationAId: draftId || "",
		initialRelationships: [],
	});
	const signature = useMemo(
		() => buildSignature(user?.name, signatureRegards),
		[user?.name, signatureRegards],
	);

	const getEffectiveLinkedEntities = useCallback(
		(relationType: "receipt" | "reimbursement" | "minute") => {
			const rawLinked = relationships[relationType]?.linked ?? [];
			const rawAvailable = relationships[relationType]?.available ?? [];
			const toEntityArray = (
				values: unknown,
			): Array<Record<string, unknown>> =>
				(Array.isArray(values) ? (values as unknown[]) : []).filter(
					(value): value is Record<string, unknown> =>
						typeof value === "object" && value !== null,
				);
			const linked = toEntityArray(rawLinked);
			const available = toEntityArray(rawAvailable);

			const pendingUnlinks = new Set(
				relationshipPicker.pendingUnlinks
					.filter((u) => u.relationBType === relationType)
					.map((u) => u.relationBId),
			);
			const pendingLinks = new Set(
				relationshipPicker.pendingLinks
					.filter((l) => l.relationBType === relationType)
					.map((l) => l.relationBId),
			);

			const map = new Map<string, Record<string, unknown>>();
			for (const entity of linked) {
				if (typeof entity.id !== "string") continue;
				if (!pendingUnlinks.has(entity.id)) map.set(entity.id, entity);
			}
			for (const entity of available) {
				if (typeof entity.id !== "string") continue;
				if (pendingLinks.has(entity.id)) map.set(entity.id, entity);
			}

			return Array.from(map.values());
		},
		[
			relationships,
			relationshipPicker.pendingLinks,
			relationshipPicker.pendingUnlinks,
		],
	);

	// Initial draft creation is now handled by the /mail/compose redirect route

	// After draft created logic removed as it's passed from loader now

	// Debounced save draft
	const saveDraft = useCallback(() => {
		if (!draftId) return;
		const toJson = JSON.stringify(
			toRecipients.map((r) => ({ email: r.email, name: r.name })),
		);
		const ccJson =
			ccRecipients.length > 0
				? JSON.stringify(
					ccRecipients.map((r) => ({
						email: r.email,
						name: r.name,
					})),
				)
				: "";
		const bccJson =
			bccRecipients.length > 0
				? JSON.stringify(
					bccRecipients.map((r) => ({
						email: r.email,
						name: r.name,
					})),
				)
				: "";
		updateFetcherRef.current.submit(
			{
				_action: "updateDraft",
				draftId,
				to_json: toJson,
				cc_json: ccJson || "",
				bcc_json: bccJson || "",
				subject,
				body,
			},
			{ method: "post" },
		);
	}, [draftId, toRecipients, ccRecipients, bccRecipients, subject, body]);

	useEffect(() => {
		if (debounceRef.current) clearTimeout(debounceRef.current);
		if (!draftId) return;
		debounceRef.current = setTimeout(() => {
			saveDraft();
			debounceRef.current = null;
		}, DRAFT_SAVE_DEBOUNCE_MS);
		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
		};
	}, [draftId, saveDraft]);

	useEffect(() => {
		if (
			updateFetcher.state === "idle" &&
			updateFetcher.data &&
			"updatedAt" in updateFetcher.data &&
			updateFetcher.data.updatedAt
		) {
			setLastSavedAt(new Date(updateFetcher.data.updatedAt as string));
		}
	}, [updateFetcher.state, updateFetcher.data]);

	useEffect(() => {
		if (saveDraftFetcher.data?.error) {
			toast.error(saveDraftFetcher.data.error);
		} else if (saveDraftFetcher.data?.saved && saveDraftFetcher.data.updatedAt) {
			setLastSavedAt(new Date(saveDraftFetcher.data.updatedAt));
			toast.success(
				t("mail.draft_saved", {
					defaultValue: "Draft saved",
				}),
			);
		}
	}, [saveDraftFetcher.data, t]);

	useEffect(() => {
		if (!signature) return;
		setBody((prev) =>
			ensureSignedBody(prev, user?.name, signatureRegards),
		);
	}, [signature, user?.name, signatureRegards]);

	// Recipient helpers
	const addToRecipients = useCallback(
		(entries: { email: string; name?: string }[]) => {
			setToRecipients((prev) => {
				const byEmail = new Set(prev.map((r) => r.email.toLowerCase()));
				const next = [...prev];
				for (const e of entries) {
					if (!byEmail.has(e.email.toLowerCase())) {
						byEmail.add(e.email.toLowerCase());
						next.push({
							id: makeId(),
							email: e.email,
							name: e.name,
						});
					}
				}
				return next;
			});
		},
		[],
	);
	const addCcRecipients = useCallback(
		(entries: { email: string; name?: string }[]) => {
			setCcRecipients((prev) => {
				const byEmail = new Set(prev.map((r) => r.email.toLowerCase()));
				const next = [...prev];
				for (const e of entries) {
					if (!byEmail.has(e.email.toLowerCase())) {
						byEmail.add(e.email.toLowerCase());
						next.push({
							id: makeId(),
							email: e.email,
							name: e.name,
						});
					}
				}
				return next;
			});
		},
		[],
	);
	const addBccRecipients = useCallback(
		(entries: { email: string; name?: string }[]) => {
			setBccRecipients((prev) => {
				const byEmail = new Set(prev.map((r) => r.email.toLowerCase()));
				const next = [...prev];
				for (const e of entries) {
					if (!byEmail.has(e.email.toLowerCase())) {
						byEmail.add(e.email.toLowerCase());
						next.push({
							id: makeId(),
							email: e.email,
							name: e.name,
						});
					}
				}
				return next;
			});
		},
		[],
	);

	// Role-based recipient fetching
	useEffect(() => {
		if (
			getRecipientsFetcher.state === "idle" &&
			getRecipientsFetcher.data &&
			"recipients" in getRecipientsFetcher.data &&
			Array.isArray(getRecipientsFetcher.data.recipients)
		) {
			const list = getRecipientsFetcher.data.recipients;
			const field = getRecipientsFetcher.data.field ?? "to";
			const entries = list.map((r) => ({
				email: r.email,
				name: r.name,
			}));
			if (field === "to") addToRecipients(entries);
			else if (field === "cc") addCcRecipients(entries);
			else addBccRecipients(entries);
		}
	}, [
		getRecipientsFetcher.state,
		getRecipientsFetcher.data,
		addToRecipients,
		addCcRecipients,
		addBccRecipients,
	]);

	const getRecipientsForRoleBound = useCallback(
		(roleId: string, field: "to" | "cc" | "bcc") => {
			getRecipientsFetcher.submit(
				{ _action: "getRecipients", roleId, field },
				{ method: "post" },
			);
		},
		[getRecipientsFetcher],
	);

	const canSubmit =
		toRecipients.length > 0 &&
		subject.trim().length > 0 &&
		body.trim().length > 0;
	const linkedReceiptsForSend = draftId ? getEffectiveLinkedEntities("receipt") : [];
	const linkedMinutesForSend = draftId ? getEffectiveLinkedEntities("minute") : [];
	const linkedReimbursementsForSend = draftId
		? getEffectiveLinkedEntities("reimbursement")
		: [];
	const missingRequiredReimbursementAttachments =
		linkedReimbursementsForSend.length > 0 &&
		(linkedReceiptsForSend.length === 0 || linkedMinutesForSend.length === 0);
	const isSubmitting = navigation.state === "submitting";
	const handleAutofillSuggestions = (
		suggestions: Record<string, string | number | null>,
	) => {
		if (typeof suggestions.toEmail === "string" && suggestions.toEmail.trim()) {
			addToRecipients([{ email: suggestions.toEmail.trim() }]);
		}
		if (typeof suggestions.subject === "string") {
			setSubject(suggestions.subject);
		}
		if (typeof suggestions.body === "string") {
			setBody(
				ensureSignedBody(
					suggestions.body,
					user?.name,
					signatureRegards,
				),
			);
		}
	};

	const handleDeleteDraft = () => {
		if (!draftId) {
			navigate("/mail");
			return;
		}
		deleteFetcher.submit(
			{ _action: "deleteDraft", draftId },
			{ method: "post" },
		);
	};

	const handleManualSave = useCallback(() => {
		if (!draftId) return;
		const toJson = JSON.stringify(
			toRecipients.map((r) => ({ email: r.email, name: r.name })),
		);
		const ccJson =
			ccRecipients.length > 0
				? JSON.stringify(
					ccRecipients.map((r) => ({
						email: r.email,
						name: r.name,
					})),
				)
				: "";
		const bccJson =
			bccRecipients.length > 0
				? JSON.stringify(
					bccRecipients.map((r) => ({
						email: r.email,
						name: r.name,
					})),
				)
				: "";
		saveDraftFetcher.submit(
			{
				_action: "saveDraft",
				draftId,
				to_json: toJson,
				cc_json: ccJson || "",
				bcc_json: bccJson || "",
				subject,
				body,
				...relationshipPicker.toFormData(),
			},
			{ method: "post" },
		);
	}, [
		draftId,
		toRecipients,
		ccRecipients,
		bccRecipients,
		subject,
		body,
		relationshipPicker,
		saveDraftFetcher,
	]);

	if (!committeeMailConfigured) {
		return (
			<div className="mx-auto max-w-2xl px-4 py-8">
				<p className="text-gray-600 dark:text-gray-400">
					{t("committee.mail.not_configured")}
				</p>
			</div>
		);
	}

	const composeTitleKey =
		composeMode === "reply"
			? "mail.compose_reply"
			: composeMode === "replyAll"
				? "mail.compose_reply_all"
				: composeMode === "forward"
					? "mail.compose_forward"
					: "mail.compose_new";

	return (
		<Form id="mail-compose-form" method="post" className="flex flex-col gap-4">
			<input type="hidden" name="_action" value="send" />
			<input type="hidden" name="composeMode" value={composeMode} />
			{draftId && <input type="hidden" name="draftId" value={draftId} />}
			{originalMessage &&
				(composeMode === "reply" || composeMode === "replyAll") && (
					<input
						type="hidden"
						name="replyToMessageId"
						value={originalMessage.id}
					/>
				)}
			{originalMessage && composeMode === "forward" && (
				<input
					type="hidden"
					name="forwardFromMessageId"
					value={originalMessage.id}
				/>
			)}
			{toRecipients.map((r) => (
				<input key={r.id} type="hidden" name="to" value={r.email} />
			))}
			{ccRecipients.map((r) => (
				<input key={r.id} type="hidden" name="cc" value={r.email} />
			))}
			{bccRecipients.map((r) => (
				<input key={r.id} type="hidden" name="bcc" value={r.email} />
			))}

			{/* Header */}
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
							entityType="mail"
							entityId={draftId}
							getCurrentValues={() => ({
								subject,
								body,
							})}
							getExtraFormData={() => relationshipPicker.toFormData()}
							onSuggestions={handleAutofillSuggestions}
						/>
					)}
					{draftId && (
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={handleManualSave}
							disabled={saveDraftFetcher.state !== "idle"}
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
							{t("mail.delete_draft", {
								defaultValue: "Delete draft",
							})}
						</Button>
					)}
					<Button
						type="submit"
						disabled={
							!canSubmit || isSubmitting || missingRequiredReimbursementAttachments
						}
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

			{/* Compose form fields + relationships */}
			<div className="grid gap-6 lg:grid-cols-3">
				<div className="flex flex-col gap-4 lg:col-span-2">
					<RecipientField
						field="to"
						recipients={toRecipients}
						onAdd={addToRecipients}
						onRemove={(id) =>
							setToRecipients((prev) => prev.filter((r) => r.id !== id))
						}
						roles={roles}
						recipientCandidates={recipientCandidates}
						onGetRecipientsForRole={(roleId) =>
							getRecipientsForRoleBound(roleId, "to")
						}
						listId="compose-to-list"
						label={t("committee.mail.to")}
					/>
					<RecipientField
						field="cc"
						recipients={ccRecipients}
						onAdd={addCcRecipients}
						onRemove={(id) =>
							setCcRecipients((prev) => prev.filter((r) => r.id !== id))
						}
						roles={roles}
						recipientCandidates={recipientCandidates}
						onGetRecipientsForRole={(roleId) =>
							getRecipientsForRoleBound(roleId, "cc")
						}
						listId="compose-cc-list"
						label={t("committee.mail.cc")}
					/>
					<RecipientField
						field="bcc"
						recipients={bccRecipients}
						onAdd={addBccRecipients}
						onRemove={(id) =>
							setBccRecipients((prev) => prev.filter((r) => r.id !== id))
						}
						roles={roles}
						recipientCandidates={recipientCandidates}
						onGetRecipientsForRole={(roleId) =>
							getRecipientsForRoleBound(roleId, "bcc")
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
							onChange={(e) => setSubject(e.target.value)}
							className="h-8 flex-1 text-sm"
							placeholder={t("committee.mail.subject_placeholder")}
						/>
					</div>

					<div className="flex flex-col gap-1">
						<textarea
							name="body"
							required
							rows={14}
							value={body}
							onChange={(e) => setBody(e.target.value)}
							className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] md:text-sm"
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
				{draftId && (
					<div className="lg:col-span-1">
						<RelationshipPicker
							relationAType="mail"
							relationAId={draftId}
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
										linkedEntities: (relData.linked ?? []) as any[],
										availableEntities: (relData.available ?? []) as any[],
										canWrite: relData.canWrite ?? false,
										maxItems,
									},
								];
							})}
							onLink={relationshipPicker.handleLink}
							onUnlink={relationshipPicker.handleUnlink}
							formData={relationshipPicker.toFormData()}
						/>
						{(() => {
							const linkedReceipts = getEffectiveLinkedEntities("receipt");
							const linkedMinutes = getEffectiveLinkedEntities("minute");
							const linkedReimbursements =
								getEffectiveLinkedEntities("reimbursement");

							const previewItems: Array<{
								key: string;
								label: string;
							}> = [
									...linkedReceipts.map((receipt) => ({
										key: `receipt-${String(receipt.id || "unknown")}`,
										label: `Receipt: ${displayAttachmentName(
											receipt,
											"receipt-file",
										)}`,
									})),
									...linkedMinutes.map((minute) => ({
										key: `minute-${String(minute.id || "unknown")}`,
										label: `Minutes: ${displayAttachmentName(
											minute,
											"minutes.pdf",
										)}`,
									})),
									// We no longer show reimbursement details as an attachment preview.
								];

							if (previewItems.length === 0) {
								return (
									<div className="bg-muted/30 mt-3 rounded-md border p-3 text-sm">
										<p className="font-medium">Email attachments</p>
										<p className="text-muted-foreground mt-1">
											No linked receipts, minutes, or reimbursements to attach.
										</p>
									</div>
								);
							}

							return (
								<div className="bg-muted/30 mt-3 rounded-md border p-3 text-sm">
									<p className="font-medium">Email attachments</p>
									<p className="text-muted-foreground mt-1">
										These files/details are attached automatically on send.
									</p>
									<ul className="mt-2 space-y-1">
										{previewItems.map((item) => (
											<li key={item.key} className="text-foreground">
												{item.label}
											</li>
										))}
									</ul>
								</div>
							);
						})()}
					</div>
				)}
			</div>

			{/* Quoted reply preview (non-editable) */}
			{originalMessage &&
				(composeMode === "reply" || composeMode === "replyAll") && (
					<div className="rounded-md border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900">
						<p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
							{t("mail.quoted_reply_header", {
								date: new Date(originalMessage.date).toLocaleString(),
								name: originalMessage.fromName || originalMessage.fromAddress,
								email: originalMessage.fromAddress,
								defaultValue: `On ${new Date(originalMessage.date).toLocaleString()}, ${originalMessage.fromName || originalMessage.fromAddress} wrote:`,
							})}
						</p>
						<div className="border-l-2 border-gray-300 pl-3 dark:border-gray-600">
							<IsolatedEmailContent html={originalMessage.bodyHtml ?? ""} />
						</div>
					</div>
				)}

			{/* Forwarded message preview */}
			{originalMessage && composeMode === "forward" && (
				<div className="rounded-md border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900">
					<p className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">
						----------{" "}
						{t("mail.forwarded_message", {
							defaultValue: "Forwarded message",
						})}{" "}
						----------
					</p>
					<div className="mb-2 grid gap-1 text-xs text-gray-500 dark:text-gray-400">
						<p>
							{t("mail.from")}:{" "}
							{originalMessage.fromName
								? `${originalMessage.fromName} <${originalMessage.fromAddress}>`
								: originalMessage.fromAddress}
						</p>
						<p>
							{t("mail.date")}:{" "}
							{new Date(originalMessage.date).toLocaleString()}
						</p>
						<p>
							{t("committee.mail.subject")}: {originalMessage.subject}
						</p>
					</div>
					<IsolatedEmailContent html={originalMessage.bodyHtml ?? ""} />
				</div>
			)}
		</Form>
	);
}
