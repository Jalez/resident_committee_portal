import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { z } from "zod";
import { PageWrapper } from "~/components/layout/page-layout";
import { EditForm, type InputFieldConfig } from "~/components/ui/edit-form";
import { Label } from "~/components/ui/label";
import { Switch } from "~/components/ui/switch";
import type { EventType } from "~/db/client";
import { createEditAction, createEditLoader } from "~/lib/edit-handlers.server";
import {
	type CalendarEventInput,
	updateCalendarEvent,
} from "~/lib/google.server";
import type { Route } from "./+types/_index";

/**
 * Parse a date string + time string in a given timezone to a UTC Date.
 * e.g. parseDateTimeWithTimezone("2026-02-25", "17:00", "Europe/Helsinki")
 * will correctly produce a Date representing 15:00 UTC (17:00 Helsinki = UTC+2)
 */
function parseDateTimeWithTimezone(dateStr: string, timeStr: string, timezone?: string): Date {
	if (!timezone) {
		return new Date(`${dateStr}T${timeStr}:00`);
	}
	// Create a date string that we know the timezone for
	// We use the timezone offset to calculate the correct UTC time
	const localDate = new Date(`${dateStr}T${timeStr}:00`);

	// Get what the offset is in the target timezone at this approximate time
	const formatter = new Intl.DateTimeFormat("en-US", {
		timeZone: timezone,
		year: "numeric", month: "2-digit", day: "2-digit",
		hour: "2-digit", minute: "2-digit", second: "2-digit",
		hour12: false,
	});

	// Find the offset: format a known UTC time in the target timezone
	// and compare to figure out the offset
	const utcDate = new Date(`${dateStr}T${timeStr}:00Z`);
	const parts = formatter.formatToParts(utcDate);
	const getPart = (type: string) => parts.find(p => p.type === type)?.value || "0";
	const tzHour = Number.parseInt(getPart("hour"));
	const tzMinute = Number.parseInt(getPart("minute"));

	// The difference between UTC and timezone-local tells us the offset
	const utcMinutes = utcDate.getUTCHours() * 60 + utcDate.getUTCMinutes();
	const tzMinutes = tzHour * 60 + tzMinute;
	let offsetMinutes = tzMinutes - utcMinutes;

	// Handle day boundary crossings
	if (offsetMinutes > 720) offsetMinutes -= 1440;
	if (offsetMinutes < -720) offsetMinutes += 1440;

	// Now construct the correct UTC date:
	// User entered time in their timezone, so subtract the offset to get UTC
	const result = new Date(`${dateStr}T${timeStr}:00Z`);
	result.setUTCMinutes(result.getUTCMinutes() - offsetMinutes);
	return result;
}

/**
 * Format a Date as YYYY-MM-DD in a specific timezone
 */
function formatDateInTimezone(date: Date, timezone: string): string {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: timezone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(date);
	const year = parts.find(p => p.type === "year")?.value;
	const month = parts.find(p => p.type === "month")?.value;
	const day = parts.find(p => p.type === "day")?.value;
	return `${year}-${month}-${day}`;
}

export function meta({ data }: Route.MetaArgs) {
	return [
		{
			title: `${(data as any)?.siteConfig?.name || "Portal"} - ${(data as any)?.event?.title || "Edit Event"}`,
		},
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request, params }: Route.LoaderArgs) {
	return createEditLoader({
		entityType: "event",
		permission: "events:update",
		params,
		request,
		fetchEntity: async (db, id) => db.getEventById(id),
	});
}

const eventSchema = z.object({
	title: z.string().min(1, "Title is required"),
	description: z.string().optional(),
	location: z.string().optional(),
	isAllDay: z.string().optional().transform((val) => val === "on"),
	startDate: z.string().min(1, "Start date is required"),
	startTime: z.string().optional(),
	endDate: z.string().optional(),
	endTime: z.string().optional(),
	attendees: z.string().optional(),
	timezone: z.string().optional(),
});

