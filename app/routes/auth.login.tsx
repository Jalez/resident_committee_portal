import { redirect } from "react-router";
import { getGoogleAuthUrl } from "~/lib/auth.server";

// Redirect to Google OAuth consent screen
export function loader() {
	const authUrl = getGoogleAuthUrl();
	return redirect(authUrl);
}
