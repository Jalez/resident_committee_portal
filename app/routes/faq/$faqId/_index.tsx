import { useTranslation } from "react-i18next";
import { PageWrapper } from "~/components/layout/page-layout";
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
	const { faq: item, relationships, systemLanguages } = loaderData as any;
	const { t, i18n } = useTranslation();
	const { hasPermission } = useUser();
	const canUpdate = hasPermission("faq:update");
	const canDelete = hasPermission("faq:delete");

	const useSecondary =
		systemLanguages?.secondary && systemLanguages.secondary === i18n.language;

	const question =
		useSecondary && item.questionSecondary
			? item.questionSecondary
			: item.question;
	const answer =
		useSecondary && item.answerSecondary ? item.answerSecondary : item.answer;

	const displayFields = {
		question: { value: question },
		answer: {
			value: answer,
			type: "textarea" as const,
		},
		createdAt: item.createdAt,
	};

	return (
		<PageWrapper>
			<ViewForm
				title={question || "FAQ"}
				entityType="faq"
				entityId={item.id}
				entityName={question}
				displayFields={displayFields}
				relationships={relationships}
				returnUrl="/faq"
				canEdit={canUpdate}
				canDelete={canDelete}
				translationNamespace="faq"
			/>
		</PageWrapper>
	);
}
