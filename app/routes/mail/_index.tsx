import { redirect } from "react-router";
import { getDatabase } from "~/db/server.server";
import { requirePermission } from "~/lib/auth.server";
import { isCommitteeMailConfigured } from "~/lib/mail-nodemailer.server";
import type { Route } from "./+types/_index";

export async function loader({ request }: Route.LoaderArgs) {
	await requirePermission(request, "committee:email", getDatabase);

	if (!isCommitteeMailConfigured()) {
		return { notConfigured: true };
	}

	return redirect("/mail/inbox");
}

export default function MailIndexRedirect() {
	return null;
}
