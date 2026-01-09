import { createCookie } from "react-router";

// ============================================
// CONFIGURATION
// ============================================

// Get the base URL for redirects - works with Vercel preview deployments
function getBaseUrl(): string {
    // Use explicit env var if set
    if (process.env.APP_URL) {
        return process.env.APP_URL;
    }
    // Vercel automatically sets VERCEL_URL for preview deployments
    if (process.env.VERCEL_URL) {
        return `https://${process.env.VERCEL_URL}`;
    }
    // Fallback for local development
    return "http://localhost:5173";
}

const config = {
    oauthClientId: process.env.GOOGLE_OAUTH_CLIENT_ID || "",
    oauthClientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || "",
    adminEmail: process.env.ADMIN_EMAIL || "",
    sessionSecret: process.env.SESSION_SECRET || "dev-secret-change-me",
    redirectUri: `${getBaseUrl()}/auth/callback`,
};

// Debug log
console.log("[Auth Config]", {
    oauthClientId: config.oauthClientId ? "SET" : "MISSING",
    oauthClientSecret: config.oauthClientSecret ? "SET" : "MISSING",
    adminEmail: config.adminEmail || "MISSING",
    sessionSecret: config.sessionSecret ? "SET" : "MISSING",
});

// ============================================
// SESSION COOKIE
// ============================================

const sessionCookie = createCookie("__session", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 1 week
    secrets: [config.sessionSecret],
});

export interface SessionData {
    email: string;
    name?: string;
    picture?: string;
}

export async function createSession(data: SessionData): Promise<string> {
    return sessionCookie.serialize(data);
}

export async function getSession(request: Request): Promise<SessionData | null> {
    const cookieHeader = request.headers.get("Cookie");
    if (!cookieHeader) return null;

    try {
        const data = await sessionCookie.parse(cookieHeader);
        if (data && typeof data.email === "string") {
            return data as SessionData;
        }
        return null;
    } catch {
        return null;
    }
}

export async function destroySession(): Promise<string> {
    return sessionCookie.serialize({}, { maxAge: 0 });
}

// ============================================
// ADMIN AUTHORIZATION
// ============================================

export function isAdmin(email: string): boolean {
    return email.toLowerCase() === config.adminEmail.toLowerCase();
}

export async function requireAdmin(request: Request): Promise<SessionData> {
    const session = await getSession(request);

    if (!session) {
        throw new Response("Unauthorized", { status: 401 });
    }

    if (!isAdmin(session.email)) {
        throw new Response("Forbidden", { status: 403 });
    }

    return session;
}

// ============================================
// GOOGLE OAUTH 2.0
// ============================================

export function getGoogleAuthUrl(): string {
    const params = new URLSearchParams({
        client_id: config.oauthClientId,
        redirect_uri: config.redirectUri,
        response_type: "code",
        scope: "openid email profile",
        access_type: "online",
        prompt: "select_account",
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

interface GoogleTokenResponse {
    access_token: string;
    id_token: string;
    token_type: string;
    expires_in: number;
}

interface GoogleUserInfo {
    email: string;
    name?: string;
    picture?: string;
}

export async function exchangeCodeForTokens(code: string): Promise<GoogleTokenResponse | null> {
    try {
        const res = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                code,
                client_id: config.oauthClientId,
                client_secret: config.oauthClientSecret,
                redirect_uri: config.redirectUri,
                grant_type: "authorization_code",
            }),
        });

        if (!res.ok) {
            console.error("[OAuth] Token exchange failed:", await res.text());
            return null;
        }

        return await res.json();
    } catch (error) {
        console.error("[OAuth] Token exchange error:", error);
        return null;
    }
}

export async function getUserInfo(accessToken: string): Promise<GoogleUserInfo | null> {
    try {
        const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!res.ok) {
            console.error("[OAuth] User info fetch failed:", await res.text());
            return null;
        }

        return await res.json();
    } catch (error) {
        console.error("[OAuth] User info error:", error);
        return null;
    }
}
