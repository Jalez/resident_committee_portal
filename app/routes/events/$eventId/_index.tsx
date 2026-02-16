import { useRouteLoaderData } from "react-router";
import { PageWrapper } from "~/components/layout/page-layout";
import { ViewForm } from "~/components/ui/view-form";
import { getDatabase } from "~/db/server.server";
import { getAuthenticatedUser } from "~/lib/auth.server";
import { createViewLoader } from "~/lib/view-handlers.server";
import type { loader as rootLoader } from "~/root";

export function meta({ data }: { data: any }) {
	const title = data?.event?.title || "Event";
	return [
		{ title: `${data?.siteConfig?.name || "Portal"} - ${title}` },
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
		fetchEntity: async (db, id) => db.getEventById(id),
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

	const isAllDay = event.isAllDay;
	const eventTimezone = event.timezone;
	const eventStartDate = new Date(event.startDate);
	const startDate = eventStartDate.toISOString().split("T")[0];
	const startTime = isAllDay
		? null
		: eventTimezone
			? eventStartDate.toLocaleTimeString("sv-SE", {
					timeZone: eventTimezone,
					hour: "2-digit",
					minute: "2-digit",
				})
			: eventStartDate.toTimeString().substring(0, 5);
	const eventEndDate = event.endDate ? new Date(event.endDate) : null;
	const endDate = eventEndDate?.toISOString().split("T")[0];
	const endTime =
		isAllDay || !eventEndDate
			? null
			: eventTimezone
				? eventEndDate.toLocaleTimeString("sv-SE", {
						timeZone: eventTimezone,
						hour: "2-digit",
						minute: "2-digit",
					})
				: eventEndDate.toTimeString().substring(0, 5);

	const attendees = event.attendees ? JSON.parse(event.attendees) : [];

	const displayFields = {
		title: event.title,
		description: { value: event.description, hide: !event.description },
		location: { value: event.location, hide: !event.location },
		startDate,
		startTime: { value: startTime, hide: isAllDay || !startTime },
		endDate,
		endTime: { value: endTime, hide: isAllDay || !endTime },
		isAllDay: { value: isAllDay, type: "checkbox" },
		attendees: {
			value: attendees.join(", "),
			hide: attendees.length === 0,
		},
	};

	return (
		<PageWrapper>
			<ViewForm
				title={event.title || "Event"}
				entityType="event"
				entityId={event.id}
				entityName={event.title}
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
