import { DeleteRouteRedirect } from "~/components/delete-route-redirect";
import {
	createGenericDeleteAction,
	genericDeleteLoader,
} from "~/lib/actions/generic-delete.server";

export const loader = genericDeleteLoader;
export const action = createGenericDeleteAction("event", {
	idParam: "eventId",
});

export default function EventDeleteRoute() {
	return <DeleteRouteRedirect entityType="events" />;
}
