import { DeleteRouteRedirect } from "~/components/delete-route-redirect";
import {
	createGenericDeleteAction,
	genericDeleteLoader,
} from "~/lib/actions/generic-delete.server";

export const loader = genericDeleteLoader;
export const action = createGenericDeleteAction("receipt", {
	idParam: "receiptId",
});

export default function ReceiptDeleteRoute() {
	return <DeleteRouteRedirect entityType="treasury/receipts" />;
}
