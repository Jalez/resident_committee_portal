import { useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { DeleteRouteRedirect } from "~/components/delete-route-redirect";
import { getDatabase } from "~/db/server";
import {
	createGenericDeleteAction,
	genericDeleteLoader,
} from "~/lib/actions/generic-delete.server";
import { requirePermission } from "~/lib/auth.server";

export const loader = genericDeleteLoader;

export async function action({
	request,
	params,
}: {
	request: Request;
	params: { submissionId: string };
}) {
	await requirePermission(request, "submissions:delete", getDatabase);
	const db = getDatabase();
	await db.deleteSubmission(params.submissionId);
	return Response.json({ success: true });
}

export default function SubmissionDeleteRoute() {
	const navigate = useNavigate();
	const params = useParams();

	useEffect(() => {
		navigate("/submissions", { replace: true });
	}, [navigate]);

	return null;
}
