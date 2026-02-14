import { DeleteRouteRedirect } from "~/components/delete-route-redirect";
import {
	createGenericDeleteAction,
	genericDeleteLoader,
} from "~/lib/actions/generic-delete.server";

export const loader = genericDeleteLoader;
export const action = createGenericDeleteAction("reimbursement", {
	idParam: "reimbursementId",
	beforeDelete: async (db, reimbursement) => {
		if (reimbursement.emailSent && reimbursement.status !== "rejected") {
			throw new Error(
				"Cannot delete a reimbursement request that has already been sent. Reject it first if needed.",
			);
		}
	},
});

export default function ReimbursementDeleteRoute() {
	return <DeleteRouteRedirect listPath="/treasury/reimbursements" />;
}
