import {
	EventsPage,
} from "./events-page";
import { eventsPageAction, loadEventsPageData } from "./events-page.server";
import type { Route } from "./+types/_index";

export function meta({ data }: Route.MetaArgs) {
	return [
		{ title: `${data?.siteConfig?.name || "Portal"} - Tapahtumat / Events` },
		{ name: "description", content: "Tulevat tapahtumat / Upcoming events" },
	];
}

export async function loader({ request }: Route.LoaderArgs) {
	return loadEventsPageData(request, "upcoming");
}

export async function action({ request }: Route.ActionArgs) {
	return eventsPageAction(request);
}

export default function Events({ loaderData }: Route.ComponentProps) {
	return <EventsPage loaderData={loaderData} viewMode="upcoming" />;
}
