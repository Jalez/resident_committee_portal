import { redirect, type LoaderFunctionArgs } from "react-router";
import {
    exchangeCodeForTokens,
    getUserInfo,
    createSession,
    isAdmin
} from "~/lib/auth.server";

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

    // Check if user is admin
    if (!isAdmin(userInfo.email)) {
        console.log("[OAuth Callback] Non-admin login attempt:", userInfo.email);
        return redirect("/?error=not_admin");
    }

    // Create session
    const sessionCookie = await createSession({
        email: userInfo.email,
        name: userInfo.name,
        picture: userInfo.picture,
    });

    console.log("[OAuth Callback] Admin logged in:", userInfo.email);

    // Redirect to admin board with session cookie
    return redirect("/admin/board", {
        headers: {
            "Set-Cookie": sessionCookie,
        },
    });
}
