import type { Route } from "./+types/events";
import { PageWrapper, SplitLayout, QRPanel, ActionButton, ContentArea } from "~/components/layout/page-layout";
import { SearchMenu, type SearchField } from "~/components/search-menu";
import { getCalendarEvents, getCalendarUrl } from "~/lib/google.server";
import { queryClient } from "~/lib/query-client";
import { queryKeys, STALE_TIME } from "~/lib/query-config";
import { SITE_CONFIG } from "~/lib/config.server";
import { getAuthenticatedUser, getGuestPermissions } from "~/lib/auth.server";
import { getDatabase } from "~/db";
import { useLanguage } from "~/contexts/language-context";

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
    date: string; // for compatibility / sorting
    displayDate: { fi: string; en: string };
    displayDay: { fi: string; en: string };
    displayTime: { fi: string; en: string };
}

interface GroupedMonth {
    monthKey: string;
    monthName: { fi: string; en: string };
    events: Event[];
}

export async function loader({ request }: Route.LoaderArgs) {
    // Check permission (works for both logged-in users and guests)
    const authUser = await getAuthenticatedUser(request, getDatabase);
    const permissions = authUser
        ? authUser.permissions
        : await getGuestPermissions(() => getDatabase());

    const canRead = permissions.some(p => p === "events:read" || p === "*");
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
            filters: { title: titleFilter },
            hasFilters: !!titleFilter,
        };
    }

    const groupedMap = new Map<string, Event[]>();

    calendarItems.forEach((item: any) => {
        const startDate = new Date(item.start?.dateTime || item.start?.date || new Date());

        const monthNameFin = startDate.toLocaleDateString("fi-FI", { month: "long" });
        const monthNameEng = startDate.toLocaleDateString("en-GB", { month: "long" });
        const year = startDate.getFullYear();

        const displayMonthKey = `${year}-${startDate.getMonth()}`; // unique key
        const displayMonthObj = {
            fi: `${monthNameFin.charAt(0).toUpperCase() + monthNameFin.slice(1)} ${year}`,
            en: `${monthNameEng.charAt(0).toUpperCase() + monthNameEng.slice(1)} ${year}`,
        };

        const isAllDay = !item.start?.dateTime;
        const summary = item.summary || "Untitled Event";

        const event: Event = {
            id: item.id,
            date: startDate.getDate().toString(),
            // Replacing raw strings with structured objects
            displayDate: {
                fi: startDate.getDate().toString(),
                en: startDate.getDate().toString()
            },
            displayDay: {
                fi: startDate.toLocaleDateString("fi-FI", { weekday: "short" }),
                en: startDate.toLocaleDateString("en-GB", { weekday: "short" })
            },
            displayTime: {
                fi: isAllDay ? "Koko päivä" : startDate.toLocaleTimeString("fi-FI", { hour: "2-digit", minute: "2-digit" }),
                en: isAllDay ? "All Day" : startDate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
            },
            title: summary,
            location: item.location || "",
            type: (item.description?.includes("#meeting") || summary.toLowerCase().includes("kokous")) ? "meeting" : "social",
        };

        if (!groupedMap.has(displayMonthKey)) {
            groupedMap.set(displayMonthKey, []);
        }
        groupedMap.get(displayMonthKey)?.push(event);
    });

    // Create array with enriched month names
    const groupedMonths: GroupedMonth[] = Array.from(groupedMap.entries()).map(([key, events]) => {
        // Find one event to get the month object again (slightly inefficient but safe)
        // Or store it in a parallel map. Let's just reconstruct or store in map value. 
        // Better: Map<string, { monthName: {fi,en}, events: Event[] }>
        // But for minimal diff, let's just reconstruct from first event's date or similar.
        // Actually, let's change groupedMap value type.
        // Wait, I cannot easily change map value type in this small block without rewriting loop.
        // I'll grab the first event's date and reconstruct month name.
        const firstEvent = events[0];
        // Wait, I don't have the date object here.
        // I need to store monthName in the map or derive it.
        // Let's use the key `YYYY-M` to derive it.
        const [y, m] = key.split("-").map(Number);
        const d = new Date(y, m, 1);
        const monthNameFin = d.toLocaleDateString("fi-FI", { month: "long" });
        const monthNameEng = d.toLocaleDateString("en-GB", { month: "long" });

        return {
            monthKey: key,
            monthName: {
                fi: `${monthNameFin.charAt(0).toUpperCase() + monthNameFin.slice(1)} ${y}`,
                en: `${monthNameEng.charAt(0).toUpperCase() + monthNameEng.slice(1)} ${y}`
            },
            events
        };
    });

    return {
        siteConfig: SITE_CONFIG,
        groupedMonths,
        calendarUrl
    };
}

