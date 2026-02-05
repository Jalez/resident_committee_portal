import { useEffect } from "react";
import { Link, Outlet, redirect, useLocation, useNavigate, useSearchParams, useActionData } from "react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { PenSquare } from "lucide-react";
import { PageWrapper } from "~/components/layout/page-layout";
import { MailComposeForm } from "../components/mail-compose-form";
import { Button } from "~/components/ui/button";
import { Sheet, SheetContent } from "~/components/ui/sheet";
import { getDatabase, type MailDraft } from "~/db";
import { requirePermission } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import {
	isCommitteeMailConfigured,
	sendCommitteeEmail,
	type CommitteeMailRecipient,
} from "~/lib/mail-nodemailer.server";
import type { Route } from "./+types/mail";

type MailLoaderData = {
	siteConfig: typeof SITE_CONFIG;
	committeeMailConfigured: boolean;
	isImapConfigured: boolean;
	roles: { id: string; name: string }[];
	recipientCandidates: { id: string; name: string; email: string }[];
	draft: MailDraft | null;
};

const UUID_REGEX =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function meta({ data }: Route.MetaArgs) {
	return [
		{
			title: `${data?.siteConfig?.name || "Portal"} - Mail`,
		},
		{ name: "robots", content: "noindex" },
	];
}

/** Skip revalidating loaders after updateDraft fetcher – form state and lastSavedAt come from fetcher response. */
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

export async function loader({ request }: Route.LoaderArgs) {
	await requirePermission(request, "committee:email", getDatabase);
	const committeeMailConfigured = isCommitteeMailConfigured();

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
				recipientCandidates.push({ id: u.id, name: u.name, email: u.email });
			}
		}
	}

	let draft: MailDraft | null = null;
	const url = new URL(request.url);
	const composeParam = url.searchParams.get("compose");
	if (composeParam && UUID_REGEX.test(composeParam)) {
		draft = await db.getMailDraftById(composeParam);
	}

	return {
		siteConfig: SITE_CONFIG,
		committeeMailConfigured,
		isImapConfigured: !!(process.env.IMAP_HOST && process.env.IMAP_USER),
		roles: rolesExcludingGuest,
		recipientCandidates,
		draft,
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
			return { recipients: [] as { id: string; name: string; email: string }[], field };
		}
		const users = await db.getUsersByRoleId(roleId);
		return {
			recipients: users.map((u) => ({ id: u.id, name: u.name, email: u.email })),
			field,
		};
	}

	if (intent === "createDraft") {
		const draft = await db.insertMailDraft({
			toJson: "[]",
			ccJson: null,
			bccJson: null,
			subject: null,
			body: null,
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
		return updated ? { draft: updated, updatedAt: updated.updatedAt } : { error: "Draft not found" };
	}

	if (intent === "send") {
		const subject = (formData.get("subject") as string)?.trim();
		const body = (formData.get("body") as string)?.trim();
		const toEmails = (formData.getAll("to") as string[]).filter(Boolean);
		const ccEmails = (formData.getAll("cc") as string[]).filter(Boolean);
		const bccEmails = (formData.getAll("bcc") as string[]).filter(Boolean);
		const draftId = (formData.get("draftId") as string) || null;

		if (!subject || !body) {
			return { sent: false, error: "Missing subject or body" };
		}
		if (toEmails.length === 0) {
			return { sent: false, error: "Add at least one To recipient" };
		}

		const to: CommitteeMailRecipient[] = toEmails.map((email) => ({ email }));
		const cc: CommitteeMailRecipient[] | undefined = ccEmails.length
			? ccEmails.map((email) => ({ email }))
			: undefined;
		const bcc: CommitteeMailRecipient[] | undefined = bccEmails.length
			? bccEmails.map((email) => ({ email }))
			: undefined;

		const html = body.replace(/\n/g, "<br>\n");
		const result = await sendCommitteeEmail({ to, cc, bcc, subject, html });

		if (!result.success) {
			return { sent: false, error: result.error, successCount: 0 };
		}

		if (draftId) {
			await db.deleteMailDraft(draftId);
		}

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
			messageId: null,
		});

		return redirect(`/mail/${inserted.id}`);
	}

	if (intent === "deleteDraft") {
		const draftId = formData.get("draftId") as string;
		if (!draftId) return { deleted: false, error: "Missing draftId" };
		const ok = await db.deleteMailDraft(draftId);
		if (!ok) return { deleted: false, error: "Draft not found" };
		return redirect("/mail/drafts");
	}

	if (intent === "deleteMessage") {
		const messageId = formData.get("messageId") as string;
		if (!messageId) return { deleted: false, error: "Missing messageId" };
		const ok = await db.deleteCommitteeMailMessage(messageId);
		if (!ok) return { deleted: false, error: "Message not found" };
		const direction = formData.get("direction") as string;
		const backTo = direction === "sent" ? "/mail?direction=sent" : "/mail";
		return redirect(backTo);
	}

	return { sent: false, error: "Unknown action" };
}

