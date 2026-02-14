import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Form, redirect, useNavigate, useNavigation } from "react-router";
import { toast } from "sonner";
import { PageWrapper } from "~/components/layout/page-layout";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import type { EventType } from "~/db/client";
import { getDatabase } from "~/db/server.server";
import { requirePermission } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import {
	type CalendarEventInput,
	createCalendarEvent,
} from "~/lib/google.server";
import type { Route } from "./+types/_index";

export function meta({ data }: Route.MetaArgs) {
	return [
		{
			title: `${data?.siteConfig?.name || "Portal"} - Uusi tapahtuma / New Event`,
		},
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request }: Route.LoaderArgs) {
	await requirePermission(request, "events:write", getDatabase);
	return { siteConfig: SITE_CONFIG };
}

export async function action({ request }: Route.ActionArgs) {
	await requirePermission(request, "events:write", getDatabase);

	const formData = await request.formData();

	const title = formData.get("title") as string;
	const description = (formData.get("description") as string) || undefined;
	const location = (formData.get("location") as string) || undefined;
	const isAllDay = formData.get("isAllDay") === "on";
	const startDate = formData.get("startDate") as string;
	const startTime = formData.get("startTime") as string;
	const endDate = formData.get("endDate") as string;
	const endTime = formData.get("endTime") as string;

	// Recurrence options
	const hasRecurrence = formData.get("hasRecurrence") === "on";
	const recurrenceFrequency = formData.get("recurrenceFrequency") as string;
	const recurrenceInterval = parseInt(
		formData.get("recurrenceInterval") as string,
		10,
	);
	const recurrenceEndType = formData.get("recurrenceEndType") as string;
	const recurrenceCount = parseInt(
		formData.get("recurrenceCount") as string,
		10,
	);
	const recurrenceUntil = formData.get("recurrenceUntil") as string;

	// Reminders
	const reminderTypes = formData.getAll("reminderType") as string[];
	const reminderMinutes = formData.getAll("reminderMinutes") as string[];

	// Attendees
	const attendeesRaw = formData.get("attendees") as string;
	const attendees = attendeesRaw
		? attendeesRaw
				.split(/[,;\n]/)
				.map((e) => e.trim())
				.filter((e) => e.includes("@"))
		: undefined;

	// Build the event input
	const eventInput: CalendarEventInput = {
		title,
		description,
		location,
		isAllDay,
		startDateTime: "",
		endDateTime: "",
	};

	if (isAllDay) {
		eventInput.startDate = startDate;
		// For all-day events, Google Calendar expects end date to be exclusive (day after)
		const endDateObj = new Date(endDate || startDate);
		endDateObj.setDate(endDateObj.getDate() + 1);
		eventInput.endDate = endDateObj.toISOString().split("T")[0];
	} else {
		// Combine date and time for datetime events
		eventInput.startDateTime = `${startDate}T${startTime || "09:00"}:00`;
		eventInput.endDateTime = `${endDate || startDate}T${endTime || "10:00"}:00`;
	}

	// Add recurrence if enabled
	if (hasRecurrence && recurrenceFrequency) {
		eventInput.recurrence = {
			frequency: recurrenceFrequency as
				| "DAILY"
				| "WEEKLY"
				| "MONTHLY"
				| "YEARLY",
			interval: recurrenceInterval > 1 ? recurrenceInterval : undefined,
		};

		if (recurrenceEndType === "count" && recurrenceCount > 0) {
			eventInput.recurrence.count = recurrenceCount;
		} else if (recurrenceEndType === "until" && recurrenceUntil) {
			eventInput.recurrence.until = recurrenceUntil;
		}
	}

	// Add reminders
	if (reminderTypes.length > 0) {
		eventInput.reminders = reminderTypes
			.map((type, index) => ({
				method: type as "email" | "popup",
				minutes: parseInt(reminderMinutes[index], 10) || 30,
			}))
			.filter((r) => r.minutes > 0);
	}

	// Add attendees
	if (attendees && attendees.length > 0) {
		eventInput.attendees = attendees;
	}

	try {
		const db = getDatabase();

		let googleEventId: string | null = null;
		try {
			const result = await createCalendarEvent(eventInput);
			if (result?.id) {
				googleEventId = result.id;
			}
		} catch (googleError) {
			console.warn(
				"[events.new] Google Calendar sync failed, saving to DB only:",
				googleError,
			);
		}

		const eventType: EventType =
			description?.includes("#meeting") ||
			title.toLowerCase().includes("kokous")
				? "meeting"
				: description?.includes("#private")
					? "private"
					: "social";

		const startDateTime = isAllDay
			? new Date(startDate)
			: new Date(`${startDate}T${startTime || "09:00"}:00`);

		const endDateTime = endDate
			? isAllDay
				? new Date(endDate)
				: new Date(`${endDate}T${endTime || "10:00"}:00`)
			: null;

		await db.createEvent({
			title,
			description,
			location,
			isAllDay,
			startDate: startDateTime,
			endDate: endDateTime,
			recurrence: hasRecurrence ? JSON.stringify(eventInput.recurrence) : null,
			reminders: eventInput.reminders
				? JSON.stringify(eventInput.reminders)
				: null,
			attendees: attendees ? JSON.stringify(attendees) : null,
			eventType,
			status: "active",
			googleEventId,
		});

		return redirect("/events?created=true");
	} catch (error) {
		console.error("[events.new] Error creating event:", error);
		return {
			error: error instanceof Error ? error.message : "Failed to create event",
		};
	}
}

