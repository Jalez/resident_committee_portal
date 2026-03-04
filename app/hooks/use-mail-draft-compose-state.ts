import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type Dispatch,
	type SetStateAction,
} from "react";
import { useTranslation } from "react-i18next";
import { useFetcher, useNavigate, useNavigation } from "react-router";
import { toast } from "sonner";
import type { RecipientEntry } from "~/components/committee-recipient-field";
import { useUser } from "~/contexts/user-context";
import type { CommitteeMailMessage, MailDraft } from "~/db/server.server";
import type { RelationshipEntityType } from "~/db/types";
import { useMailDraftAttachments } from "~/hooks/use-mail-draft-attachments";
import { useRelationshipPicker } from "~/hooks/use-relationship-picker";
import { buildSignature, ensureSignedHtmlBody } from "~/lib/mail-draft-body";
import {
	parseDraftAttachmentState,
	type RelationAttachmentKey,
} from "~/lib/mail-draft-attachments";
import type { ComposeMode } from "~/lib/mail-draft-edit.server";
import { addForwardPrefix, addReplyPrefix } from "~/lib/mail-utils";
import type { MailDraftComposeContextValue } from "~/contexts/mail-draft-compose-context";

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

type RoleOption = { id: string; name: string };
type RecipientCandidate = { id: string; name: string; email: string };
type RelationshipSectionData = {
	linked?: unknown[];
	available?: unknown[];
	canWrite?: boolean;
};

type Params = {
	initialDraft: MailDraft | null;
	originalMessage: CommitteeMailMessage | null;
	initialComposeMode: ComposeMode;
	committeeFromEmail: string;
	roles: RoleOption[];
	recipientCandidates: RecipientCandidate[];
	relationships: Record<string, RelationshipSectionData | undefined>;
	threadRelationId: string;
	signatureRegards: string;
	ensureHtmlBody: (value: string) => string;
	htmlToText: (value: string) => string;
};

