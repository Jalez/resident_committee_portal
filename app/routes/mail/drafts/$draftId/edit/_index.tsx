import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
	Form,
	redirect,
	useActionData,
} from "react-router";
import { toast } from "sonner";
import { MailComposeHeader } from "~/components/mail/mail-compose-header";
import { MailComposeMainFields } from "~/components/mail/mail-compose-main-fields";
import { MailComposeSidebar } from "~/components/mail/mail-compose-sidebar";
import { MailOriginalMessagePreview } from "~/components/mail/mail-original-message-preview";
import { MailDraftComposeProvider } from "~/contexts/mail-draft-compose-context";
import { getDatabase } from "~/db/server.server";
import { useMailDraftComposeState } from "~/hooks/use-mail-draft-compose-state";
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
	ensureSignedHtmlBody,
	plaintextToHtml,
} from "~/lib/mail-draft-body";
import {
	isCommitteeMailConfigured,
} from "~/lib/mail-nodemailer.server";
import { getSystemLanguageDefaults } from "~/lib/settings.server";
import type { Route } from "./+types/_index";

const UUID_REGEX =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
		const draft = await db.getMailDraftById(draftId);
		if (!draft) return { deleted: false, error: "Draft not found" };
		if (draft.threadId) {
			const relations = await db.getEntityRelationships("mail_thread", draft.threadId);
			if (relations.length > 0) {
				return { deleted: false, error: "Cannot delete: this thread has linked relations. Remove links first." };
			}
		}
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
	const actionData = useActionData<{ sent?: boolean; error?: string }>();

	useEffect(() => {
		if (actionData?.error) {
			toast.error(actionData.error);
		}
	}, [actionData]);

	const compose = useMailDraftComposeState({
		initialDraft,
		originalMessage,
		initialComposeMode,
		committeeFromEmail,
		roles,
		recipientCandidates,
		relationships: relationships as Record<
			string,
			{ linked?: unknown[]; available?: unknown[]; canWrite?: boolean } | undefined
		>,
		threadRelationId,
		signatureRegards,
		ensureHtmlBody,
		htmlToText,
	});

	if (!committeeMailConfigured) {
		return (
			<div className="mx-auto max-w-2xl px-4 py-8">
				<p className="text-gray-600 dark:text-gray-400">
					{t("committee.mail.not_configured")}
				</p>
			</div>
		);
	}

	return (
		<MailDraftComposeProvider value={compose}>
			<Form id="mail-compose-form" method="post" className="flex flex-col gap-4">
			<input type="hidden" name="_action" value="send" />
			<input type="hidden" name="composeMode" value={compose.composeMode} />
			{compose.draftId && (
				<input type="hidden" name="draftId" value={compose.draftId} />
			)}
			<input type="hidden" name="relationAId" value={compose.relationAId} />
			{originalMessage &&
				(compose.composeMode === "reply" ||
					compose.composeMode === "replyAll") && (
					<input
						type="hidden"
						name="replyToMessageId"
						value={originalMessage.id}
					/>
				)}
			{originalMessage && compose.composeMode === "forward" && (
				<input
					type="hidden"
					name="forwardFromMessageId"
					value={originalMessage.id}
				/>
			)}
			{compose.toRecipients.map((r) => (
				<input key={r.id} type="hidden" name="to" value={r.email} />
			))}
			{compose.ccRecipients.map((r) => (
				<input key={r.id} type="hidden" name="cc" value={r.email} />
			))}
			{compose.bccRecipients.map((r) => (
				<input key={r.id} type="hidden" name="bcc" value={r.email} />
			))}
			<input type="hidden" name="body" value={compose.body} />
			<input
				type="hidden"
				name="attachments_json"
				value={JSON.stringify(compose.attachmentState)}
			/>
			{Object.entries(compose.getRelationshipFormData()).map(([key, value]) => (
				<input key={key} type="hidden" name={key} value={value} />
			))}

			<MailComposeHeader />

			<div className="grid gap-6 lg:grid-cols-3">
				<MailComposeMainFields />
				{compose.draftId && <MailComposeSidebar />}
			</div>
			<MailOriginalMessagePreview
				composeMode={compose.composeMode}
				originalMessage={originalMessage}
			/>
			</Form>
		</MailDraftComposeProvider>
	);
}
