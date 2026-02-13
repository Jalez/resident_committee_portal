import { useRouteLoaderData } from "react-router";
import { PageWrapper } from "~/components/layout/page-layout";
import { ViewForm } from "~/components/ui/view-form";
import { getDatabase } from "~/db/server.server";
import { getAuthenticatedUser } from "~/lib/auth.server";
import { getCalendarEvent } from "~/lib/google.server";
import { createViewLoader } from "~/lib/view-handlers.server";
import type { loader as rootLoader } from "~/root";

export function meta({ data }: { data: any }) {
	const summary = data?.event?.summary || "Event";
	return [
		{ title: `${data?.siteConfig?.name || "Portal"} - ${summary}` },
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({
	request,
	params,
}: {
	request: Request;
	params: { eventId: string };
}) {
	const authUser = await getAuthenticatedUser(request, getDatabase);
	return createViewLoader({
		entityType: "event",
		permission: "events:read",
		params,
		request,
		fetchEntity: async (db, id) => getCalendarEvent(id),
		extend: async () => ({
			currentUserId: authUser?.userId || null,
		}),
	});
}

export default function ViewEvent({ loaderData }: { loaderData: any }) {
	const { event, relationships } = loaderData;
	const rootData = useRouteLoaderData<typeof rootLoader>("root");

	const canUpdate = rootData?.user?.permissions?.some(
		(p) => p === "events:update" || p === "*",
	);

	const isAllDay = !event.start?.dateTime;
	const startDate = event.start?.dateTime
		? event.start.dateTime.split("T")[0]
		: event.start?.date;
	const startTime = event.start?.dateTime
		? event.start.dateTime.split("T")[1]?.substring(0, 5)
		: null;
	const endDate = event.end?.dateTime
		? event.end.dateTime.split("T")[0]
		: event.end?.date;
	const endTime = event.end?.dateTime
		? event.end.dateTime.split("T")[1]?.substring(0, 5)
		: null;

	const displayFields = {
		title: event.summary,
		description: { value: event.description, hide: !event.description },
		location: { value: event.location, hide: !event.location },
		startDate,
		startTime: { value: startTime, hide: isAllDay || !startTime },
		endDate,
		endTime: { value: endTime, hide: isAllDay || !endTime },
		isAllDay: { value: isAllDay, type: "checkbox" },
		attendees: {
			value: event.attendees?.map((a: any) => a.email).join(", "),
			hide: !event.attendees?.length,
		},
	};

	return (
		<PageWrapper>
			<ViewForm
				title={event.summary || "Event"}
				entityType="event"
				entityId={event.id}
				entityName={event.summary}
				displayFields={displayFields}
				relationships={relationships}
				returnUrl="/events"
				canEdit={canUpdate}
				canDelete={canUpdate}
				translationNamespace="events"
			/>
		</PageWrapper>
	);
}