export function useMailDraftComposeState({
	initialDraft,
	originalMessage,
	initialComposeMode,
	committeeFromEmail,
	roles,
	recipientCandidates,
	relationships,
	threadRelationId,
	signatureRegards,
	ensureHtmlBody,
	htmlToText,
}: Params): MailDraftComposeContextValue {
	const { t } = useTranslation();
	const { user } = useUser();
	const navigate = useNavigate();
	const navigation = useNavigation();

	const composeMode = initialComposeMode as ComposeMode;

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
			const toList = parseRecipients(originalMessage.toJson);
			for (const r of toList) {
				if (r.email.toLowerCase() !== committeeFromEmail.toLowerCase()) {
					recipients.push(r);
				}
			}
			return recipients;
		}
		return [];
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
			const text =
				originalMessage.bodyText ||
				originalMessage.bodyHtml.replace(/<[^>]+>/g, "");
			return ensureHtmlBody(
				`\n\n---------- Forwarded message ----------\nFrom: ${originalMessage.fromName || ""} <${originalMessage.fromAddress}>\nDate: ${new Date(originalMessage.date).toLocaleString()}\nSubject: ${originalMessage.subject}\n\n${text}`,
			);
		}
		return "<p></p>";
	};

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

	const [toRecipients, setToRecipients] = useState<RecipientEntry[]>(getInitialTo);
	const [ccRecipients, setCcRecipients] = useState<RecipientEntry[]>(getInitialCc);
	const [bccRecipients, setBccRecipients] = useState<RecipientEntry[]>(() =>
		initialDraft ? parseRecipients(initialDraft.bccJson) : [],
	);
	const [subject, setSubject] = useState(getInitialSubject);
	const [body, setBody] = useState(getInitialBody);
	const [lastSavedAt, setLastSavedAt] = useState<Date | null>(
		initialDraft?.updatedAt ? new Date(initialDraft.updatedAt) : null,
	);

	const draftId = initialDraft?.id || null;
	const relationAId = threadRelationId || draftId || "";
	const relationshipPicker = useRelationshipPicker({
		relationAType: "mail_thread",
		relationAId: relationAId || "",
		initialRelationships: [],
	});

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

	const linkedReceiptsForSend = draftId
		? getEffectiveLinkedEntities("receipt")
		: [];
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

	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const updateFetcherRef = useRef(updateFetcher);
	updateFetcherRef.current = updateFetcher;

	const serializeRecipients = useCallback(
		(recipients: { email: string; name?: string }[]) =>
			JSON.stringify(recipients.map((r) => ({ email: r.email, name: r.name }))),
		[],
	);

	const saveDraft = useCallback(() => {
		if (!draftId) return;
		const toJson = serializeRecipients(toRecipients);
		const ccJson = ccRecipients.length > 0 ? serializeRecipients(ccRecipients) : "";
		const bccJson =
			bccRecipients.length > 0 ? serializeRecipients(bccRecipients) : "";
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
		attachmentState,
		bccRecipients,
		body,
		ccRecipients,
		draftId,
		serializeRecipients,
		subject,
		toRecipients,
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

	const signature = useMemo(
		() => buildSignature(user?.name, signatureRegards),
		[user?.name, signatureRegards],
	);

	useEffect(() => {
		if (!signature) return;
		setBody((prev) => ensureSignedHtmlBody(prev, user?.name, signatureRegards));
	}, [signature, signatureRegards, user?.name]);

	const addUniqueRecipients = useCallback(
		(
			setter: Dispatch<
				SetStateAction<RecipientEntry[]>
			>,
			entries: { email: string; name?: string }[],
		) => {
			setter((prev) => {
				const byEmail = new Set(prev.map((r) => r.email.toLowerCase()));
				const next = [...prev];
				for (const entry of entries) {
					if (!byEmail.has(entry.email.toLowerCase())) {
						byEmail.add(entry.email.toLowerCase());
						next.push({
							id: makeId(),
							email: entry.email,
							name: entry.name,
						});
					}
				}
				return next;
			});
		},
		[],
	);

	const addToRecipients = useCallback(
		(entries: { email: string; name?: string }[]) =>
			addUniqueRecipients(setToRecipients, entries),
		[addUniqueRecipients],
	);
	const addCcRecipients = useCallback(
		(entries: { email: string; name?: string }[]) =>
			addUniqueRecipients(setCcRecipients, entries),
		[addUniqueRecipients],
	);
	const addBccRecipients = useCallback(
		(entries: { email: string; name?: string }[]) =>
			addUniqueRecipients(setBccRecipients, entries),
		[addUniqueRecipients],
	);

	const removeToRecipient = useCallback((id: string) => {
		setToRecipients((prev) => prev.filter((r) => r.id !== id));
	}, []);
	const removeCcRecipient = useCallback((id: string) => {
		setCcRecipients((prev) => prev.filter((r) => r.id !== id));
	}, []);
	const removeBccRecipient = useCallback((id: string) => {
		setBccRecipients((prev) => prev.filter((r) => r.id !== id));
	}, []);

	useEffect(() => {
		if (
			getRecipientsFetcher.state === "idle" &&
			getRecipientsFetcher.data &&
			"recipients" in getRecipientsFetcher.data &&
			Array.isArray(getRecipientsFetcher.data.recipients)
		) {
			const list = getRecipientsFetcher.data.recipients;
			const field = getRecipientsFetcher.data.field ?? "to";
			const entries = list.map((r) => ({ email: r.email, name: r.name }));
			if (field === "to") addToRecipients(entries);
			else if (field === "cc") addCcRecipients(entries);
			else addBccRecipients(entries);
		}
	}, [
		addBccRecipients,
		addCcRecipients,
		addToRecipients,
		getRecipientsFetcher.data,
		getRecipientsFetcher.state,
	]);

	const getRecipientsForRole = useCallback(
		(roleId: string, field: "to" | "cc" | "bcc") => {
			getRecipientsFetcher.submit(
				{ _action: "getRecipients", roleId, field },
				{ method: "post" },
			);
		},
		[getRecipientsFetcher],
	);

	const handleAutofillSuggestions = useCallback(
		(suggestions: Record<string, string | number | null>) => {
			if (
				typeof suggestions.toEmail === "string" &&
				suggestions.toEmail.trim().length > 0
			) {
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
		},
		[addToRecipients, ensureHtmlBody, signatureRegards, user?.name],
	);

	const handleDeleteDraft = useCallback(() => {
		if (!draftId) {
			navigate("/mail");
			return;
		}
		deleteFetcher.submit(
			{ _action: "deleteDraft", draftId },
			{ method: "post" },
		);
	}, [deleteFetcher, draftId, navigate]);

	const getRelationshipFormData = useCallback(
		() => relationshipPicker.toFormData(),
		[relationshipPicker],
	);

	const handleManualSave = useCallback(() => {
		if (!draftId) return;
		const toJson = serializeRecipients(toRecipients);
		const ccJson = ccRecipients.length > 0 ? serializeRecipients(ccRecipients) : "";
		const bccJson =
			bccRecipients.length > 0 ? serializeRecipients(bccRecipients) : "";
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
		attachmentState,
		bccRecipients,
		body,
		ccRecipients,
		draftId,
		relationshipPicker,
		saveDraftFetcher,
		serializeRecipients,
		subject,
		toRecipients,
	]);

	return {
		composeMode,
		draftId,
		relationAId,
		roles,
		recipientCandidates,
		toRecipients,
		ccRecipients,
		bccRecipients,
		subject,
		body,
		lastSavedAt,
		relationships,
		attachmentState,
		relationAttachmentItems,
		excludedKeys,
		includedRelationAttachmentCount,
		missingRequiredReimbursementAttachments,
		canSubmit,
		isSubmitting,
		saveDisabled: saveDraftFetcher.state !== "idle",
		setSubject,
		setBody,
		addToRecipients,
		addCcRecipients,
		addBccRecipients,
		removeToRecipient,
		removeCcRecipient,
		removeBccRecipient,
		getRecipientsForRole,
		handleAutofillSuggestions,
		handleDeleteDraft,
		handleManualSave,
		getRelationshipFormData,
		handleLink: (
			relationBType: RelationshipEntityType,
			relationBId: string,
			metadata?: Record<string, unknown>,
		) => relationshipPicker.handleLink(relationBType, relationBId, metadata),
		handleUnlink: (relationBType: RelationshipEntityType, relationBId: string) =>
			relationshipPicker.handleUnlink(relationBType, relationBId),
		uploadManualAttachment,
		includeRelationAttachment: (key: RelationAttachmentKey) =>
			includeRelationAttachment(key),
		excludeRelationAttachment: (key: RelationAttachmentKey) =>
			excludeRelationAttachment(key),
		removeManualAttachment,
	};
}
