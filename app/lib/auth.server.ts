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

import { getSystemLanguageDefaults } from "./settings.server";

export interface AuthenticatedUser extends SessionData {
	userId: string;
	roleName?: string;
	permissions: string[];
	// Language preferences
	primaryLanguage: string;
	secondaryLanguage: string;
	// Local AI model preferences
	localOllamaEnabled: boolean;
	localOllamaUrl: string;
}

export async function createSession(data: SessionData): Promise<string> {
	return sessionCookie.serialize(data);
}

export async function getSession(
	request: Request,
): Promise<SessionData | null> {
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
export interface RBACDatabaseAdapter {
	findUserByEmail: (email: string) => Promise<{
		id: string;
		primaryLanguage: string;
		secondaryLanguage: string;
		localOllamaEnabled: boolean;
		localOllamaUrl: string;
	} | null>;
	getUserPermissions: (userId: string) => Promise<string[]>;
	getUserRoleIds: (userId: string) => Promise<string[]>;
	getRoleByName: (
		name: string,
	) => Promise<{ id: string; permissions: string[] } | null>;
	getRoleById: (
		id: string,
	) => Promise<{ name: string; permissions: string[] } | null>;
}

/**
 * Get permissions for the Guest role (unauthenticated users)
 * Returns empty array if Guest role doesn't exist
 */
export async function getGuestPermissions(
	getDatabase: () => RBACDatabaseAdapter,
): Promise<string[]> {
	const db = getDatabase();
	const guestRole = await db.getRoleByName("Guest");
	return guestRole?.permissions ?? [];
}

/**
 * Get context for guest users (permissions + default languages)
 */
export async function getGuestContext(
	getDatabase: () => RBACDatabaseAdapter,
): Promise<{
	permissions: string[];
	languages: { primary: string; secondary: string };
}> {
	const [permissions, languages] = await Promise.all([
		getGuestPermissions(getDatabase),
		getSystemLanguageDefaults(),
	]);
	return { permissions, languages };
}

/**
 * Check if a permission matches (supports wildcards)
 * e.g., "inventory:*" matches "inventory:read", "inventory:write"
 */
function permissionMatches(
	userPermission: string,
	requiredPermission: string,
): boolean {
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
	getDatabase: () => RBACDatabaseAdapter,
): Promise<AuthenticatedUser | null> {
	const session = await getSession(request);
	if (!session) return null;

	const db = getDatabase();
	const dbUser = await db.findUserByEmail(session.email);
	if (!dbUser) return null;

	const permissions = await db.getUserPermissions(dbUser.id);
	const roleIds = await db.getUserRoleIds(dbUser.id);
	const firstRole =
		roleIds.length > 0 ? await db.getRoleById(roleIds[0]) : null;

	return {
		...session,
		userId: dbUser.id,
		roleName: firstRole?.name,
		permissions,
		primaryLanguage: dbUser.primaryLanguage,
		secondaryLanguage: dbUser.secondaryLanguage,
		localOllamaEnabled: dbUser.localOllamaEnabled,
		localOllamaUrl: dbUser.localOllamaUrl,
	};
}

/**
 * Check if user has a specific permission
 */
export function hasPermission(
	user: AuthenticatedUser,
	permission: string,
): boolean {
	return user.permissions.some((p) => permissionMatches(p, permission));
}

/**
 * Check if user has any of the specified permissions
 */
export function hasAnyPermission(
	user: AuthenticatedUser,
	permissions: string[],
): boolean {
	return permissions.some((p) => hasPermission(user, p));
}

/**
 * Check if user has all of the specified permissions
 */
export function hasAllPermissions(
	user: AuthenticatedUser,
	permissions: string[],
): boolean {
	return permissions.every((p) => hasPermission(user, p));
}

/**
 * Get authenticated user, falling back to a guest user if no session exists.
 * The guest user gets permissions from the "Guest" role in the database.
 */
async function getOrGuestUser(
	request: Request,
	getDatabase: () => RBACDatabaseAdapter,
): Promise<AuthenticatedUser> {
	const user = await getAuthenticatedUser(request, getDatabase);
	if (user) return user;

	const { permissions, languages } = await getGuestContext(getDatabase);
	return {
		userId: "guest",
		email: "",
		name: "Guest",
		roleName: "Guest",
		permissions,
		primaryLanguage: languages.primary,
		secondaryLanguage: languages.secondary,
		localOllamaEnabled: false,
		localOllamaUrl: "",
	};
}

/**
 * Require user to have a specific permission.
 * Guests (unauthenticated) are checked against the "Guest" role permissions.
 * Throws 401 if a guest lacks permission (to redirect to login), 403 if an authenticated user lacks permission.
 */
export async function requirePermission(
	request: Request,
	permission: string,
	getDatabase: () => RBACDatabaseAdapter,
): Promise<AuthenticatedUser> {
	const user = await getOrGuestUser(request, getDatabase);

	if (!hasPermission(user, permission)) {
		const isGuest = user.userId === "guest";
		throw new Response(
			isGuest
				? "Unauthorized"
				: `Forbidden - Missing permission: ${permission}`,
			{ status: isGuest ? 401 : 403 },
		);
	}

	return user;
}

/**
 * Require user to have any of the specified permissions.
 * Guests (unauthenticated) are checked against the "Guest" role permissions.
 * Throws 401 if a guest lacks permission, 403 if an authenticated user lacks permission.
 */
export async function requireAnyPermission(
	request: Request,
	permissions: string[],
	getDatabase: () => RBACDatabaseAdapter,
): Promise<AuthenticatedUser> {
	const user = await getOrGuestUser(request, getDatabase);

	if (!hasAnyPermission(user, permissions)) {
		const isGuest = user.userId === "guest";
		throw new Response(
			isGuest
				? "Unauthorized"
				: `Forbidden - Requires one of: ${permissions.join(", ")}`,
			{ status: isGuest ? 401 : 403 },
		);
	}

	return user;
}

/**
 * Check if user can edit/delete their own item
 * Returns true if user has the self permission AND the item's createdBy matches user's userId
 */
export function canEditSelf(
	user: AuthenticatedUser,
	itemCreatedBy: string | null | undefined,
	selfPermission: string,
): boolean {
	if (!itemCreatedBy) {
		// Items without createdBy (existing records) cannot be edited with self permissions
		return false;
	}
	return hasPermission(user, selfPermission) && itemCreatedBy === user.userId;
}

/**
 * Check if user can delete their own item
 * Returns true if user has the self permission AND the item's createdBy matches user's userId
 */
export function canDeleteSelf(
	user: AuthenticatedUser,
	itemCreatedBy: string | null | undefined,
	selfPermission: string,
): boolean {
	if (!itemCreatedBy) {
		// Items without createdBy (existing records) cannot be deleted with self permissions
		return false;
	}
	return hasPermission(user, selfPermission) && itemCreatedBy === user.userId;
}

/**
 * Require user to have either general permission OR self permission with ownership.
 * Guests (unauthenticated) are checked against the "Guest" role permissions.
 */
export async function requirePermissionOrSelf(
	request: Request,
	generalPermission: string,
	selfPermission: string | undefined,
	itemCreatedBy: string | null | undefined,
	getDatabase: () => RBACDatabaseAdapter,
): Promise<AuthenticatedUser> {
	const user = await getOrGuestUser(request, getDatabase);

	// Check general permission first
	if (hasPermission(user, generalPermission)) {
		return user;
	}

	// Check self permission with ownership
	if (selfPermission && canEditSelf(user, itemCreatedBy, selfPermission)) {
		return user;
	}

	const isGuest = user.userId === "guest";
	throw new Response(
		isGuest
			? "Unauthorized"
			: `Forbidden - Missing permission: ${generalPermission}${selfPermission ? ` or ${selfPermission} (with ownership)` : ""}`,
		{ status: isGuest ? 401 : 403 },
	);
}

/**
 * Require user to have either general delete permission OR self delete permission with ownership.
 * Guests (unauthenticated) are checked against the "Guest" role permissions.
 */
export async function requireDeletePermissionOrSelf(
	request: Request,
	generalPermission: string,
	selfPermission: string | undefined,
	itemCreatedBy: string | null | undefined,
	getDatabase: () => RBACDatabaseAdapter,
): Promise<AuthenticatedUser> {
	const user = await getOrGuestUser(request, getDatabase);

	// Check general permission first
	if (hasPermission(user, generalPermission)) {
		return user;
	}

	// Check self permission with ownership
	if (selfPermission && canDeleteSelf(user, itemCreatedBy, selfPermission)) {
		return user;
	}

	const isGuest = user.userId === "guest";
	throw new Response(
		isGuest
			? "Unauthorized"
			: `Forbidden - Missing permission: ${generalPermission}${selfPermission ? ` or ${selfPermission} (with ownership)` : ""}`,
		{ status: isGuest ? 401 : 403 },
	);
}

// ============================================
// GOOGLE OAUTH 2.0
// ============================================

export function getGoogleAuthUrl(): string {
	const params = new URLSearchParams({
		client_id: config.oauthClientId,
		redirect_uri: config.redirectUri,
		response_type: "code",
		// Request only basic profile info
		scope: "openid email profile",
		access_type: "offline", // Required to get a refresh token
		prompt: "consent select_account", // Force consent screen to ensure we get a refresh token
	});

	return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

interface GoogleTokenResponse {
	access_token: string;
	id_token: string;
	token_type: string;
	expires_in: number;
	refresh_token?: string; // Only returned if access_type=offline and prompt=consent
	scope?: string;
}

interface GoogleUserInfo {
	email: string;
	name?: string;
	picture?: string;
}

export async function exchangeCodeForTokens(
	code: string,
): Promise<GoogleTokenResponse | null> {
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

export async function getUserInfo(
	accessToken: string,
): Promise<GoogleUserInfo | null> {
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
