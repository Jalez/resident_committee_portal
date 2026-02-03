"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Form, useFetcher, useNavigate, useNavigation } from "react-router";
import { Send, X } from "lucide-react";
import type { MailDraft } from "~/db";
import { RecipientField } from "~/components/committee-recipient-field";
import type { RecipientEntry } from "~/components/committee-recipient-field";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
	SheetClose,
	SheetHeader,
	SheetTitle,
} from "~/components/ui/sheet";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "~/components/ui/tooltip";

const UUID_REGEX =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DRAFT_SAVE_DEBOUNCE_MS = 1200;

function makeId() {
	return (
		crypto.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`
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

export interface MailComposeFormProps {
	composeParam: string;
	draft?: MailDraft | null;
	onClose: () => void;
	roles: { id: string; name: string }[];
	recipientCandidates: { id: string; name: string; email: string }[];
}

export function MailComposeForm({
	composeParam,
	draft: initialDraft,
	onClose: _onClose,
	roles,
	recipientCandidates,
}: MailComposeFormProps) {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const navigation = useNavigation();
	const createFetcher = useFetcher<{ draftId?: string; draft?: MailDraft }>();
	const updateFetcher = useFetcher<{ updatedAt?: string }>();
	const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);

	const isNew = composeParam === "new";
	const draftId = UUID_REGEX.test(composeParam) ? composeParam : currentDraftId;

	const [toRecipients, setToRecipients] = useState<RecipientEntry[]>(() =>
		initialDraft ? parseRecipients(initialDraft.toJson) : [],
	);
	const [ccRecipients, setCcRecipients] = useState<RecipientEntry[]>(() =>
		initialDraft ? parseRecipients(initialDraft.ccJson) : [],
	);
	const [bccRecipients, setBccRecipients] = useState<RecipientEntry[]>(() =>
		initialDraft ? parseRecipients(initialDraft.bccJson) : [],
	);
	const [subject, setSubject] = useState(initialDraft?.subject ?? "");
	const [body, setBody] = useState(initialDraft?.body ?? "");
	const [lastSavedAt, setLastSavedAt] = useState<Date | null>(
		initialDraft?.updatedAt ? new Date(initialDraft.updatedAt) : null,
	);

	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const updateFetcherRef = useRef(updateFetcher);
	updateFetcherRef.current = updateFetcher;
	const createFetcherRef = useRef(createFetcher);
	createFetcherRef.current = createFetcher;

	// Create draft when opening with compose=new (run once when idle and no draft yet)
	useEffect(() => {
		if (!isNew || createFetcher.data?.draftId) return;
		if (createFetcher.state === "idle" && !createFetcher.data) {
			createFetcherRef.current.submit(
				{ _action: "createDraft" },
				{ method: "post" },
			);
		}
	}, [isNew, createFetcher.state, createFetcher.data]);

	// After create, navigate to ?compose=<draftId> so refresh keeps the same draft
	useEffect(() => {
		const id = createFetcher.data?.draftId;
		if (id) {
			setCurrentDraftId(id);
			navigate(`/mail?compose=${id}`, { replace: true });
		}
	}, [createFetcher.data?.draftId, navigate]);

	// Debounced save draft – only re-run when form data or draftId actually change
	const saveDraft = useCallback(() => {
		if (!draftId) return;
		const toJson = JSON.stringify(
			toRecipients.map((r) => ({ email: r.email, name: r.name })),
		);
		const ccJson =
			ccRecipients.length > 0
				? JSON.stringify(
						ccRecipients.map((r) => ({ email: r.email, name: r.name })),
					)
				: "";
		const bccJson =
			bccRecipients.length > 0
				? JSON.stringify(
						bccRecipients.map((r) => ({ email: r.email, name: r.name })),
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
	}, [
		draftId,
		toRecipients,
		ccRecipients,
		bccRecipients,
		subject,
		body,
	]);

	// Debounce: set a single timeout when form data or draftId change; cancel on next change
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

	const addToRecipients = useCallback((entries: { email: string; name?: string }[]) => {
		setToRecipients((prev) => {
			const byEmail = new Set(prev.map((r) => r.email.toLowerCase()));
			const next = [...prev];
			for (const e of entries) {
				if (!byEmail.has(e.email.toLowerCase())) {
					byEmail.add(e.email.toLowerCase());
					next.push({ id: makeId(), email: e.email, name: e.name });
				}
			}
			return next;
		});
	}, []);
	const addCcRecipients = useCallback((entries: { email: string; name?: string }[]) => {
		setCcRecipients((prev) => {
			const byEmail = new Set(prev.map((r) => r.email.toLowerCase()));
			const next = [...prev];
			for (const e of entries) {
				if (!byEmail.has(e.email.toLowerCase())) {
					byEmail.add(e.email.toLowerCase());
					next.push({ id: makeId(), email: e.email, name: e.name });
				}
			}
			return next;
		});
	}, []);
	const addBccRecipients = useCallback((entries: { email: string; name?: string }[]) => {
		setBccRecipients((prev) => {
			const byEmail = new Set(prev.map((r) => r.email.toLowerCase()));
			const next = [...prev];
			for (const e of entries) {
				if (!byEmail.has(e.email.toLowerCase())) {
					byEmail.add(e.email.toLowerCase());
					next.push({ id: makeId(), email: e.email, name: e.name });
				}
			}
			return next;
		});
	}, []);

	// Dedicated fetcher for getRecipients so we don't overwrite updateDraft response
	const getRecipientsFetcher = useFetcher<{
		recipients?: { id: string; name: string; email: string }[];
		field?: "to" | "cc" | "bcc";
	}>();
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

	return (
		<>
			<SheetHeader className="flex shrink-0 flex-row items-center justify-between gap-2 border-b border-gray-200 dark:border-gray-700 pb-3">
				<div className="flex min-w-0 flex-1 items-center gap-2">
					<SheetClose className="shrink-0 rounded-md bg-muted/50 p-1.5 opacity-70 transition-opacity hover:bg-muted hover:opacity-100 focus:outline-hidden focus:ring-2 focus:ring-offset-2">
						<X className="size-4" />
						<span className="sr-only">{t("mail.close", { defaultValue: "Close" })}</span>
					</SheetClose>
					<SheetTitle className="min-w-0 truncate text-base">{t("mail.compose")}</SheetTitle>
				</div>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							type="submit"
							form="mail-compose-form"
							disabled={!canSubmit || isSubmitting}
							variant="ghost"
							size="icon"
							aria-label={t("mail.send_tooltip")}
							className="shrink-0"
						>
							<Send className="size-4" />
						</Button>
					</TooltipTrigger>
					<TooltipContent>{t("mail.send_tooltip")}</TooltipContent>
				</Tooltip>
			</SheetHeader>
			<div className="flex min-h-0 flex-1 flex-col overflow-auto px-4 pt-4 pb-4">
				<Form id="mail-compose-form" method="post" className="flex flex-col gap-4">
				<input type="hidden" name="_action" value="send" />
				{draftId && UUID_REGEX.test(draftId) && (
					<input type="hidden" name="draftId" value={draftId} />
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

				{/* Labels on same row with ":" (RecipientField renders label: chips+input) */}
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
						className="h-8 flex-1 text-sm bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
						placeholder={t("committee.mail.subject_placeholder")}
					/>
				</div>

				<div className="flex flex-col gap-1">
					<div className="flex items-center gap-2">
						<span className="shrink-0 text-base font-medium">
							{t("committee.mail.body")}:
						</span>
					</div>
					<textarea
						name="body"
						required
						rows={10}
						value={body}
						onChange={(e) => setBody(e.target.value)}
						className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white px-3 py-2 text-gray-900 dark:bg-gray-800 dark:text-white"
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
			</Form>
			</div>
		</>
	);
}
