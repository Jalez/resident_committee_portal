import { redirect } from "react-router";
import { localeCookie } from "~/i18next.server";
import { destroySession } from "~/lib/auth.server";
import { getSystemLanguageDefaults } from "~/lib/settings.server";

export async function loader() {
	const sessionCookie = await destroySession();

	// Reset locale cookie to system default on logout
	// This ensures the next user (or guest) sees the correct language
	const { primary: defaultLanguage } = await getSystemLanguageDefaults();
	const localeCookieHeader = await localeCookie.serialize(defaultLanguage);

	return redirect("/", {
		headers: [
			["Set-Cookie", sessionCookie],
			["Set-Cookie", localeCookieHeader],
		],
	});
}
