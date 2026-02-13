import { DeleteRouteRedirect } from "~/components/delete-route-redirect";
import {
	createGenericDeleteAction,
	genericDeleteLoader,
} from "~/lib/actions/generic-delete.server";

export const loader = genericDeleteLoader;
export const action = createGenericDeleteAction("news", { idParam: "newsId" });

export default function NewsDeleteRoute() {
	return <DeleteRouteRedirect listPath="/news" />;
}
