import { getDatabase } from "~/db/server.server";
import type { RelationBadgeData } from "~/lib/relations-column.server";
import {
	getAuthenticatedUser,
	getGuestContext,
	requirePermission,
} from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import { deleteCalendarEvent, getCalendarUrl } from "~/lib/google.server";
import { loadRelationsMapForEntities } from "~/lib/relations-column.server";
import type { EventTableRow } from "~/components/events/events-table";
import type { EventsViewMode } from "./events-page";

interface DisplayEvent {
	id: string;
	type: "meeting" | "social" | "private";
	title: string;
	location: string;
	startDate: string;
	isAllDay: boolean;
	timezone: string | null;
}

interface GroupedMonth {
	monthKey: string;
	monthDate: string;
	events: DisplayEvent[];
}

export async function loadEventsPageData(
	request: Request,
	viewMode: EventsViewMode,
) {
	const authUser = await getAuthenticatedUser(request, getDatabase);

	let permissions: string[];
	let languages: { primary: string; secondary: string };

	if (authUser) {
		permissions = authUser.permissions;
		languages = {
			primary: authUser.primaryLanguage,
			secondary: authUser.secondaryLanguage,
		};
	} else {
		const guestContext = await getGuestContext(() => getDatabase());
		permissions = guestContext.permissions;
		languages = guestContext.languages;
	}

	const canRead = permissions.some((p) => p === "events:read" || p === "*");
	if (!canRead) {
		throw new Response("Not Found", { status: 404 });
	}

	const canWrite = permissions.some((p) => p === "events:write" || p === "*");
	if (viewMode === "all" && !canWrite) {
		throw new Response("Not Found", { status: 404 });
	}

	const url = new URL(request.url);
	const titleFilter = url.searchParams.get("title") || "";
	const db = getDatabase();

	const [events, calendarUrl] = await Promise.all([
		viewMode === "all" ? db.getEvents() : db.getUpcomingEvents(50),
		getCalendarUrl(),
	]);

	const allEvents: EventTableRow[] = events.map((event) => ({
		id: event.id,
		title: event.title,
		description: event.description,
		location: event.location,
		isAllDay: event.isAllDay,
		startDate: new Date(event.startDate),
		endDate: event.endDate ? new Date(event.endDate) : null,
		eventType: event.eventType,
		status: event.status,
		timezone: event.timezone,
	}));

	const filteredEvents = allEvents.filter((event) => {
		if (!canWrite && event.status === "draft") {
			return false;
		}
		if (
			viewMode !== "all" &&
			(event.status === "cancelled" || event.status === "completed")
		) {
			return false;
		}
		if (titleFilter) {
			return event.title.toLowerCase().includes(titleFilter.toLowerCase());
		}
		return true;
	});

	const eventIds = filteredEvents.map((event) => event.id);
	const relationsMap =
		eventIds.length > 0
			? await loadRelationsMapForEntities(
					db,
					"event",
					eventIds,
					undefined,
					permissions,
				)
			: new Map<string, RelationBadgeData[]>();

	if (viewMode === "all") {
		return {
			siteConfig: SITE_CONFIG,
			groupedMonths: [] as GroupedMonth[],
			allEvents: filteredEvents,
			calendarUrl,
			languages,
			filters: { title: titleFilter },
			hasFilters: !!titleFilter,
			canWrite,
			viewMode,
			relationsMap,
		};
	}

	const groupedMap = new Map<string, DisplayEvent[]>();

	for (const event of filteredEvents) {
		const year = event.startDate.getFullYear();
		const displayMonthKey = `${year}-${event.startDate.getMonth()}`;

		const displayEvent: DisplayEvent = {
			id: event.id,
			startDate: event.startDate.toISOString(),
			isAllDay: event.isAllDay,
			title: event.title,
			location: event.location || "",
			type: event.eventType,
			timezone: event.timezone,
		};

		if (!groupedMap.has(displayMonthKey)) {
			groupedMap.set(displayMonthKey, []);
		}
		groupedMap.get(displayMonthKey)?.push(displayEvent);
	}

	const groupedMonths: GroupedMonth[] = Array.from(groupedMap.entries()).map(
		([key, monthEvents]) => {
			const [y, m] = key.split("-").map(Number);
			const d = new Date(y, m, 1);

			return {
				monthKey: key,
				monthDate: d.toISOString(),
				events: monthEvents,
			};
		},
	);

	return {
		siteConfig: SITE_CONFIG,
		groupedMonths,
		allEvents: filteredEvents,
		calendarUrl,
		languages,
		filters: { title: titleFilter },
		hasFilters: !!titleFilter,
		canWrite,
		viewMode,
		relationsMap,
	};
}

export type EventsPageLoaderData = Awaited<
	ReturnType<typeof loadEventsPageData>
>;

export async function eventsPageAction(request: Request) {
	const formData = await request.formData();
	const actionType = formData.get("_action") as string;

	if (actionType === "delete") {
		await requirePermission(request, "events:delete", getDatabase);
		const eventId = formData.get("eventId") as string;

		if (!eventId) {
			return { error: "No event ID provided" };
		}

		try {
			const db = getDatabase();
			const event = await db.getEventById(eventId);

			if (event?.googleEventId) {
				await deleteCalendarEvent(event.googleEventId);
			}

			const deleted = await db.deleteEvent(eventId);
			if (!deleted) {
				return { error: "Failed to delete event" };
			}
			return { success: true, deleted: true };
		} catch (error) {
			console.error("[events.action] Delete error:", error);
			return {
				error:
					error instanceof Error ? error.message : "Failed to delete event",
			};
		}
	}

	return { error: "Unknown action" };
}
