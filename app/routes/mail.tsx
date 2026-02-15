import { Plus } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link, Outlet, useActionData, useLocation } from "react-router";
import { toast } from "sonner";
import { PageWrapper } from "~/components/layout/page-layout";
import { Button } from "~/components/ui/button";
import { getDatabase } from "~/db/server.server";
import { requirePermission } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import { isCommitteeMailConfigured } from "~/lib/mail-nodemailer.server";
import type { Route } from "./+types/mail";

export function meta({ data }: Route.MetaArgs) {
	return [
		{
			title: `${data?.siteConfig?.name || "Portal"} - Mail`,
		},
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request }: Route.LoaderArgs) {
	await requirePermission(request, "committee:email", getDatabase);
	const committeeMailConfigured = isCommitteeMailConfigured();

	return {
		siteConfig: SITE_CONFIG,
		committeeMailConfigured,
		isImapConfigured: !!(process.env.IMAP_HOST && process.env.IMAP_USER),
	};
}

export async function action({ request }: Route.ActionArgs) {
	await requirePermission(request, "committee:email", getDatabase);

	const formData = await request.formData();
	const intent = formData.get("_action") as string;
	const db = getDatabase();

	if (intent === "deleteMessage") {
		const messageId = formData.get("messageId") as string;
		if (!messageId) return { deleted: false, error: "Missing messageId" };
		const ok = await db.deleteCommitteeMailMessage(messageId);
		if (!ok) return { deleted: false, error: "Message not found" };
		const direction = formData.get("direction") as string;
		const backTo =
			direction === "sent" ? "/mail/inbox?direction=sent" : "/mail/inbox";
		return { deleted: true, redirect: backTo };
	}

	if (intent === "deleteDraft") {
		const draftId = formData.get("draftId") as string;
		if (!draftId) return { deleted: false, error: "Missing draftId" };
		const ok = await db.deleteMailDraft(draftId);
		if (!ok) return { deleted: false, error: "Draft not found" };
		return { deleted: true, redirect: "/mail/drafts" };
	}

	return { error: "Unknown action" };
}

const navLinkClassName = ({ isActive }: { isActive: boolean }) =>
	`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
		isActive
			? "bg-primary/10 text-primary font-medium"
			: "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
	}`;

export default function MailLayout({ loaderData }: Route.ComponentProps) {
	const { t } = useTranslation();
	const location = useLocation();
	const actionData = useActionData<{
		error?: string;
		deleted?: boolean;
		redirect?: string;
	}>();
	const committeeMailConfigured = loaderData?.committeeMailConfigured ?? false;

	useEffect(() => {
		if (actionData && "error" in actionData && actionData.error) {
			toast.error(actionData.error);
		}
		if (actionData?.deleted) {
			toast.success(t("mail.delete_success"));
		}
	}, [actionData, t]);

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

	const currentDirection =
		new URLSearchParams(location.search).get("direction") || "inbox";

	return (
		<PageWrapper>
			<div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-6 md:flex-row">
				<aside className="w-full shrink-0 md:w-48">
					<nav className="flex flex-row gap-1 overflow-x-auto md:flex-col md:gap-0.5">
						<Link
							to="/mail/inbox"
							className={navLinkClassName({
								isActive:
									location.pathname === "/mail/inbox" &&
									currentDirection === "inbox",
							})}
						>
							<span className="material-symbols-outlined size-5 text-base">
								inbox
							</span>
							{t("mail.inbox")}
						</Link>
						<Link
							to="/mail/inbox?direction=sent"
							className={navLinkClassName({
								isActive: currentDirection === "sent",
							})}
						>
							<span className="material-symbols-outlined size-5 text-base">
								send
							</span>
							{t("mail.sent")}
						</Link>
						<Link
							to="/mail/drafts"
							className={navLinkClassName({
								isActive: location.pathname.startsWith("/mail/drafts"),
							})}
						>
							<span className="material-symbols-outlined size-5 text-base">
								draft
							</span>
							{t("mail.drafts")}
						</Link>
						<div className="mt-2 hidden md:block">
							<Button variant="outline" size="sm" asChild className="w-full">
								<Link to="/mail/compose">
									<Plus className="mr-1 size-4" />
									{t("mail.compose")}
								</Link>
							</Button>
						</div>
					</nav>
				</aside>

				<main className="min-w-0 flex-1">
					<Outlet />
				</main>
			</div>
		</PageWrapper>
	);
}
