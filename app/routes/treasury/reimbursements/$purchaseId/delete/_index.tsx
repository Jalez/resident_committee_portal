import {
	createGenericDeleteAction,
	genericDeleteLoader,
} from "~/lib/actions/generic-delete.server";

export const loader = genericDeleteLoader;

export const action = createGenericDeleteAction("reimbursement", {
	idParam: "purchaseId",
	beforeDelete: async (db, purchase) => {
		// Check if already processed (this is entity state, not relationship)
		if (purchase.emailSent && purchase.status !== "rejected") {
			throw new Error(
				"Cannot delete a reimbursement request that has already been sent. Reject it first if needed.",
			);
		}
	},
});
