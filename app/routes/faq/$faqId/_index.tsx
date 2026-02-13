import { useTranslation } from "react-i18next";
import { ViewForm } from "~/components/ui/view-form";
import { useUser } from "~/contexts/user-context";
import { getDatabase } from "~/db/server.server";
import { getAuthenticatedUser, getGuestContext } from "~/lib/auth.server";
import { getSystemLanguageDefaults } from "~/lib/settings.server";
import { createViewLoader } from "~/lib/view-handlers.server";
import type { Route } from "./+types/_index";

export function meta({ data }: Route.MetaArgs) {
	return [
		{
			title: `${(data as any)?.siteConfig?.name || "Portal"} - ${(data as any)?.faq?.question ?? "FAQ"}`,
		},
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request, params }: Route.LoaderArgs) {
	const authUser = await getAuthenticatedUser(request, getDatabase);
	let permissions: string[];
	if (authUser) {
		permissions = authUser.permissions;
	} else {
		const guestContext = await getGuestContext(() => getDatabase());
		permissions = guestContext.permissions;
	}
	const canRead = permissions.some((p) => p === "faq:read" || p === "*");
	if (!canRead) {
		throw new Response("Not Found", { status: 404 });
	}

	return createViewLoader({
		entityType: "faq",
		permission: "faq:read",
		params,
		request,
		fetchEntity: (db, id) => db.getFaqById(id),
		extend: async () => {
			const systemLanguages = await getSystemLanguageDefaults();
			return { systemLanguages };
		},
	});
}

export default function FaqView({ loaderData }: Route.ComponentProps) {
	const { faq: item, systemLanguages } = loaderData as any;
	const { t, i18n } = useTranslation();
	const { hasPermission } = useUser();
	const canUpdate = hasPermission("faq:update");

	const useSecondary =
		systemLanguages.secondary && systemLanguages.secondary === i18n.language;

	const question =
		useSecondary && item.questionSecondary
			? item.questionSecondary
			: item.question;
	const answer =
		useSecondary && item.answerSecondary ? item.answerSecondary : item.answer;

	const displayFields = {
		question: { value: question, valueClassName: "text-3xl font-bold" },
		answer: {
			value: answer,
			valueClassName:
				"prose dark:prose-invert max-w-none whitespace-pre-wrap text-lg leading-relaxed",
		},
		createdAt: item.createdAt,
	};

	return (
		<ViewForm
			title=""
			entityType="faq"
			entityId={item.id}
			displayFields={displayFields}
			variant="content"
			systemLanguages={systemLanguages}
			useSecondary={useSecondary}
			returnUrl="/faq"
			canEdit={canUpdate}
			translationNamespace="faq"
		/>
	);
}
