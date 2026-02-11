import { ArrowLeft, Send, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { type CommitteeMailMessage, getDatabase, type MailDraft } from "~/db";
import { requirePermission } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import { renderCommitteeEmail } from "~/lib/email-templates/committee-email";
import {
	type CommitteeMailRecipient,
	isCommitteeMailConfigured,
	sendCommitteeEmail,
} from "~/lib/mail-nodemailer.server";
import {
	buildQuotedReplyHtml,
	buildReferencesForReply,
	computeThreadId,
} from "~/lib/mail-threading.server";
import { addForwardPrefix, addReplyPrefix } from "~/lib/mail-utils";
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

export function meta({ data }: Route.MetaArgs) {
	return [
		{
			title: `${data?.siteConfig?.name || "Portal"} - Compose`,
		},
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request, params }: Route.LoaderArgs) {
	await requirePermission(request, "committee:email", getDatabase);
	const db = getDatabase();

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
	const draftId = params.id;
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
	};
}

export async function action({ request }: Route.ActionArgs) {
	await requirePermission(request, "committee:email", getDatabase);
	const formData = await request.formData();
	const intent = formData.get("_action") as string;
	const db = getDatabase();

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
		const bodyHtml = body.replace(/\n/g, "<br>\n");
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

		let html: string;
		try {
			html = await renderCommitteeEmail({
				bodyHtml,
				quotedReply,
			});
		} catch {
			// Fallback to simple HTML if React Email rendering fails
			html = quotedReply
				? `${bodyHtml}${buildQuotedReplyHtml(quotedReply.date, quotedReply.fromName, quotedReply.fromEmail, quotedReply.bodyHtml)}`
				: bodyHtml;
		}

		const result = await sendCommitteeEmail({
			to,
			cc,
			bcc,
			subject,
			html,
			inReplyTo: inReplyToHeader,
			references: referencesHeader,
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

		// Navigate to thread view if part of a thread, otherwise to the message
		if (threadId) {
			return redirect(`/mail/thread/${encodeURIComponent(threadId)}`);
		}
		return redirect(`/mail/${inserted.id}`);
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
	} = loaderData;
	const { t } = useTranslation();
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
	const isSubmitting = navigation.state === "submitting";

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
					<Button type="submit" disabled={!canSubmit || isSubmitting} size="sm">
						<Send className="mr-1 size-4" />
						{t("mail.send_tooltip")}
					</Button>
				</div>
			</div>

			{/* Compose form fields */}
			<div className="flex flex-col gap-4">
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
						className="h-8 flex-1 border-gray-300 bg-white text-sm dark:border-gray-600 dark:bg-gray-800"
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
						className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
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
						<div
							className="prose prose-sm dark:prose-invert max-w-none border-l-2 border-gray-300 pl-3 text-gray-500 dark:border-gray-600 dark:text-gray-400"
							// biome-ignore lint/security/noDangerouslySetInnerHtml: original email body from DB
							dangerouslySetInnerHTML={{
								__html: originalMessage.bodyHtml ?? "",
							}}
						/>
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
					<div
						className="prose prose-sm dark:prose-invert max-w-none text-gray-500 dark:text-gray-400"
						// biome-ignore lint/security/noDangerouslySetInnerHtml: forwarded email body from DB
						dangerouslySetInnerHTML={{ __html: originalMessage.bodyHtml ?? "" }}
					/>
				</div>
			)}
		</Form>
	);
}
