import { useTranslation } from "react-i18next";
import {
	ActionButton,
	ContentArea,
	PageWrapper,
	QRPanel,
	SplitLayout,
} from "~/components/layout/page-layout";
import { type SearchField, SearchMenu } from "~/components/search-menu";
import { useLanguage } from "~/contexts/language-context";
import { getDatabase } from "~/db";
import { getAuthenticatedUser, getGuestContext } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import { getCalendarEvents, getCalendarUrl } from "~/lib/google.server";
import { queryClient } from "~/lib/query-client";
import { queryKeys, STALE_TIME } from "~/lib/query-config";
import type { Route } from "./+types/events";

export function meta({ data }: Route.MetaArgs) {
	return [
		{ title: `${data?.siteConfig?.name || "Portal"} - Tapahtumat / Events` },
		{ name: "description", content: "Tulevat tapahtumat / Upcoming events" },
	];
}

interface Event {
	id: string;
	type: "meeting" | "social" | "private";
	title: string;
	location: string;
	startDate: string;
	isAllDay: boolean;
}

interface GroupedMonth {
	monthKey: string;
	monthDate: string;
	events: Event[];
}

export async function loader({ request }: Route.LoaderArgs) {
	// Check permission (works for both logged-in users and guests)
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
	// Use ensureQueryData for client-side caching
	// Returns cached data if fresh, fetches if stale
	const [calendarItems, calendarUrl] = await Promise.all([
		queryClient.ensureQueryData({
			queryKey: queryKeys.calendar,
			queryFn: getCalendarEvents,
			staleTime: STALE_TIME,
		}),
		queryClient.ensureQueryData({
			queryKey: queryKeys.calendarUrl,
			queryFn: getCalendarUrl,
			staleTime: STALE_TIME,
		}),
	]);

	if (!calendarItems.length) {
		return {
			siteConfig: SITE_CONFIG,
			groupedMonths: [],
			calendarUrl,
			languages,
			filters: { title: titleFilter },
			hasFilters: !!titleFilter,
		};
	}

	const groupedMap = new Map<string, Event[]>();

	// Define the shape of calendar items from Google Calendar API
	interface CalendarItem {
		id: string;
		summary?: string;
		description?: string;
		location?: string;
		start?: {
			dateTime?: string;
			date?: string;
		};
	}

	calendarItems.forEach((item: CalendarItem) => {
		const startDate = new Date(
			item.start?.dateTime || item.start?.date || new Date(),
		);
		const year = startDate.getFullYear();
		const displayMonthKey = `${year}-${startDate.getMonth()}`; // unique key

		const isAllDay = !item.start?.dateTime;
		const summary = item.summary || "Untitled Event";

		const event: Event = {
			id: item.id,
			startDate: startDate.toISOString(),
			isAllDay,
			title: summary,
			location: item.location || "",
			type:
				item.description?.includes("#meeting") ||
				summary.toLowerCase().includes("kokous")
					? "meeting"
					: "social",
		};

		if (!groupedMap.has(displayMonthKey)) {
			groupedMap.set(displayMonthKey, []);
		}
		groupedMap.get(displayMonthKey)?.push(event);
	});

	// Create array with month dates
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
		calendarUrl,
		languages,
		filters: { title: titleFilter },
		hasFilters: !!titleFilter,
	};
}

export default function Events({ loaderData }: Route.ComponentProps) {
	const { groupedMonths, calendarUrl, filters, hasFilters, languages } =
		loaderData;
	const { isInfoReel } = useLanguage();
	const { t, i18n } = useTranslation();

	// Determine current locale for formatting
	// If language is 'en', force 'en-GB' to avoid 'en-US' (month-first) formatting.
	// Otherwise use the language code as-is (e.g. 'fi', 'sv') which usually defaults to day-first.
	const currentLocale = i18n.language === "en" ? "en-GB" : i18n.language;

	// Helper to format month name
	const formatMonth = (isoDate: string) => {
		const date = new Date(isoDate);
		const monthName = date.toLocaleDateString(currentLocale, { month: "long" });
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
		return new Date(isoDate).toLocaleDateString(currentLocale, {
			weekday: "short",
		});
	};

	// Helper to format event date number (1, 2...)
	const formatDateNum = (isoDate: string) => {
		return new Date(isoDate).getDate().toString();
	};

	// Helper to format event time
	const formatTime = (event: Event) => {
		if (event.isAllDay) {
			// For info reel, force Finnish (which is default behavior of key lookup if lang is fi)
			// but if we want specific behavior:
			if (isInfoReel) {
				return t("events.all_day", { lng: "fi" });
			}
			return t("events.all_day");
		}
		return new Date(event.startDate).toLocaleTimeString(currentLocale, {
			hour: "2-digit",
			minute: "2-digit",
		});
	};

	// Configure search fields
	const searchFields: SearchField[] = [
		{
			name: "title",
			label: t("events.search.label"),
			type: "text",
			placeholder: t("events.search.placeholder"),
		},
	];

	// Filter events client-side based on title filter
	const filteredMonths: GroupedMonth[] = filters?.title
		? groupedMonths
				.map((month: GroupedMonth) => ({
					...month,
					events: month.events.filter((event: Event) =>
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

	// Header actions: Search + Calendar button
	const FooterContent = (
		<div className="flex items-center gap-2">
			<SearchMenu fields={searchFields} />
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
				right={RightContent}
				footer={FooterContent}
				header={{
					primary: t("events.title", { lng: languages.primary }),
					secondary: t("events.title", { lng: languages.secondary }),
				}}
			>
				<ContentArea>
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
										{group.events.map((event: Event) => (
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
				</ContentArea>
			</SplitLayout>
		</PageWrapper>
	);
}
