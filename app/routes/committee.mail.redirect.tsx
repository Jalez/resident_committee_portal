import { redirect } from "react-router";
import type { Route } from "./+types/committee.mail.redirect";

export async function loader(_args: Route.LoaderArgs) {
	return redirect("/mail");
}

export default function CommitteeMailRedirect() {
	return null;
}