export default function MailLayout(props: Route.ComponentProps) {
	const { t } = useTranslation();
	const location = useLocation();
	const pathname = location.pathname;
	const [searchParams] = useSearchParams();
	const navigate = useNavigate();
	const direction = searchParams.get("direction") || "inbox";
	const composeParam = searchParams.get("compose");

	const isInbox = pathname === "/mail" && direction !== "sent" && !composeParam;
	const isSent = pathname === "/mail" && direction === "sent";
	const isDrafts = pathname === "/mail/drafts";
	const isCompose = pathname === "/mail" && !!composeParam;
	const actionData = useActionData<{ sent?: boolean; error?: string }>();

	useEffect(() => {
		if (actionData && "sent" in actionData && !actionData.sent && actionData.error) {
			toast.error(actionData.error);
		}
	}, [actionData]);

	const handleCloseCompose = () => {
		navigate("/mail", { replace: true });
	};

	const loaderData = props.loaderData as MailLoaderData | undefined;
	const committeeMailConfigured = loaderData?.committeeMailConfigured ?? false;
	const roles = loaderData?.roles ?? [];
	const recipientCandidates = loaderData?.recipientCandidates ?? [];
	const draft = loaderData?.draft ?? null;

	if (!committeeMailConfigured) {
		return (
			<PageWrapper>
				<div className="mx-auto max-w-2xl px-4 py-8">
					<h1 className="text-2xl font-bold text-gray-900 dark:text-white">
						{t("committee.mail.title")}
					</h1>
					<p className="mt-4 text-gray-600 dark:text-gray-400">
						{t("committee.mail.not_configured")}
					</p>
				</div>
			</PageWrapper>
		);
	}

	return (
		<PageWrapper>
			<div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-6">
				{/* Toolbar: Inbox, Sent, Drafts, Compose (sub-route style) + New message button */}
				<div className="flex flex-wrap items-center gap-2 shrink-0">
					<Button asChild variant={isInbox ? "default" : "secondary"} size="sm" className="gap-1.5">
						<Link to="/mail">
							<span className="material-symbols-outlined text-lg">inbox</span>
							{t("mail.inbox")}
						</Link>
					</Button>
					<Button asChild variant={isSent ? "default" : "secondary"} size="sm" className="gap-1.5">
						<Link to="/mail?direction=sent">
							<span className="material-symbols-outlined text-lg">send</span>
							{t("mail.sent")}
						</Link>
					</Button>
					<Button asChild variant={isDrafts ? "default" : "secondary"} size="sm" className="gap-1.5">
						<Link to="/mail/drafts">
							<span className="material-symbols-outlined text-lg">draft</span>
							{t("mail.drafts")}
						</Link>
					</Button>
					<Button asChild variant={isCompose ? "default" : "secondary"} size="sm" className="gap-1.5">
						<Link to="/mail?compose=new">
							<span className="material-symbols-outlined text-lg">edit_note</span>
							{t("mail.compose")}
						</Link>
					</Button>
					<Button asChild variant="default" size="sm" className="gap-1.5 ml-auto">
						<Link to="/mail?compose=new">
							<PenSquare className="size-4" />
							{t("mail.compose")}
						</Link>
					</Button>
				</div>
				<main className="min-w-0 flex-1">
					<Outlet />
				</main>
			</div>

			{/* Compose drawer */}
			{composeParam && (
				<Sheet open={!!composeParam} onOpenChange={(open) => !open && handleCloseCompose()}>
					<SheetContent side="bottom" className="flex flex-col gap-0 overflow-hidden" showClose={false}>
						<MailComposeForm
							composeParam={composeParam}
							draft={draft ?? undefined}
							onClose={handleCloseCompose}
							roles={roles}
							recipientCandidates={recipientCandidates}
						/>
					</SheetContent>
				</Sheet>
			)}
		</PageWrapper>
	);
}