// Reminder presets for quick selection
const REMINDER_PRESETS = [
	{ minutes: 10, labelKey: "10min" },
	{ minutes: 30, labelKey: "30min" },
	{ minutes: 60, labelKey: "1hour" },
	{ minutes: 1440, labelKey: "1day" },
	{ minutes: 10080, labelKey: "1week" },
];

export default function EventsNew({ actionData }: Route.ComponentProps) {
	const navigate = useNavigate();
	const navigation = useNavigation();
	const { t } = useTranslation();
	const [isAllDay, setIsAllDay] = useState(false);
	const [hasRecurrence, setHasRecurrence] = useState(false);
	const [reminders, setReminders] = useState<
		{ method: "email" | "popup"; minutes: number }[]
	>([]);

	const isSubmitting = navigation.state === "submitting";

	// Show error toast when action fails
	useEffect(() => {
		if (actionData?.error) {
			toast.error(t("events.new.error"), { id: "event-create-error" });
		}
	}, [actionData?.error, t]);

	// Get today's date for default values
	const today = new Date().toISOString().split("T")[0];

	const addReminder = () => {
		setReminders([...reminders, { method: "popup", minutes: 30 }]);
	};

	const removeReminder = (index: number) => {
		setReminders(reminders.filter((_, i) => i !== index));
	};

	const updateReminder = (
		index: number,
		field: "method" | "minutes",
		value: string | number,
	) => {
		const updated = [...reminders];
		if (field === "method") {
			updated[index].method = value as "email" | "popup";
		} else {
			updated[index].minutes = value as number;
		}
		setReminders(updated);
	};

	return (
		<PageWrapper>
			<div className="w-full max-w-2xl mx-auto px-4">
				{/* Header */}
				<div className="mb-8">
					<h1 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white">
						{t("events.new.header")}
					</h1>
				</div>

				{/* Error message */}
				{actionData?.error && (
					<div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 mb-6 text-red-700 dark:text-red-400">
						{t("events.new.error")}
					</div>
				)}

				{/* Form */}
				<Form method="post" className="space-y-6">
					{/* Basic Info */}
					<div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 space-y-6">
						<h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
							{t("common.sections.basic_info")}
						</h2>

						{/* Title */}
						<div className="space-y-2">
							<Label htmlFor="title">{t("common.fields.title")} *</Label>
							<Input
								id="title"
								name="title"
								required
								placeholder={t("common.placeholders.title")}
							/>
						</div>

						{/* Description */}
						<div className="space-y-2">
							<Label htmlFor="description">
								{t("common.fields.description")}
							</Label>
							<textarea
								id="description"
								name="description"
								rows={4}
								className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none"
								placeholder={t("common.placeholders.description")}
							/>
						</div>

						{/* Location */}
						<div className="space-y-2">
							<Label htmlFor="location">{t("common.fields.location")}</Label>
							<Input
								id="location"
								name="location"
								placeholder={t("common.placeholders.location")}
							/>
						</div>
					</div>

					{/* Date & Time */}
					<div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 space-y-6">
						<h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
							{t("common.sections.date_time")}
						</h2>

						{/* All-day toggle */}
						<div className="flex items-center space-x-2">
							<Checkbox
								id="isAllDay"
								name="isAllDay"
								checked={isAllDay}
								onCheckedChange={(checked: boolean) => setIsAllDay(checked)}
							/>
							<Label htmlFor="isAllDay">{t("common.fields.all_day")}</Label>
						</div>

						{/* Start date/time */}
						<div className="grid grid-cols-2 gap-4">
							<div className="space-y-2">
								<Label htmlFor="startDate">
									{t("common.fields.start_date")} *
								</Label>
								<Input
									id="startDate"
									name="startDate"
									type="date"
									required
									defaultValue={today}
								/>
							</div>
							{!isAllDay && (
								<div className="space-y-2">
									<Label
										htmlFor="startTime"
										className="text-gray-900 dark:text-gray-100"
									>
										{t("common.fields.start_time")}
									</Label>
									<Input
										id="startTime"
										name="startTime"
										type="time"
										defaultValue="09:00"
									/>
								</div>
							)}
						</div>

						{/* End date/time */}
						<div className="grid grid-cols-2 gap-4">
							<div className="space-y-2">
								<Label htmlFor="endDate">{t("common.fields.end_date")}</Label>
								<Input
									id="endDate"
									name="endDate"
									type="date"
									defaultValue={today}
								/>
							</div>
							{!isAllDay && (
								<div className="space-y-2">
									<Label htmlFor="endTime">{t("common.fields.end_time")}</Label>
									<Input
										id="endTime"
										name="endTime"
										type="time"
										defaultValue="10:00"
									/>
								</div>
							)}
						</div>
					</div>

					{/* Recurrence */}
					<div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 space-y-6">
						<div className="flex items-center justify-between">
							<h2 className="text-lg font-bold text-gray-900 dark:text-white">
								{t("events.new.recurrence")}
							</h2>
							<Checkbox
								id="hasRecurrence"
								name="hasRecurrence"
								checked={hasRecurrence}
								onCheckedChange={(checked) =>
									setHasRecurrence(checked === true)
								}
							/>
						</div>

						{hasRecurrence && (
							<div className="space-y-4">
								{/* Frequency */}
								<div className="grid grid-cols-2 gap-4">
									<div className="space-y-2">
										<Label htmlFor="recurrenceFrequency">
											{t("events.form.frequency")}
										</Label>
										<select
											id="recurrenceFrequency"
											name="recurrenceFrequency"
											className="w-full h-10 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
										>
											<option value="DAILY">
												{t("events.frequency.daily")}
											</option>
											<option value="WEEKLY">
												{t("events.frequency.weekly")}
											</option>
											<option value="MONTHLY">
												{t("events.frequency.monthly")}
											</option>
											<option value="YEARLY">
												{t("events.frequency.yearly")}
											</option>
										</select>
									</div>
									<div className="space-y-2">
										<Label htmlFor="recurrenceInterval">
											{t("events.form.interval")}
										</Label>
										<Input
											id="recurrenceInterval"
											name="recurrenceInterval"
											type="number"
											min="1"
											defaultValue="1"
										/>
									</div>
								</div>

								{/* End condition */}
								<div className="space-y-2">
									<Label>{t("events.form.recurrence_end")}</Label>
									<div className="flex flex-col gap-3">
										<div className="flex items-center gap-2">
											<input
												type="radio"
												id="endNever"
												name="recurrenceEndType"
												value="never"
												defaultChecked
											/>
											<Label htmlFor="endNever" className="font-normal">
												{t("events.form.end_never")}
											</Label>
										</div>
										<div className="flex items-center gap-2">
											<input
												type="radio"
												id="endCount"
												name="recurrenceEndType"
												value="count"
											/>
											<Label htmlFor="endCount" className="font-normal">
												{t("events.form.end_after")}
											</Label>
											<Input
												name="recurrenceCount"
												type="number"
												min="1"
												defaultValue="10"
												className="w-20 h-8"
											/>
											<span className="text-sm text-gray-500">
												{t("events.form.occurrences")}
											</span>
										</div>
										<div className="flex items-center gap-2">
											<input
												type="radio"
												id="endUntil"
												name="recurrenceEndType"
												value="until"
											/>
											<Label htmlFor="endUntil" className="font-normal">
												{t("events.form.end_on")}
											</Label>
											<Input
												name="recurrenceUntil"
												type="date"
												className="w-40 h-8"
											/>
										</div>
									</div>
								</div>
							</div>
						)}
					</div>

					{/* Reminders */}
					<div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 space-y-6">
						<div className="flex items-center justify-between">
							<h2 className="text-lg font-bold text-gray-900 dark:text-white">
								{t("events.new.reminders")}
							</h2>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={addReminder}
							>
								<span className="material-symbols-outlined text-lg mr-1">
									add
								</span>
								{t("events.form.add_reminder")}
							</Button>
						</div>

						{reminders.length === 0 && (
							<p className="text-sm text-gray-500">
								{t("events.form.no_reminders")}
							</p>
						)}

						{reminders.map((reminder, index) => (
							<div
								key={reminder.method + reminder.minutes}
								className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
							>
								<input
									type="hidden"
									name="reminderType"
									value={reminder.method}
								/>
								<input
									type="hidden"
									name="reminderMinutes"
									value={reminder.minutes}
								/>

								<select
									value={reminder.method}
									onChange={(e) =>
										updateReminder(index, "method", e.target.value)
									}
									className="h-9 px-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800"
								>
									<option value="popup">{t("events.reminder.popup")}</option>
									<option value="email">{t("events.reminder.email")}</option>
								</select>

								<select
									value={reminder.minutes}
									onChange={(e) =>
										updateReminder(
											index,
											"minutes",
											parseInt(e.target.value, 10),
										)
									}
									className="h-9 px-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 flex-1"
								>
									{REMINDER_PRESETS.map((preset) => (
										<option key={preset.minutes} value={preset.minutes}>
											{t(`events.reminder.${preset.labelKey}`)}
										</option>
									))}
								</select>

								<Button
									type="button"
									variant="ghost"
									size="icon"
									onClick={() => removeReminder(index)}
									className="h-9 w-9 text-gray-400 hover:text-red-500"
								>
									<span className="material-symbols-outlined">close</span>
								</Button>
							</div>
						))}
					</div>

					{/* Attendees */}
					<div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 space-y-6">
						<h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
							{t("common.sections.attendees")}
						</h2>

						<div className="space-y-2">
							<Label htmlFor="attendees">{t("common.fields.attendees")}</Label>
							<textarea
								id="attendees"
								name="attendees"
								rows={2}
								className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none"
								placeholder={t("events.form.attendees_placeholder")}
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
						>
							{t("common.actions.cancel")}
						</Button>
						<Button type="submit" disabled={isSubmitting}>
							{isSubmitting ? (
								<span className="flex items-center gap-2">
									<span className="animate-spin material-symbols-outlined text-sm">
										progress_activity
									</span>
									<span>{t("common.status.saving")}</span>
								</span>
							) : (
								<>
									<span className="material-symbols-outlined mr-2">
										calendar_add_on
									</span>
									{t("events.new.submit")}
								</>
							)}
						</Button>
					</div>
				</Form>
			</div>
		</PageWrapper>
	);
}