export async function action({ request, params }: Route.ActionArgs) {
	return createEditAction({
		entityType: "event",
		permission: "events:update",
		params,
		request,
		schema: eventSchema,
		fetchEntity: async (db, id) => db.getEventById(id),
		onUpdate: async ({ db, id, data, formData }) => {
			const {
				title,
				description,
				location,
				isAllDay,
				startDate,
				startTime,
				endDate,
				endTime,
				attendees: attendeesRaw,
				timezone,
			} = data;

			const attendees = attendeesRaw
				? attendeesRaw
					.split(/[,;\n]/)
					.map((e: string) => e.trim())
					.filter((e: string) => e.includes("@"))
				: undefined;

			const existingEvent = await db.getEventById(id);
			if (!existingEvent) throw new Error("Event not found");

			const startDateTime = isAllDay
				? new Date(startDate)
				: parseDateTimeWithTimezone(startDate, startTime || "09:00", timezone);

			const endDateTime = endDate
				? isAllDay
					? new Date(endDate)
					: parseDateTimeWithTimezone(endDate, endTime || "10:00", timezone)
				: null;

			const eventType: EventType =
				description?.includes("#meeting") ||
					title.toLowerCase().includes("kokous")
					? "meeting"
					: description?.includes("#private")
						? "private"
						: existingEvent.eventType;

			const eventTimezone = isAllDay ? null : (timezone || existingEvent.timezone);

			if (existingEvent.googleEventId) {
				try {
					const eventUpdate: Partial<CalendarEventInput> = {
						title,
						description,
						location,
						isAllDay,
						timeZone: eventTimezone || undefined,
					};

					if (isAllDay) {
						eventUpdate.startDate = startDate;
						const endDateObj = new Date(endDate || startDate);
						endDateObj.setDate(endDateObj.getDate() + 1);
						eventUpdate.endDate = endDateObj.toISOString().split("T")[0];
					} else {
						eventUpdate.startDateTime = `${startDate}T${startTime || "09:00"}:00`;
						eventUpdate.endDateTime = `${endDate || startDate}T${endTime || "10:00"}:00`;
					}

					if (attendees && attendees.length > 0) {
						eventUpdate.attendees = attendees;
					}

					await updateCalendarEvent(existingEvent.googleEventId, eventUpdate);
				} catch (googleError) {
					console.warn(
						"[events.edit] Google Calendar sync failed:",
						googleError,
					);
				}
			}

			const updatedEvent = await db.updateEvent(id, {
				title,
				description,
				location,
				isAllDay,
				startDate: startDateTime,
				endDate: endDateTime,
				timezone: eventTimezone,
				attendees: attendees ? JSON.stringify(attendees) : null,
				eventType,
			});

			if (!updatedEvent) throw new Error("Failed to update event");

			return updatedEvent;
		},
		successRedirect: (entity) => `/events`,
	});
}

export default function EventsEdit({ loaderData }: Route.ComponentProps) {
	const navigate = useNavigate();
	const { t } = useTranslation();
	const { event, relationships, sourceContext, returnUrl } = loaderData as any;

	const existingIsAllDay = event.isAllDay;
	const eventTimezone = event.timezone;
	const eventStartDate = new Date(event.startDate);
	const existingStartDate = eventTimezone
		? formatDateInTimezone(eventStartDate, eventTimezone)
		: eventStartDate.toISOString().split("T")[0];
	const existingStartTime = eventTimezone
		? eventStartDate.toLocaleTimeString("sv-SE", {
			timeZone: eventTimezone,
			hour: "2-digit",
			minute: "2-digit",
		})
		: eventStartDate.toLocaleTimeString("sv-SE", {
			hour: "2-digit",
			minute: "2-digit",
		});
	const eventEndDate = event.endDate ? new Date(event.endDate) : eventStartDate;
	const existingEndDate = eventTimezone
		? formatDateInTimezone(eventEndDate, eventTimezone)
		: eventEndDate.toISOString().split("T")[0];
	const existingEndTime = eventTimezone
		? eventEndDate.toLocaleTimeString("sv-SE", {
			timeZone: eventTimezone,
			hour: "2-digit",
			minute: "2-digit",
		})
		: eventEndDate.toLocaleTimeString("sv-SE", {
			hour: "2-digit",
			minute: "2-digit",
		});
	const existingAttendees = event.attendees
		? JSON.parse(event.attendees).join(", ")
		: "";

	const [isAllDay, setIsAllDay] = useState(existingIsAllDay);

	const userTimezone =
		typeof window !== "undefined"
			? Intl.DateTimeFormat().resolvedOptions().timeZone
			: eventTimezone || "UTC";

	const inputFields: Record<string, InputFieldConfig> = {
		title: {
			label: t("common.fields.title") + " *",
			value: event.title || "",
		},
		description: event.description || "",
		location: event.location || "",
		isAllDay: {
			value: isAllDay,
			render: (field, value, onChange) => (
				<div className="flex items-center space-x-2 mb-4">
					<input type="hidden" name="isAllDay" value={value ? "on" : "off"} />
					<Switch
						id="isAllDay"
						checked={!!value}
						onCheckedChange={(checked) => {
							onChange(checked);
							setIsAllDay(checked);
						}}
					/>
					<Label htmlFor="isAllDay">{t("common.fields.all_day")}</Label>
				</div>
			),
		},
		startDate: {
			label: t("common.fields.start_date") + " *",
			value: existingStartDate,
		},
		startTime: {
			label: t("common.fields.start_time"),
			value: existingStartTime,
			hidden: isAllDay,
		},
		endDate: {
			label: t("common.fields.end_date"),
			value: existingEndDate,
		},
		endTime: {
			label: t("common.fields.end_time"),
			value: existingEndTime,
			hidden: isAllDay,
		},
		attendees: {
			label: t("common.fields.attendees"),
			value: existingAttendees,
			description: t("events.form.attendees_help"),
		},
	};

	return (
		<PageWrapper>
			<EditForm
				title={t("events.edit.header")}
				action=""
				inputFields={inputFields}
				entityType="event"
				entityId={event.id}
				entityName={event.summary}
				returnUrl={returnUrl || "/events"}
				onCancel={() => navigate(returnUrl || "/events")}
				relationships={relationships}
				hiddenFields={{
					_sourceType: sourceContext?.type,
					_sourceId: sourceContext?.id,
					_returnUrl: returnUrl,
					timezone: isAllDay ? "" : (eventTimezone || userTimezone),
				}}
			/>
		</PageWrapper>
	);
}
