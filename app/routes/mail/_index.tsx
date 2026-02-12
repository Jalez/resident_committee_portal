import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Outlet, redirect, useActionData, useSearchParams } from "react-router";
import { toast } from "sonner";
import { PageWrapper } from "~/components/layout/page-layout";
import { getDatabase } from "~/db/server";
import { requirePermission } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import { isCommitteeMailConfigured } from "~/lib/mail-nodemailer.server";
import type { Route } from "./+types/_index";

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
		const backTo = direction === "sent" ? "/mail?direction=sent" : "/mail";
		return redirect(backTo);
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

const _navLinkClassName = ({ isActive }: { isActive: boolean }) =>
	`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
		isActive
			? "bg-primary/10 text-primary font-medium"
			: "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
	}`;

export default function MailLayout({ loaderData }: Route.ComponentProps) {
	const { t } = useTranslation();
	const [searchParams] = useSearchParams();
	const actionData = useActionData<{ error?: string }>();
	const committeeMailConfigured = loaderData?.committeeMailConfigured ?? false;

	useEffect(() => {
		if (actionData && "error" in actionData && actionData.error) {
			toast.error(actionData.error);
		}
	}, [actionData]);

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

	const _currentDirection = searchParams.get("direction") || "inbox";

	return (
		<PageWrapper>
			<div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-6 md:flex-row">
				{/* Sidebar */}

				{/* Main content */}
				<main className="min-w-0 flex-1">
					<Outlet />
				</main>
			</div>
		</PageWrapper>
	);
}
