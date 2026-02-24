import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	Link,
	useFetcher,
	useRevalidator,
	useSearchParams,
} from "react-router";
import { toast } from "sonner";
import { AddItemButton } from "~/components/add-item-button";
import { useFormatDate } from "~/hooks/use-format-date";
import {
	EventsTable,
	type EventTableRow,
} from "~/components/events/events-table";
import {
	ActionButton,
	ContentArea,
	PageWrapper,
	QRPanel,
	SplitLayout,
} from "~/components/layout/page-layout";
import { RelationsColumn } from "~/components/relations-column";
import { type SearchField, SearchMenu } from "~/components/search-menu";
import { Button } from "~/components/ui/button";
import { useLanguage } from "~/contexts/language-context";
import { useUser } from "~/contexts/user-context";
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
import type { Route } from "./+types/_index";

export function meta({ data }: Route.MetaArgs) {
	return [
		{ title: `${data?.siteConfig?.name || "Portal"} - Tapahtumat / Events` },
		{ name: "description", content: "Tulevat tapahtumat / Upcoming events" },
	];
}

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

export async function loader({ request }: Route.LoaderArgs) {
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

	const url = new URL(request.url);
	const titleFilter = url.searchParams.get("title") || "";
	const viewMode = url.searchParams.get("view") || "upcoming";

	const db = getDatabase();
	const canWrite = permissions.some((p) => p === "events:write" || p === "*");

	const [events, calendarUrl] = await Promise.all([
		viewMode === "all" && canWrite ? db.getEvents() : db.getUpcomingEvents(50),
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

	if (!filteredEvents.length) {
		return {
			siteConfig: SITE_CONFIG,
			groupedMonths: [],
			allEvents: [],
			calendarUrl,
			languages,
			filters: { title: titleFilter },
			hasFilters: !!titleFilter,
			canWrite,
			viewMode,
			relationsMap: new Map<string, RelationBadgeData[]>(),
		};
	}

	const eventIds = filteredEvents.map((e) => e.id);
	const relationsMap = await loadRelationsMapForEntities(
		db,
		"event",
		eventIds,
		undefined,
		permissions,
	);

	const groupedMap = new Map<string, DisplayEvent[]>();

	filteredEvents.forEach((event) => {
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
	});

	const groupedMonths: GroupedMonth[] = Array.from(groupedMap.entries()).map(
		([key, events]) => {
			const [y, m] = key.split("-").map(Number);
			const d = new Date(y, m, 1);

			return {
				monthKey: key,
				monthDate: d.toISOString(),
				events,
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

export async function action({ request }: Route.ActionArgs) {
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

export default function Events({ loaderData }: Route.ComponentProps) {
	const {
		groupedMonths,
		allEvents,
		calendarUrl,
		filters,
		hasFilters,
		languages,
		canWrite,
		viewMode,
		relationsMap,
	} = loaderData;
	const { isInfoReel } = useLanguage();
	const { hasPermission } = useUser();
	const { t, i18n } = useTranslation();
	const { formatDate: formatLocaleDate } = useFormatDate();
	const [searchParams, setSearchParams] = useSearchParams();
	const deleteFetcher = useFetcher<typeof action>();
	const revalidator = useRevalidator();
	const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

	const revalidatedRef = useRef(false);

	const canUpdate = hasPermission("events:update");
	const canDelete = hasPermission("events:delete");
	const canExport = !isInfoReel && hasPermission("events:export");
	const canImport = !isInfoReel && hasPermission("events:import");
	const hasActions = canUpdate || canDelete;

	useEffect(() => {
		const created = searchParams.get("created") === "true";
		const updated = searchParams.get("updated") === "true";

		if (created) {
			toast.success(t("events.new.success"), { id: "event-created" });
			setSearchParams(
				(prev) => {
					prev.delete("created");
					return prev;
				},
				{ replace: true },
			);
		} else if (updated) {
			toast.success(t("events.edit.success"), { id: "event-updated" });
			setSearchParams(
				(prev) => {
					prev.delete("updated");
					return prev;
				},
				{ replace: true },
			);
		}
	}, [searchParams, setSearchParams, t]);

	useEffect(() => {
		if (deleteFetcher.data?.deleted) {
			toast.success(t("events.delete.success"), { id: "event-deleted" });
			setDeleteConfirmId(null);
			if (!revalidatedRef.current) {
				revalidatedRef.current = true;
				revalidator.revalidate();
			}
		} else if (deleteFetcher.data?.error) {
			toast.error(t("events.delete.error"), { id: "event-delete-error" });
		}
		if (deleteFetcher.state === "idle" && !deleteFetcher.data) {
			revalidatedRef.current = false;
		}
	}, [deleteFetcher.data, deleteFetcher.state, t, revalidator]);

	const handleDelete = (eventId: string) => {
		revalidatedRef.current = false;
		deleteFetcher.submit({ _action: "delete", eventId }, { method: "post" });
	};

	const toggleViewMode = () => {
		const newMode = viewMode === "all" ? "upcoming" : "all";
		setSearchParams(
			(prev) => {
				prev.set("view", newMode);
				return prev;
			},
			{ replace: true },
		);
	};

	const currentLocale = i18n.language === "en" ? "en-GB" : i18n.language;

	// Helper to format month name
	const formatMonth = (isoDate: string) => {
		const date = new Date(isoDate);
		const monthName = formatLocaleDate(date, { month: "long" });
		const year = date.getFullYear();
		return `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${year}`;
	};

	// Helper to format English month name for dual display
	const formatMonthEn = (isoDate: string) => {
		const date = new Date(isoDate);
		const monthName = date.toLocaleDateString("en-GB", { month: "long" });
		const year = date.getFullYear();
		return `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${year}`;
	};

	// Helper to format event day (Mon, Tue...)
	const formatDay = (isoDate: string) => {
		return formatLocaleDate(new Date(isoDate), {
			weekday: "short",
		});
	};

	// Helper to format event date number (1, 2...)
	const formatDateNum = (isoDate: string) => {
		return new Date(isoDate).getDate().toString();
	};

	// Helper to format event time
	const formatTime = (event: DisplayEvent) => {
		if (event.isAllDay) {
			if (i18n.language === "fi") {
				return t("common.fields.all_day", { lng: "fi" });
			}
			return t("common.fields.all_day");
		}
		const date = new Date(event.startDate);
		const tz = event.timezone || undefined;
		return date.toLocaleTimeString(i18n.language, {
			hour: "2-digit",
			minute: "2-digit",
			timeZone: tz,
		});
	};

	// Configure search fields
	const searchFields: SearchField[] = [
		{
			name: "title",
			label: t("common.actions.search"),
			type: "text",
			placeholder: t("common.placeholders.search"),
		},
	];

	// Filter events client-side based on title filter
	const filteredMonths: GroupedMonth[] = filters?.title
		? groupedMonths
			.map((month: GroupedMonth) => ({
				...month,
				events: month.events.filter((event: DisplayEvent) =>
					event.title.toLowerCase().includes(filters.title.toLowerCase()),
				),
			}))
			.filter((month: GroupedMonth) => month.events.length > 0)
		: groupedMonths;

	// QR Panel only shown in info reel mode
	const RightContent = (
		<QRPanel
			qrUrl={calendarUrl || undefined}
			title={
				<h2 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">
					{t("events.open_calendar")} <br />
					{isInfoReel && (
						<span className="text-lg text-gray-400 font-bold">
							{t("events.open_calendar", { lng: "en" })}
						</span>
					)}
				</h2>
			}
		/>
	);

	// Header actions: Search + Calendar button + Add Event
	const FooterContent = (
		<div className="flex items-center gap-2">
			<SearchMenu fields={searchFields} />
			{canWrite && !isInfoReel && (
				<>
					<Button
						variant="outline"
						size="sm"
						onClick={toggleViewMode}
						title={
							viewMode === "all" ? t("events.upcoming") : t("events.view_all")
						}
					>
						<span className="material-symbols-outlined text-lg">
							{viewMode === "all" ? "calendar_month" : "table"}
						</span>
					</Button>
					<AddItemButton
						title={t("events.add_event")}
						variant="icon"
						createType="event"
					/>
				</>
			)}
			{calendarUrl && (
				<ActionButton
					href={calendarUrl}
					icon="calendar_month"
					labelPrimary={t("events.open_calendar", { lng: languages.primary })}
					labelSecondary={t("events.open_calendar", {
						lng: languages.secondary,
					})}
					external={true}
				/>
			)}
		</div>
	);

	return (
		<PageWrapper>
			<SplitLayout
				canExport={canExport}
				canImport={canImport}
				right={RightContent}
				footer={FooterContent}
				header={{
					primary: t("events.title", { lng: languages.primary }),
					secondary: t("events.title", { lng: languages.secondary }),
				}}
			>
				<ContentArea>
					{viewMode === "all" && canWrite ? (
						<EventsTable
							events={allEvents}
							hasActions={hasActions}
							canUpdate={canUpdate}
							canDelete={canDelete}
							deleteConfirmId={deleteConfirmId}
							setDeleteConfirmId={setDeleteConfirmId}
							handleDelete={handleDelete}
							deleteFetcher={deleteFetcher}
							currentLocale={currentLocale}
							t={t}
							relationsMap={relationsMap}
						/>
					) : (
						<>
							{!filteredMonths.length ? (
								<div className="bg-primary rounded-xl mb-8 px-8 py-4 flex items-center justify-end text-white">
									<p className="text-xl font-bold leading-none uppercase tracking-widest">
										{hasFilters ? t("events.no_results") : t("events.upcoming")}
									</p>
								</div>
							) : null}

							<div className="space-y-12">
								{filteredMonths.map((group: GroupedMonth) => (
									<div key={group.monthKey} className="relative">
										<div className="bg-primary rounded-xl mb-8 px-8 py-4 flex items-center justify-end text-white sticky top-0 z-10">
											<p className="text-xl font-bold leading-none uppercase tracking-widest">
												{formatMonth(group.monthDate)}
												{isInfoReel && (
													<span className="opacity-60 text-lg ml-2">
														/ {formatMonthEn(group.monthDate)}
													</span>
												)}
											</p>
										</div>

										<div className="flex-1 relative flex flex-col">
											<ul className="divide-y divide-gray-100 dark:divide-gray-800">
												{group.events.map((event: DisplayEvent) => (
													<li
														key={event.id}
														className={`flex items-start md:items-center p-4 md:p-6 hover:bg-white dark:hover:bg-gray-800/50 transition-colors ${event.type === "meeting" ? "bg-red-50/50 dark:bg-red-900/10" : ""} ${event.type === "private" ? "opacity-60" : ""}`}
													>
														<div
															className={`w-14 md:w-20 flex flex-col items-center justify-center shrink-0 leading-none mr-4 md:mr-6 pt-1 md:pt-0 ${event.type === "meeting" ? "text-primary dark:text-red-400" : event.type === "private" ? "text-gray-400 dark:text-gray-500" : "text-gray-900 dark:text-gray-100"}`}
														>
															<span className="text-2xl md:text-4xl font-black tracking-tighter">
																{formatDateNum(event.startDate)}
															</span>
															<span className="text-[10px] md:text-xs font-bold uppercase mt-1 tracking-wider">
																{formatDay(event.startDate)}
															</span>
														</div>
														<div className="flex-1 min-w-0 py-0.5">
															<h3
																className={`text-lg md:text-xl font-black uppercase tracking-tight leading-tight md:leading-none ${event.type === "private" ? "text-gray-500 dark:text-gray-500" : "text-gray-900 dark:text-white"}`}
															>
																{event.title}
															</h3>
															<div
																className={`flex flex-col md:flex-row md:items-center gap-1 md:gap-4 text-xs md:text-sm font-bold uppercase tracking-wide mt-2 md:mt-1.5 ${event.type === "private" ? "text-gray-400 dark:text-gray-600" : "text-gray-500 dark:text-gray-400"}`}
															>
																<span className="flex items-center gap-1.5">
																	<span className="material-symbols-outlined text-[16px] md:text-[18px]">
																		schedule
																	</span>{" "}
																	{formatTime(event)}
																</span>
																{event.location && (
																	<span className="flex items-center gap-1.5 truncate">
																		<span className="material-symbols-outlined text-[16px] md:text-[18px]">
																			location_on
																		</span>{" "}
																		{event.location}
																	</span>
																)}
															</div>
														</div>
														{/* Edit/Delete Actions */}
														{hasActions && !isInfoReel && (
															<div className="flex items-center gap-1 ml-2 shrink-0">
																{deleteConfirmId === event.id ? (
																	<>
																		<Button
																			variant="destructive"
																			size="sm"
																			onClick={() => handleDelete(event.id)}
																			disabled={deleteFetcher.state !== "idle"}
																		>
																			{deleteFetcher.state !== "idle" ? (
																				<span className="material-symbols-outlined animate-spin text-sm">
																					progress_activity
																				</span>
																			) : (
																				t("common.actions.confirm")
																			)}
																		</Button>
																		<Button
																			variant="outline"
																			size="sm"
																			onClick={() => setDeleteConfirmId(null)}
																		>
																			{t("common.actions.cancel")}
																		</Button>
																	</>
																) : (
																	<>
																		{canUpdate && (
																			<Link
																				to={`/events/${event.id}/edit`}
																				className="p-2 text-gray-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
																				title={t("common.actions.edit")}
																			>
																				<span className="material-symbols-outlined text-lg">
																					edit
																				</span>
																			</Link>
																		)}
																		{canDelete && (
																			<button
																				type="button"
																				onClick={() =>
																					setDeleteConfirmId(event.id)
																				}
																				className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
																				title={t("common.actions.delete")}
																			>
																				<span className="material-symbols-outlined text-lg">
																					delete
																				</span>
																			</button>
																		)}
																	</>
																)}
															</div>
														)}
													</li>
												))}
											</ul>
										</div>
									</div>
								))}
							</div>

							{groupedMonths.length === 0 && (
								<div className="p-12 text-center text-gray-400 font-bold uppercase tracking-widest">
									{t("events.no_upcoming")}
								</div>
							)}
						</>
					)}
				</ContentArea>
			</SplitLayout>
		</PageWrapper>
	);
}
