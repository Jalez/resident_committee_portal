import { DeleteRouteRedirect } from "~/components/delete-route-redirect";
import {
	createGenericDeleteAction,
	genericDeleteLoader,
} from "~/lib/actions/generic-delete.server";

export const loader = genericDeleteLoader;
export const action = createGenericDeleteAction("budget", {
	idParam: "budgetId",
});

export default function BudgetDeleteRoute() {
	return <DeleteRouteRedirect listPath="/treasury/budgets" />;
}
