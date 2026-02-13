import { useRouteLoaderData } from "react-router";
import { PageWrapper } from "~/components/layout/page-layout";
import { ViewForm } from "~/components/ui/view-form";
import { getDatabase } from "~/db/server.server";
import { getAuthenticatedUser } from "~/lib/auth.server";
import { createViewLoader } from "~/lib/view-handlers.server";
import type { loader as rootLoader } from "~/root";

export function meta({ data }: { data: any }) {
	const name = data?.poll?.name || "Poll";
	return [
		{ title: `${data?.siteConfig?.name || "Portal"} - ${name}` },
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({
	request,
	params,
}: {
	request: Request;
	params: { pollId: string };
}) {
	const authUser = await getAuthenticatedUser(request, getDatabase);
	return createViewLoader({
		entityType: "poll",
		permission: "polls:read",
		params,
		request,
		fetchEntity: (db, id) => db.getPollById(id),
		extend: async () => ({
			currentUserId: authUser?.userId || null,
		}),
	});
}

export default function ViewPoll({ loaderData }: { loaderData: any }) {
	const { poll } = loaderData;
	const rootData = useRouteLoaderData<typeof rootLoader>("root");

	const canUpdate = rootData?.user?.permissions?.some(
		(p) => p === "polls:update" || p === "*",
	);

	const displayFields = {
		name: poll.name,
		description: { value: poll.description, hide: !poll.description },
		externalUrl: { value: poll.externalUrl, hide: !poll.externalUrl },
		status: poll.status,
		deadline: { value: poll.deadline, type: "date", hide: !poll.deadline },
	};

	return (
		<PageWrapper>
			<ViewForm
				title={poll.name || "Poll"}
				entityType="poll"
				entityId={poll.id}
				entityName={poll.name}
				displayFields={displayFields}
				returnUrl="/polls"
				canEdit={canUpdate}
				canDelete={canUpdate}
				translationNamespace="polls"
			/>
		</PageWrapper>
	);
}
