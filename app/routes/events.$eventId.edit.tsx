import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Form, redirect, useNavigate, useNavigation } from "react-router";
import { toast } from "sonner";
import { PageWrapper } from "~/components/layout/page-layout";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { getDatabase } from "~/db";
import { requirePermission } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import {
	getCalendarEvent,
	updateCalendarEvent,
	type CalendarEventInput,
} from "~/lib/google.server";
import { queryClient } from "~/lib/query-client";
import { queryKeys } from "~/lib/query-config";
import type { Route } from "./+types/events.$eventId.edit";

export function meta({ data }: Route.MetaArgs) {
	return [
		{
			title: `${data?.siteConfig?.name || "Portal"} - ${data?.event?.summary || "Edit Event"}`,
		},
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request, params }: Route.LoaderArgs) {
	await requirePermission(request, "events:update", getDatabase);

	const eventId = params.eventId;
	if (!eventId) {
		throw new Response("Event ID required", { status: 400 });
	}

	const event = await getCalendarEvent(eventId);
	if (!event) {
		throw new Response("Event not found", { status: 404 });
	}

	return { siteConfig: SITE_CONFIG, event };
}

export async function action({ request, params }: Route.ActionArgs) {
	await requirePermission(request, "events:update", getDatabase);

	const eventId = params.eventId;
	if (!eventId) {
		return { error: "Event ID required" };
	}

	const formData = await request.formData();

	const title = formData.get("title") as string;
	const description = (formData.get("description") as string) || undefined;
	const location = (formData.get("location") as string) || undefined;
	const isAllDay = formData.get("isAllDay") === "on";
	const startDate = formData.get("startDate") as string;
	const startTime = formData.get("startTime") as string;
	const endDate = formData.get("endDate") as string;
	const endTime = formData.get("endTime") as string;

	// Attendees
	const attendeesRaw = formData.get("attendees") as string;
	const attendees = attendeesRaw
		? attendeesRaw
				.split(/[,;\n]/)
				.map((e) => e.trim())
				.filter((e) => e.includes("@"))
		: undefined;

	// Build the event update
	const eventUpdate: Partial<CalendarEventInput> = {
		title,
		description,
		location,
		isAllDay,
	};

	if (isAllDay) {
		eventUpdate.startDate = startDate;
		// For all-day events, Google Calendar expects end date to be exclusive (day after)
		const endDateObj = new Date(endDate || startDate);
		endDateObj.setDate(endDateObj.getDate() + 1);
		eventUpdate.endDate = endDateObj.toISOString().split("T")[0];
	} else {
		// Combine date and time for datetime events
		eventUpdate.startDateTime = `${startDate}T${startTime || "09:00"}:00`;
		eventUpdate.endDateTime = `${endDate || startDate}T${endTime || "10:00"}:00`;
	}

	// Add attendees if provided
	if (attendees && attendees.length > 0) {
		eventUpdate.attendees = attendees;
	}

	try {
		const result = await updateCalendarEvent(eventId, eventUpdate);

		if (!result) {
			return { error: "Failed to update event" };
		}

		// Force refresh: invalidate calendar query so next load fetches fresh events
		await queryClient.invalidateQueries({ queryKey: queryKeys.calendar });

		return redirect("/events?updated=true");
	} catch (error) {
		console.error("[events.edit] Error updating event:", error);
		return { error: error instanceof Error ? error.message : "Failed to update event" };
	}
}

