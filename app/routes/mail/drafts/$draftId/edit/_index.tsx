import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	Form,
	redirect,
	useActionData,
	useFetcher,
	useNavigate,
	useNavigation,
	useSearchParams,
} from "react-router";
import { toast } from "sonner";
import { type RecipientEntry } from "~/components/committee-recipient-field";
import { MailComposeHeader } from "~/components/mail/mail-compose-header";
import { MailComposeMainFields } from "~/components/mail/mail-compose-main-fields";
import { MailComposeSidebar } from "~/components/mail/mail-compose-sidebar";
import { MailOriginalMessagePreview } from "~/components/mail/mail-original-message-preview";
import { useUser } from "~/contexts/user-context";
import { type CommitteeMailMessage, getDatabase, type MailDraft } from "~/db/server.server";
import { useMailDraftAttachments } from "~/hooks/use-mail-draft-attachments";
import { useRelationshipPicker } from "~/hooks/use-relationship-picker";
import { requirePermission } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import {
	deleteDraftAndCleanupAttachments,
	getRecipientsByRoleAction,
	loadComposeRecipients,
	loadDraftComposeContext,
	parseDraftMutationFields,
	saveMailDraftRelationshipsAndContent,
	sendMailDraftAndPersist,
	type ComposeMode,
} from "~/lib/mail-draft-edit.server";
import {
	primaryText,
} from "~/lib/email.server";
import {
	buildSignature,
	ensureSignedHtmlBody,
	plaintextToHtml,
} from "~/lib/mail-draft-body.server";
import {
	parseDraftAttachmentState,
} from "~/lib/mail-draft-attachments";
import {
	isCommitteeMailConfigured,
} from "~/lib/mail-nodemailer.server";
import { addForwardPrefix, addReplyPrefix } from "~/lib/mail-utils";
import { getSystemLanguageDefaults } from "~/lib/settings.server";
import type { Route } from "./+types/_index";

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

function hasHtmlTags(value: string): boolean {
	return /<[^>]+>/.test(value);
}

function ensureHtmlBody(value: string): string {
	const trimmed = value.trim();
	if (!trimmed) return "<p></p>";
	return hasHtmlTags(trimmed) ? trimmed : plaintextToHtml(trimmed);
}

function htmlToText(value: string): string {
	return value
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/<[^>]+>/g, " ")
		.replace(/&nbsp;/g, " ")
		.replace(/\s+/g, " ")
		.trim();
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
	const { rolesExcludingGuest, recipientCandidates } =
		await loadComposeRecipients(db);

	const url = new URL(request.url);
	const draftId = params.draftId;
	if (!draftId || !UUID_REGEX.test(draftId)) {
		throw new Response("Not Found", { status: 404 });
	}

	const { draft, originalMessage, composeMode, relationships, threadRelationId } =
		await loadDraftComposeContext(
			db,
			url,
			draftId,
			currentUser.permissions,
		);

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
		threadRelationId,
		signatureRegards,
	};
}

