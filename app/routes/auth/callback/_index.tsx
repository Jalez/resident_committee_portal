import { type LoaderFunctionArgs, redirect } from "react-router";
import { getDatabase } from "~/db/server";
import { localeCookie } from "~/i18next.server";
import {
	createSession,
	exchangeCodeForTokens,
	getUserInfo,
	isAdmin,
} from "~/lib/auth.server";
import { isCustomAvatarUrl } from "~/lib/avatars/utils";

export async function loader({ request }: LoaderFunctionArgs) {
	const url = new URL(request.url);
	const code = url.searchParams.get("code");
	const error = url.searchParams.get("error");

	// Handle OAuth errors
	if (error) {
		console.error("[OAuth Callback] Error:", error);
		return redirect("/?error=oauth_error");
	}

	if (!code) {
		console.error("[OAuth Callback] No code provided");
		return redirect("/?error=no_code");
	}

	// Exchange code for tokens
	const tokens = await exchangeCodeForTokens(code);
	if (!tokens) {
		return redirect("/?error=token_exchange_failed");
	}

	// Get user info
	const userInfo = await getUserInfo(tokens.access_token);
	if (!userInfo || !userInfo.email) {
		return redirect("/?error=user_info_failed");
	}

	// Persist user to database (creates new or updates existing)
	const db = getDatabase();
	const isAdminUser = isAdmin(userInfo.email);

	const user = await db.upsertUser({
		email: userInfo.email,
		name: userInfo.name || userInfo.email.split("@")[0],
		picture: userInfo.picture || null,
	});

	// Ensure super admins always have the Admin role (even if they already existed)
	if (isAdminUser) {
		const adminRole = await db.getRoleByName("Admin");
		if (adminRole) {
			const currentRoleIds = await db.getUserRoleIds(user.id);
			if (!currentRoleIds.includes(adminRole.id)) {
				await db.setUserRoles(user.id, [...currentRoleIds, adminRole.id]);
				console.log(
					`[OAuth Callback] Promoted ${userInfo.email} to Admin role`,
				);
			}
		}
	}

	// Update picture from Google only if user has not set a custom avatar
	if (
		userInfo.picture &&
		user.picture !== userInfo.picture &&
		!isCustomAvatarUrl(user.picture)
	) {
		await db.updateUser(user.id, { picture: userInfo.picture });
	}

	// Fetch full user data to get language preferences
	const fullUser = await db.findUserByEmail(userInfo.email);

	// Create session for all authenticated users
	const sessionCookie = await createSession({
		email: userInfo.email,
		name: userInfo.name,
		picture: userInfo.picture,
	});

	// Set locale cookie to user's primary language preference
	const userLanguage = fullUser?.primaryLanguage || "fi";
	const localeCookieHeader = await localeCookie.serialize(userLanguage);

	console.log(
		`[OAuth Callback] User logged in: ${userInfo.email} (admin: ${isAdminUser}, language: ${userLanguage})`,
	);

	// Always redirect to home page
	return redirect("/", {
		headers: [
			["Set-Cookie", sessionCookie],
			["Set-Cookie", localeCookieHeader],
		],
	});
}
