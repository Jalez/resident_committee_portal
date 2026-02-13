import { DeleteRouteRedirect } from "~/components/delete-route-redirect";
import {
	createGenericDeleteAction,
	genericDeleteLoader,
} from "~/lib/actions/generic-delete.server";
import { clearCache } from "~/lib/cache.server";

export const loader = genericDeleteLoader;
export const action = createGenericDeleteAction("transaction", {
	idParam: "transactionId",
	beforeDelete: async (db, transaction) => {
		clearCache("TRANSACTIONS_BY_YEAR");
	},
});

export default function TransactionDeleteRoute() {
	return <DeleteRouteRedirect listPath="/treasury/transactions" />;
}
