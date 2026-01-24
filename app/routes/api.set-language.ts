import { type ActionFunctionArgs, data } from "react-router";
import { getDatabase } from "~/db";
import { localeCookie } from "~/i18next.server";
import { getAuthenticatedUser } from "~/lib/auth.server";

export async function action({ request }: ActionFunctionArgs) {
	const formData = await request.formData();
	const language = formData.get("language") as string;
	const type = (formData.get("type") as string) || "primary";

	if (!language) {
		return data(
			{ success: false, error: "No language specified" },
			{ status: 400 },
		);
	}

	const headers = new Headers();

	// Update persistent user profile if logged in
	const authUser = await getAuthenticatedUser(request, getDatabase);
	if (authUser) {
		const db = getDatabase();

		if (type === "primary") {
			// Update primary language in profile
			if (authUser.primaryLanguage !== language) {
				await db.updateUser(authUser.userId, {
					primaryLanguage: language,
				});
			}
			// Set cookie for primary language (this controls the UI)
			headers.set("Set-Cookie", await localeCookie.serialize(language));
		} else if (type === "secondary") {
			// Update secondary language in profile (no cookie needed)
			if (authUser.secondaryLanguage !== language) {
				await db.updateUser(authUser.userId, {
					secondaryLanguage: language,
				});
			}
		}
	} else {
		// Guest user - only primary language affects the cookie
		if (type === "primary") {
			headers.set("Set-Cookie", await localeCookie.serialize(language));
		}
		// Note: Guests don't have a persistent secondary language preference
	}

	return data({ success: true }, { headers });
}
