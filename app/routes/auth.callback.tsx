import { redirect, type LoaderFunctionArgs } from "react-router";
import {
    exchangeCodeForTokens,
    getUserInfo,
    createSession,
    isAdmin
} from "~/lib/auth.server";
import { getDatabase } from "~/db";
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
    await db.upsertUser({
        email: userInfo.email,
        name: userInfo.name || userInfo.email.split("@")[0],
    });

    // Create session for all authenticated users
    const sessionCookie = await createSession({
        email: userInfo.email,
        name: userInfo.name,
        picture: userInfo.picture,
    });

    // Redirect based on admin status
    const isAdminUser = isAdmin(userInfo.email);
    const redirectPath = isAdminUser ? "/submissions" : "/";

    console.log(`[OAuth Callback] User logged in: ${userInfo.email} (admin: ${isAdminUser})`);

    return redirect(redirectPath, {
        headers: {
            "Set-Cookie": sessionCookie,
        },
    });
}
