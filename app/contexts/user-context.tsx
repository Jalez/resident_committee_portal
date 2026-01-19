import { createContext, useContext, type ReactNode } from "react";
import type { PermissionName } from "~/lib/permissions";

/**
 * User data exposed to client-side components
 */
export interface ClientUser {
	userId: string;
	email: string;
	name?: string;
	roleName: string;
	roleId: string;
	permissions: string[];
}

interface UserContextValue {
	user: ClientUser | null;
	/** Check if user has a specific permission */
	hasPermission: (permission: PermissionName | string) => boolean;
	/** Check if user has any of the specified permissions */
	hasAnyPermission: (permissions: (PermissionName | string)[]) => boolean;
	/** Check if user has all of the specified permissions */
	hasAllPermissions: (permissions: (PermissionName | string)[]) => boolean;
}

const UserContext = createContext<UserContextValue | null>(null);

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

interface UserProviderProps {
	children: ReactNode;
	user: ClientUser | null;
}

export function UserProvider({ children, user }: UserProviderProps) {
	const hasPermission = (permission: PermissionName | string): boolean => {
		if (!user) return false;
		return user.permissions.some(p => permissionMatches(p, permission));
	};

	const hasAnyPermission = (permissions: (PermissionName | string)[]): boolean => {
		return permissions.some(p => hasPermission(p));
	};

	const hasAllPermissions = (permissions: (PermissionName | string)[]): boolean => {
		return permissions.every(p => hasPermission(p));
	};

	return (
		<UserContext.Provider value={{ user, hasPermission, hasAnyPermission, hasAllPermissions }}>
			{children}
		</UserContext.Provider>
	);
}

/**
 * Hook to access user and permission checking functions
 * @throws Error if used outside of UserProvider
 */
export function useUser(): UserContextValue {
	const context = useContext(UserContext);
	if (!context) {
		throw new Error("useUser must be used within a UserProvider");
	}
	return context;
}

/**
 * Hook to check if user is authenticated
 */
export function useIsAuthenticated(): boolean {
	const { user } = useUser();
	return user !== null;
}

/**
 * Shorthand hook for checking a single permission
 */
export function usePermission(permission: PermissionName | string): boolean {
	const { hasPermission } = useUser();
	return hasPermission(permission);
}
