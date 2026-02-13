import { DeleteRouteRedirect } from "~/components/delete-route-redirect";
import {
	createGenericDeleteAction,
	genericDeleteLoader,
} from "~/lib/actions/generic-delete.server";

export const loader = genericDeleteLoader;
export const action = createGenericDeleteAction("inventory", {
	idParam: "itemId",
});

export default function InventoryDeleteRoute() {
	return <DeleteRouteRedirect listPath="/inventory" />;
}
