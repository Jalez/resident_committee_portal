import { useTranslation } from "react-i18next";
import { useRouteLoaderData } from "react-router";
import { PageWrapper } from "~/components/layout/page-layout";
import { ViewForm } from "~/components/ui/view-form";
import { getDatabase } from "~/db/server.server";
import { getAuthenticatedUser } from "~/lib/auth.server";
import { createViewLoader } from "~/lib/view-handlers.server";
import type { loader as rootLoader } from "~/root";
import type { Route } from "./+types/_index";

export function meta({ data }: Route.MetaArgs) {
	const title = (data as any)?.minute?.title || "Minute";
	return [
		{
			title: `${(data as any)?.siteConfig?.name || "Portal"} - ${title}`,
		},
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request, params }: Route.LoaderArgs) {
	const authUser = await getAuthenticatedUser(request, getDatabase);
	return createViewLoader({
		entityType: "minute",
		permission: "minutes:read",
		params,
		request,
		fetchEntity: (db, id) => db.getMinuteById(id),
		extend: async () => ({
			currentUserId: authUser?.userId || null,
		}),
	});
}

export default function MinuteView({ loaderData }: Route.ComponentProps) {
	const { minute, relationships } = loaderData as any;
	const { t } = useTranslation();
	const rootData = useRouteLoaderData<typeof rootLoader>("root");

	const canUpdate = rootData?.user?.permissions?.some(
		(p) => p === "minutes:update" || p === "*",
	);

	const displayFields = {
		title: { value: minute.title || "—", valueClassName: "font-semibold" },
		date: minute.date,
		description: { value: minute.description, hide: !minute.description },
		fileUrl: {
			value: minute.fileUrl,
			type: "url",
			hide: !minute.fileUrl,
		},
	};

	return (
		<PageWrapper>
			<ViewForm
				title={t("minutes.view.title", "View Minute")}
				entityType="minute"
				entityId={minute.id}
				entityName={minute.title || ""}
				displayFields={displayFields}
				relationships={relationships}
				returnUrl="/minutes"
				canEdit={canUpdate}
				canDelete={canUpdate}
				translationNamespace="minutes"
			/>
		</PageWrapper>
	);
}
