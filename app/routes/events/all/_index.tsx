import {
	EventsPage,
} from "../events-page";
import {
	eventsPageAction,
	loadEventsPageData,
} from "../events-page.server";
import type { Route } from "./+types/_index";

export function meta({ data }: Route.MetaArgs) {
	return [
		{ title: `${data?.siteConfig?.name || "Portal"} - All Events` },
		{ name: "description", content: "All events" },
	];
}

export async function loader({ request }: Route.LoaderArgs) {
	return loadEventsPageData(request, "all");
}

export async function action({ request }: Route.ActionArgs) {
	return eventsPageAction(request);
}

export default function EventsAll({ loaderData }: Route.ComponentProps) {
	return <EventsPage loaderData={loaderData} viewMode="all" />;
}
