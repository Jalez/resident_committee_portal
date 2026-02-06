import { redirect } from "react-router";
import type { Route } from "./+types/mail.new.redirect";

export async function loader(_args: Route.LoaderArgs) {
	return redirect("/mail/compose");
}

export default function MailNewRedirect() {
	return null;
}