export default function EventsEdit({ loaderData, actionData }: Route.ComponentProps) {
	const navigate = useNavigate();
	const navigation = useNavigation();
	const { t } = useTranslation();
	const { event } = loaderData as unknown as { event: NonNullable<Awaited<ReturnType<typeof getCalendarEvent>>> };
	const actionResult = actionData as { error?: string } | undefined;

	// Parse existing event data
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
			? // For all-day events, Google returns exclusive end date, so subtract a day
				(() => {
					const d = new Date(event.end.date);
					d.setDate(d.getDate() - 1);
					return d.toISOString().split("T")[0];
				})()
			: existingStartDate;
	const existingEndTime = event.end?.dateTime
		? event.end.dateTime.split("T")[1]?.substring(0, 5) || "10:00"
		: "10:00";
	const existingAttendees = event.attendees?.map((a: { email?: string }) => a.email).join(", ") || "";

	const [isAllDay, setIsAllDay] = useState(existingIsAllDay);
	const isSubmitting = navigation.state === "submitting";

	// Show error toast when action fails
	useEffect(() => {
		if (actionResult?.error) {
			toast.error(t("events.edit.error"), { id: "event-edit-error" });
		}
	}, [actionResult?.error, t]);

	return (
		<PageWrapper>
			<div className="w-full max-w-2xl mx-auto px-4">
				{/* Header */}
				<div className="flex items-center gap-4 mb-8">
					<Button
						variant="ghost"
						size="icon"
						onClick={() => navigate("/events")}
						className="h-10 w-10"
					>
						<span className="material-symbols-outlined">arrow_back</span>
					</Button>
					<div>
						<h1 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white">
							{t("events.edit.header")}
						</h1>
					</div>
				</div>

				{/* Error message */}
				{actionResult?.error && (
					<div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 mb-6 text-red-700 dark:text-red-400">
						{t("events.edit.error")}
					</div>
				)}

				{/* Form */}
				<Form method="post" className="space-y-6">
					{/* Basic Info */}
					<div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 space-y-6">
						<h2 className="text-lg font-bold text-gray-900 dark:text-white">
							{t("events.new.basic_info")}
						</h2>

						{/* Title */}
						<div className="space-y-2">
							<Label htmlFor="title">{t("events.form.title")} *</Label>
							<Input
								id="title"
								name="title"
								required
								defaultValue={event.summary || ""}
								placeholder={t("events.form.title_placeholder")}
							/>
						</div>

						{/* Description */}
						<div className="space-y-2">
							<Label htmlFor="description">{t("events.form.description")}</Label>
							<textarea
								id="description"
								name="description"
								rows={3}
								className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none"
								placeholder={t("events.form.description_placeholder")}
								defaultValue={event.description || ""}
							/>
						</div>

						{/* Location */}
						<div className="space-y-2">
							<Label htmlFor="location">{t("events.form.location")}</Label>
							<Input
								id="location"
								name="location"
								defaultValue={event.location || ""}
								placeholder={t("events.form.location_placeholder")}
							/>
						</div>
					</div>

					{/* Date & Time */}
					<div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 space-y-6">
						<h2 className="text-lg font-bold text-gray-900 dark:text-white">
							{t("events.new.date_time")}
						</h2>

						{/* All-day toggle */}
						<div className="flex items-center gap-3">
							<Checkbox
								id="isAllDay"
								name="isAllDay"
								checked={isAllDay}
								onCheckedChange={(checked) => setIsAllDay(checked === true)}
							/>
							<Label htmlFor="isAllDay">{t("events.form.all_day")}</Label>
						</div>

						{/* Start date/time */}
						<div className="grid grid-cols-2 gap-4">
							<div className="space-y-2">
								<Label htmlFor="startDate">{t("events.form.start_date")} *</Label>
								<Input
									id="startDate"
									name="startDate"
									type="date"
									required
									defaultValue={existingStartDate}
								/>
							</div>
							{!isAllDay && (
								<div className="space-y-2">
									<Label htmlFor="startTime">
										{t("events.form.start_time")}
									</Label>
									<Input
										id="startTime"
										name="startTime"
										type="time"
										defaultValue={existingStartTime}
									/>
								</div>
							)}
						</div>

						{/* End date/time */}
						<div className="grid grid-cols-2 gap-4">
							<div className="space-y-2">
								<Label htmlFor="endDate">{t("events.form.end_date")}</Label>
								<Input
									id="endDate"
									name="endDate"
									type="date"
									defaultValue={existingEndDate}
								/>
							</div>
							{!isAllDay && (
								<div className="space-y-2">
									<Label htmlFor="endTime">{t("events.form.end_time")}</Label>
									<Input
										id="endTime"
										name="endTime"
										type="time"
										defaultValue={existingEndTime}
									/>
								</div>
							)}
						</div>
					</div>

					{/* Attendees */}
					<div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 space-y-6">
						<h2 className="text-lg font-bold text-gray-900 dark:text-white">
							{t("events.new.attendees")}
						</h2>

						<div className="space-y-2">
							<Label htmlFor="attendees">{t("events.form.attendees")}</Label>
							<textarea
								id="attendees"
								name="attendees"
								rows={2}
								className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none"
								placeholder={t("events.form.attendees_placeholder")}
								defaultValue={existingAttendees}
							/>
							<p className="text-xs text-gray-500">
								{t("events.form.attendees_help")}
							</p>
						</div>
					</div>

					{/* Actions */}
					<div className="flex gap-4">
						<Button
							type="button"
							variant="outline"
							onClick={() => navigate("/events")}
							disabled={isSubmitting}
						>
							{t("settings.common.cancel")}
						</Button>
						<Button type="submit" disabled={isSubmitting}>
							{isSubmitting ? (
								<span className="flex items-center gap-2">
									<span className="animate-spin material-symbols-outlined text-sm">
										progress_activity
									</span>
									<span>{t("settings.common.saving")}</span>
								</span>
							) : (
								<>
									<span className="material-symbols-outlined mr-2">
										save
									</span>
									{t("events.edit.submit")}
								</>
							)}
						</Button>
					</div>
				</Form>
			</div>
		</PageWrapper>
	);
}