export default function Events({ loaderData }: Route.ComponentProps) {
    const { groupedMonths, calendarUrl, filters, hasFilters } = loaderData;
    const { language, isInfoReel } = useLanguage();
    // Helper
    const t = (fi: string, en: string) => (language === "fi" || isInfoReel) ? fi : en;
    const tObj = (obj: { fi: string, en: string }) => (language === "fi" || isInfoReel) ? obj.fi : obj.en;

    // Configure search fields
    const searchFields: SearchField[] = [
        {
            name: "title",
            label: t("Tapahtuma", "Event"),
            type: "text",
            placeholder: t("Hae nimellä...", "Search by name..."),
        },
    ];

    // Filter events client-side based on title filter
    const filteredMonths: GroupedMonth[] = filters?.title
        ? groupedMonths
            .map((month: GroupedMonth) => ({
                ...month,
                events: month.events.filter((event: Event) =>
                    event.title.toLowerCase().includes(filters.title.toLowerCase())
                )
            }))
            .filter((month: GroupedMonth) => month.events.length > 0)
        : groupedMonths;

    // QR Panel only shown in info reel mode
    const RightContent = (
        <QRPanel
            qrUrl={calendarUrl || undefined}
            title={
                <h2 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">
                    {t("Avaa kalenteri", "Open Calendar")} <br />
                    {isInfoReel && <span className="text-lg text-gray-400 font-bold">Open Calendar</span>}
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
                    labelFi="Avaa kalenteri"
                    labelEn="Open Calendar"
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
                header={{ finnish: "Tapahtumat", english: "Events" }}
            >
                <ContentArea>
                    {!filteredMonths.length ? (
                        <div className="bg-primary rounded-xl mb-8 px-8 py-4 flex items-center justify-end text-white">
                            <p className="text-xl font-bold leading-none uppercase tracking-widest">
                                {hasFilters ? t("Ei tuloksia", "No results") : t("Tulevat", "Upcoming")}
                            </p>
                        </div>
                    ) : null}

                    <div className="space-y-12">
                        {filteredMonths.map((group: GroupedMonth) => (
                            <div key={group.monthKey} className="relative">
                                <div className="bg-primary rounded-xl mb-8 px-8 py-4 flex items-center justify-end text-white sticky top-0 z-10">
                                    <p className="text-xl font-bold leading-none uppercase tracking-widest">
                                        {tObj(group.monthName)}
                                        {isInfoReel && <span className="opacity-60 text-lg ml-2">/ {group.monthName.en}</span>}
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
                                                    <span className="text-2xl md:text-4xl font-black tracking-tighter">{event.date}</span>
                                                    <span className="text-[10px] md:text-xs font-bold uppercase mt-1 tracking-wider">
                                                        {tObj(event.displayDay)}
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
                                                            {tObj(event.displayTime)}
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
                            {t("Ei tulevia tapahtumia", "No upcoming events")}
                        </div>
                    )}
                </ContentArea>
            </SplitLayout>
        </PageWrapper>
    );
}

