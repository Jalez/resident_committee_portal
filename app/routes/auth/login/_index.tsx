import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { getGoogleAuthUrl } from "~/lib/auth.server";

// Redirect to Google OAuth consent screen
export function loader({ request }: LoaderFunctionArgs) {
	const url = new URL(request.url);
	const returnTo = url.searchParams.get("returnTo") || undefined;
	const authUrl = getGoogleAuthUrl(returnTo);
	return redirect(authUrl);
}
