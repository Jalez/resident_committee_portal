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

export interface AuthenticatedUser extends SessionData {
    userId: string;
    roleId: string;
    roleName?: string;
    permissions: string[];
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
// ADMIN CHECK (Used by RBAC for super admin)
// ============================================

/**
 * Check if email matches env ADMIN_EMAIL (super admin)
 */
export function isAdmin(email: string): boolean {
    return email.toLowerCase() === config.adminEmail.toLowerCase();
}

// ============================================
// RBAC PERMISSION SYSTEM
// ============================================

/**
 * Database adapter interface for RBAC operations
 */
interface RBACDatabaseAdapter {
    findUserByEmail: (email: string) => Promise<{ id: string; roleId: string } | null>;
    getUserPermissions: (userId: string) => Promise<string[]>;
    getRoleByName: (name: string) => Promise<{ id: string; permissions: string[] } | null>;
    getRoleById: (id: string) => Promise<{ name: string; permissions: string[] } | null>;
}

/**
 * Get permissions for the Guest role (unauthenticated users)
 * Returns empty array if Guest role doesn't exist
 */
export async function getGuestPermissions(
    getDatabase: () => RBACDatabaseAdapter
): Promise<string[]> {
    const db = getDatabase();
    const guestRole = await db.getRoleByName("Guest");
    return guestRole?.permissions ?? [];
}

/**
 * Check if a permission matches (supports wildcards)
 * e.g., "inventory:*" matches "inventory:read", "inventory:write"
 */
function permissionMatches(userPermission: string, requiredPermission: string): boolean {
    // Exact match
    if (userPermission === requiredPermission) return true;

    // Wildcard match (e.g., "inventory:*" matches "inventory:read")
    if (userPermission.endsWith(":*")) {
        const prefix = userPermission.slice(0, -1); // Remove "*"
        return requiredPermission.startsWith(prefix);
    }

    // Super admin wildcard
    if (userPermission === "*") return true;

    return false;
}

/**
 * Get authenticated user with their permissions
 */
export async function getAuthenticatedUser(
    request: Request,
    getDatabase: () => RBACDatabaseAdapter
): Promise<AuthenticatedUser | null> {
    const session = await getSession(request);
    if (!session) return null;

    const db = getDatabase();
    const dbUser = await db.findUserByEmail(session.email);
    if (!dbUser) return null;

    const permissions = await db.getUserPermissions(dbUser.id);
    const role = await db.getRoleById(dbUser.roleId);

    return {
        ...session,
        userId: dbUser.id,
        roleId: dbUser.roleId,
        roleName: role?.name,
        permissions,
    };
}

/**
 * Check if user has a specific permission
 */
export function hasPermission(user: AuthenticatedUser, permission: string): boolean {
    return user.permissions.some(p => permissionMatches(p, permission));
}

/**
 * Check if user has any of the specified permissions
 */
export function hasAnyPermission(user: AuthenticatedUser, permissions: string[]): boolean {
    return permissions.some(p => hasPermission(user, p));
}

/**
 * Check if user has all of the specified permissions
 */
export function hasAllPermissions(user: AuthenticatedUser, permissions: string[]): boolean {
    return permissions.every(p => hasPermission(user, p));
}

/**
 * Require user to have a specific permission
 * Throws 401 if not authenticated, 403 if missing permission
 */
export async function requirePermission(
    request: Request,
    permission: string,
    getDatabase: () => RBACDatabaseAdapter
): Promise<AuthenticatedUser> {
    const user = await getAuthenticatedUser(request, getDatabase);

    if (!user) {
        throw new Response("Unauthorized", { status: 401 });
    }

    if (!hasPermission(user, permission)) {
        throw new Response(`Forbidden - Missing permission: ${permission}`, { status: 403 });
    }

    return user;
}

/**
 * Require user to have any of the specified permissions
 */
export async function requireAnyPermission(
    request: Request,
    permissions: string[],
    getDatabase: () => RBACDatabaseAdapter
): Promise<AuthenticatedUser> {
    const user = await getAuthenticatedUser(request, getDatabase);

    if (!user) {
        throw new Response("Unauthorized", { status: 401 });
    }

    if (!hasAnyPermission(user, permissions)) {
        throw new Response(`Forbidden - Requires one of: ${permissions.join(", ")}`, { status: 403 });
    }

    return user;
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
