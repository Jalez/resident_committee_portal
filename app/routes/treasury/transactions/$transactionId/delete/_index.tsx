import {
	createGenericDeleteAction,
	genericDeleteLoader,
} from "~/lib/actions/generic-delete.server";
import { clearCache } from "~/lib/cache.server";

export const loader = genericDeleteLoader;

export const action = createGenericDeleteAction("transaction", {
	idParam: "transactionId",
	beforeDelete: async (db, transaction) => {
		// Clear cache after successful delete
		clearCache("TRANSACTIONS_BY_YEAR");
	},
});
