import { Link } from "react-router";
import { ScrollArea } from "~/components/ui/scroll-area";
import type { Route } from "./+types/events";
import { PageWrapper, SplitLayout, QRPanel, PageHeader } from "~/components/layout/page-layout";

export function meta() {
    return [
        { title: "Toas Hippos - Tapahtumat / Events" },
        { name: "description", content: "Tulevat tapahtumat / Upcoming events at Toas Hippos" },
    ];
}

import { getCalendarEvents, getCalendarUrl } from "~/lib/google.server";

interface Event {
    id: number;
    date: string;
    day: string;
    title: string;
    time: string;
    location: string;
    type: "meeting" | "social" | "private";
}

export async function loader({ }: Route.LoaderArgs) {
    const [calendarItems, calendarUrl] = await Promise.all([
        getCalendarEvents(),
        getCalendarUrl()
    ]);

    // Fallback if no data (keys missing or empty calendar) to keep UI working
    if (!calendarItems.length) {
        return {
            month: "Tulevat / Upcoming",
            events: [],
            calendarUrl
        };
    }

    const events = calendarItems.map((item: any) => {
        const startDate = new Date(item.start?.dateTime || item.start?.date || new Date());
        const isAllDay = !item.start?.dateTime;
        const summary = item.summary || "Untitled Event";

        return {
            id: item.id,
            date: startDate.getDate().toString(),
            day: startDate.toLocaleDateString("en-GB", { weekday: "short" }) + " / " + startDate.toLocaleDateString("fi-FI", { weekday: "short" }),
            title: summary,
            time: isAllDay ? "Koko päivä / All Day" : startDate.toLocaleTimeString("fi-FI", { hour: "2-digit", minute: "2-digit" }),
            location: item.location || "",
            type: (item.description?.includes("#meeting") || summary.toLowerCase().includes("kokous")) ? "meeting" : "social",
        };
    });

    return {
        month: "Tulevat / Upcoming",
        events: events,
        calendarUrl
    };
}

export default function Events({ loaderData }: Route.ComponentProps) {
    const { month, events, calendarUrl } = loaderData;

    const RightContent = (
        <QRPanel
            qrUrl={calendarUrl || undefined}
            title={
                <h2 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">
                    Avaa kalenteri <br />
                    <span className="text-lg text-gray-400 font-bold">Open Calendar</span>
                </h2>
            }
        />
    );

    return (
        <PageWrapper>
            <SplitLayout
                right={RightContent}
                header={{ finnish: "Tapahtumat", english: "Events" }}
            >
                <div>
                    <div className="bg-primary -mx-8 mb-8 px-8 py-4 lg:-mx-12 lg:mb-8 lg:px-12 flex items-center justify-end text-white">
                        <p className="text-xl font-bold leading-none uppercase tracking-widest">{month}</p>
                    </div>

                    <div className="flex-1 relative flex flex-col">
                        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                            {events.slice(0, 3).map((event: Event) => (
                                <li
                                    key={event.id}
                                    className={`flex items-center p-6 hover:bg-white dark:hover:bg-gray-800/50 transition-colors ${event.type === "meeting" ? "bg-red-50/50 dark:bg-red-900/10" : ""} ${event.type === "private" ? "opacity-60" : ""}`}
                                >
                                    <div
                                        className={`w-20 flex flex-col items-center justify-center shrink-0 leading-none mr-6 ${event.type === "meeting" ? "text-primary dark:text-red-400" : event.type === "private" ? "text-gray-400 dark:text-gray-500" : "text-gray-900 dark:text-gray-100"}`}
                                    >
                                        <span className="text-4xl font-black tracking-tighter">{event.date}</span>
                                        <span className="text-xs font-bold uppercase mt-1 tracking-wider">
                                            {event.day}
                                        </span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3
                                            className={`text-xl font-black uppercase tracking-tight truncate ${event.type === "private" ? "text-gray-500 dark:text-gray-500" : "text-gray-900 dark:text-white"}`}
                                        >
                                            {event.title}
                                        </h3>
                                        <div
                                            className={`flex items-center gap-4 text-sm font-bold uppercase tracking-wide mt-1.5 ${event.type === "private" ? "text-gray-400 dark:text-gray-600" : "text-gray-500 dark:text-gray-400"}`}
                                        >
                                            <span className="flex items-center gap-1.5">
                                                <span className="material-symbols-outlined text-[18px]">
                                                    schedule
                                                </span>{" "}
                                                {event.time}
                                            </span>
                                            {event.location && (
                                                <span className="flex items-center gap-1.5 truncate">
                                                    <span className="material-symbols-outlined text-[18px]">
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
            </SplitLayout>
        </PageWrapper>
    );
}
