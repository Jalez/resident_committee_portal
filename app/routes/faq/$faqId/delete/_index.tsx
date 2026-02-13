import { DeleteRouteRedirect } from "~/components/delete-route-redirect";
import {
	createGenericDeleteAction,
	genericDeleteLoader,
} from "~/lib/actions/generic-delete.server";

export const loader = genericDeleteLoader;
export const action = createGenericDeleteAction("faq", { idParam: "faqId" });

export default function FaqDeleteRoute() {
	return <DeleteRouteRedirect listPath="/faq" />;
}
