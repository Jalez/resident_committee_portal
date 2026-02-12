import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { PageWrapper } from "~/components/layout/page-layout";
import { Label } from "~/components/ui/label";
import { Switch } from "~/components/ui/switch";
import { EditForm, type InputFieldConfig } from "~/components/ui/edit-form";
import {
	type CalendarEventInput,
	getCalendarEvent,
	updateCalendarEvent,
} from "~/lib/google.server";
import { queryClient } from "~/lib/query-client";
import { queryKeys } from "~/lib/query-config";
import { createEditAction, createEditLoader } from "~/lib/edit-handlers.server";
import { z } from "zod";
import type { Route } from "./+types/_index";

export function meta({ data }: Route.MetaArgs) {
	return [
		{
			title: `${(data as any)?.siteConfig?.name || "Portal"} - ${(data as any)?.event?.summary || "Edit Event"}`,
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
		fetchEntity: async (db, id) => getCalendarEvent(id),
		relationshipTypes: ["minute", "news", "transaction"],
	});
}

const eventSchema = z.object({
	title: z.string().min(1, "Title is required"),
	description: z.string().optional(),
	location: z.string().optional(),
	isAllDay: z.coerce.boolean().optional(),
	startDate: z.string().min(1, "Start date is required"),
	startTime: z.string().optional(),
	endDate: z.string().optional(),
	endTime: z.string().optional(),
	attendees: z.string().optional(),
});

export async function action({ request, params }: Route.ActionArgs) {
	return createEditAction({
		entityType: "event",
		permission: "events:update",
		params,
		request,
		schema: eventSchema,
		fetchEntity: async (db, id) => getCalendarEvent(id),
		onUpdate: async ({ db, id, data, formData }) => {
			const { title, description, location, isAllDay, startDate, startTime, endDate, endTime, attendees: attendeesRaw } = data;

			const attendees = attendeesRaw
				? attendeesRaw
					.split(/[,;\n]/)
					.map((e: string) => e.trim())
					.filter((e: string) => e.includes("@"))
				: undefined;

			const eventUpdate: Partial<CalendarEventInput> = {
				title,
				description,
				location,
				isAllDay,
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

			const result = await updateCalendarEvent(id, eventUpdate);
			if (!result) throw new Error("Failed to update event");

			return result;
		},
		afterUpdate: async () => {
			await queryClient.invalidateQueries({ queryKey: queryKeys.calendar });
		},
		successRedirect: (entity) => `/events`,
	});
}

export default function EventsEdit({ loaderData }: Route.ComponentProps) {
	const navigate = useNavigate();
	const { t } = useTranslation();
	const { event, relationships, sourceContext, returnUrl } = loaderData as any;

	const existingIsAllDay = !event.start?.dateTime;
	const existingStartDate = event.start?.dateTime
		? event.start.dateTime.split("T")[0]
		: event.start?.date || new Date().toISOString().split("T")[0];
	const existingStartTime = event.start?.dateTime
		? event.start.dateTime.split("T")[1]?.substring(0, 5) || "09:00"
		: "09:00";
	const existingEndDate = event.end?.dateTime
		? event.end.dateTime.split("T")[0]
		: event.end?.date
			? (() => {
				const d = new Date(event.end.date);
				d.setDate(d.getDate() - 1);
				return d.toISOString().split("T")[0];
			})()
			: existingStartDate;
	const existingEndTime = event.end?.dateTime
		? event.end.dateTime.split("T")[1]?.substring(0, 5) || "10:00"
		: "10:00";
	const existingAttendees =
		event.attendees?.map((a: { email?: string }) => a.email).join(", ") || "";

	const [isAllDay, setIsAllDay] = useState(existingIsAllDay);

	const inputFields: Record<string, InputFieldConfig> = {
		title: {
			label: t("common.fields.title") + " *",
			value: event.summary || "",
		},
		description: event.description || "",
		location: event.location || "",
		isAllDay: {
			value: isAllDay,
			render: (field, value, onChange) => (
				<div className="flex items-center space-x-2 mb-4">
					<Switch
						name="isAllDay"
						id="isAllDay"
						checked={!!value}
						onCheckedChange={(checked) => {
							onChange(checked);
							setIsAllDay(checked);
						}}
					/>
					<Label htmlFor="isAllDay">{t("common.fields.all_day")}</Label>
				</div>
			)
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
		}
	};

	return (
		<PageWrapper>
			<div className="w-full max-w-2xl mx-auto px-4 pb-12">
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
					}}
				/>
			</div>
		</PageWrapper>
	);
}
