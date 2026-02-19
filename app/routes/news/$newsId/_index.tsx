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
			title: `${(data as any)?.siteConfig?.name || "Portal"} - ${(data as any)?.news?.title ?? "News"}`,
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
	const canRead = permissions.some((p) => p === "news:read" || p === "*");
	if (!canRead) {
		throw new Response("Not Found", { status: 404 });
	}

	return createViewLoader({
		entityType: "news",
		permission: "news:read",
		params,
		request,
		fetchEntity: (db, id) => db.getNewsById(id),
		extend: async () => {
			const systemLanguages = await getSystemLanguageDefaults();
			return { systemLanguages };
		},
	});
}

export default function NewsView({ loaderData }: Route.ComponentProps) {
	const { news: item, relationships, systemLanguages } = loaderData as any;
	const { t, i18n } = useTranslation();
	const { hasPermission } = useUser();
	const canUpdate = hasPermission("news:update");
	const canDelete = hasPermission("news:delete");

	const useSecondary =
		systemLanguages?.secondary && systemLanguages.secondary === i18n.language;

	const title =
		useSecondary && item.titleSecondary ? item.titleSecondary : item.title;
	const summary =
		useSecondary && item.summarySecondary
			? item.summarySecondary
			: item.summary;
	const content =
		useSecondary && item.contentSecondary
			? item.contentSecondary
			: item.content;

	const displayFields = {
		title: { value: title },
		summary: {
			value: summary,
			hide: !summary,
			type: "textarea" as const,
		},
		content: {
			value: content,
			type: "textarea" as const,
		},
		createdAt: item.createdAt,
	};

	return (
		<PageWrapper>
			<ViewForm
				title={title || "News"}
				entityType="news"
				entityId={item.id}
				entityName={title}
				displayFields={displayFields}
				relationships={relationships}
				returnUrl="/news"
				canEdit={canUpdate}
				canDelete={canDelete}
				translationNamespace="news"
			/>
		</PageWrapper>
	);
}