export async function action({ request }: Route.ActionArgs) {
	const currentUser = await requirePermission(
		request,
		"committee:email",
		getDatabase,
	);
	const formData = await request.formData();
	const intent = formData.get("_action") as string;
	const db = getDatabase();
	const { primary: primaryLanguage } = await getSystemLanguageDefaults();
	const signatureRegards = primaryText(primaryLanguage, "mail.signature.regards");

	if (intent === "getRecipients") {
		return getRecipientsByRoleAction(db, formData);
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
		const fields = parseDraftMutationFields(formData);
		const updated = await db.updateMailDraft(draftId, {
			toJson: fields.toJson,
			ccJson: fields.ccJson,
			bccJson: fields.bccJson,
			subject: fields.subject,
			body: fields.body,
			attachmentsJson: fields.attachmentsJson,
		});
		return updated
			? { draft: updated, updatedAt: updated.updatedAt }
			: { error: "Draft not found" };
	}

	if (intent === "saveDraft") {
		const draftId = formData.get("draftId") as string;
		if (!draftId) return { saved: false, error: "Missing draftId" };
		const fields = parseDraftMutationFields(formData);
		const body = fields.body;
		const normalizedBody = body ? ensureHtmlBody(body) : body;
		const signedBody = normalizedBody
			? ensureSignedHtmlBody(
					normalizedBody,
					currentUser.name,
					signatureRegards,
				)
			: normalizedBody;
		const updated = await saveMailDraftRelationshipsAndContent({
			db,
			formData,
			draftId,
			body: signedBody,
			userId: currentUser.userId || null,
			userPermissions: currentUser.permissions,
		});

		return updated
			? { saved: true, updatedAt: updated.updatedAt, draft: updated }
			: { saved: false, error: "Draft not found" };
	}

	if (intent === "send") {
		return sendMailDraftAndPersist({
			db,
			formData,
			request,
			userId: currentUser.userId || null,
			userPermissions: currentUser.permissions,
			userName: currentUser.name,
			signatureRegards,
			ensureHtmlBody,
			ensureSignedHtmlBody,
			htmlToText,
		});
	}

	if (intent === "deleteDraft") {
		const draftId = formData.get("draftId") as string;
		if (!draftId) return { deleted: false, error: "Missing draftId" };
		const ok = await deleteDraftAndCleanupAttachments(db, draftId);
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
		threadRelationId,
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
		if (initialDraft?.body) return ensureHtmlBody(initialDraft.body);
		if (composeMode === "forward" && originalMessage) {
			// Include forwarded message body as plain text
			const text =
				originalMessage.bodyText ||
				originalMessage.bodyHtml.replace(/<[^>]+>/g, "");
			return ensureHtmlBody(
				`\n\n---------- Forwarded message ----------\nFrom: ${originalMessage.fromName || ""} <${originalMessage.fromAddress}>\nDate: ${new Date(originalMessage.date).toLocaleString()}\nSubject: ${originalMessage.subject}\n\n${text}`,
			);
		}
		return "<p></p>";
	};

	// State
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
	const relationAId = threadRelationId || draftId;
	const _isNew = !draftId;
	const relationshipPicker = useRelationshipPicker({
		relationAType: "mail_thread",
		relationAId: relationAId || "",
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

	const linkedReceiptsForSend = draftId ? getEffectiveLinkedEntities("receipt") : [];
	const linkedMinutesForSend = draftId ? getEffectiveLinkedEntities("minute") : [];
	const linkedReimbursementsForSend = draftId
		? getEffectiveLinkedEntities("reimbursement")
		: [];
	const {
		attachmentState,
		relationAttachmentItems,
		excludedKeys,
		includedRelationAttachmentCount,
		missingRequiredReimbursementAttachments,
		uploadManualAttachment,
		excludeRelationAttachment,
		includeRelationAttachment,
		removeManualAttachment,
	} = useMailDraftAttachments({
		initialState: parseDraftAttachmentState(initialDraft?.attachmentsJson),
		linkedReceipts: linkedReceiptsForSend,
		linkedMinutes: linkedMinutesForSend,
		linkedReimbursements: linkedReimbursementsForSend,
		displayAttachmentName,
		makeId,
	});
	const canSubmit =
		toRecipients.length > 0 &&
		subject.trim().length > 0 &&
		htmlToText(body).length > 0;
	const isSubmitting = navigation.state === "submitting";

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
				attachments_json: JSON.stringify(attachmentState),
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
		attachmentState,
	]);

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
			ensureSignedHtmlBody(prev, user?.name, signatureRegards),
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
				ensureSignedHtmlBody(
					ensureHtmlBody(suggestions.body),
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
				attachments_json: JSON.stringify(attachmentState),
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
		attachmentState,
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
				<input type="hidden" name="body" value={body} />
				<input
					type="hidden"
					name="attachments_json"
					value={JSON.stringify(attachmentState)}
				/>

			<MailComposeHeader
				composeTitleKey={composeTitleKey}
				draftId={draftId}
				relationAId={relationAId}
				subject={subject}
				body={body}
				canSubmit={canSubmit}
				isSubmitting={isSubmitting}
				missingRequiredReimbursementAttachments={
					missingRequiredReimbursementAttachments
				}
				saveDisabled={saveDraftFetcher.state !== "idle"}
				onSaveDraft={handleManualSave}
				onDeleteDraft={handleDeleteDraft}
				onAutofillSuggestions={handleAutofillSuggestions}
				getRelationshipFormData={() => relationshipPicker.toFormData()}
			/>

			<div className="grid gap-6 lg:grid-cols-3">
				<MailComposeMainFields
					toRecipients={toRecipients}
					ccRecipients={ccRecipients}
					bccRecipients={bccRecipients}
					onAddToRecipients={addToRecipients}
					onAddCcRecipients={addCcRecipients}
					onAddBccRecipients={addBccRecipients}
					onRemoveToRecipient={(id) =>
						setToRecipients((prev) => prev.filter((r) => r.id !== id))
					}
					onRemoveCcRecipient={(id) =>
						setCcRecipients((prev) => prev.filter((r) => r.id !== id))
					}
					onRemoveBccRecipient={(id) =>
						setBccRecipients((prev) => prev.filter((r) => r.id !== id))
					}
					roles={roles}
					recipientCandidates={recipientCandidates}
					onGetRecipientsForRole={getRecipientsForRoleBound}
					subject={subject}
					onSubjectChange={setSubject}
					body={body}
					onBodyChange={setBody}
					lastSavedAt={lastSavedAt}
				/>
				{draftId && (
					<MailComposeSidebar
						draftId={draftId}
						relationAId={relationAId}
						subject={subject}
						relationships={relationships as Record<string, any>}
						formData={relationshipPicker.toFormData()}
						onLink={relationshipPicker.handleLink}
						onUnlink={relationshipPicker.handleUnlink}
						relationAttachmentItems={relationAttachmentItems}
						excludedKeys={excludedKeys}
						attachmentState={attachmentState}
						includedRelationAttachmentCount={includedRelationAttachmentCount}
						onUploadManualAttachment={uploadManualAttachment}
						onIncludeRelationAttachment={includeRelationAttachment}
						onExcludeRelationAttachment={excludeRelationAttachment}
						onRemoveManualAttachment={removeManualAttachment}
					/>
				)}
			</div>
			<MailOriginalMessagePreview
				composeMode={composeMode}
				originalMessage={originalMessage}
			/>
		</Form>
	);
}
