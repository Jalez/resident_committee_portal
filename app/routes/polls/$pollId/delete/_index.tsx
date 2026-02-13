import { DeleteRouteRedirect } from "~/components/delete-route-redirect";
import {
	createGenericDeleteAction,
	genericDeleteLoader,
} from "~/lib/actions/generic-delete.server";

export const loader = genericDeleteLoader;
export const action = createGenericDeleteAction("poll", { idParam: "pollId" });

export default function PollDeleteRoute() {
	return <DeleteRouteRedirect listPath="/polls" />;
}
