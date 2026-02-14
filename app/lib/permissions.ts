/**
 * RBAC Permissions - Single Source of Truth
 *
 * This file defines ALL available permissions in the system.
 * Use these constants throughout the app for type safety and consistency.
 *
 * IMPORTANT: To add a new permission:
 * 1. Add the permission definition below (key + translationKey + category)
 * 2. Add translations to all locale files in public/locales/{lang}/common.json
 * 3. Assign it to roles via the admin UI or update scripts/seed-rbac.ts
 *
 * Permission format: "resource:action" or "resource:action:scope"
 * Examples: "inventory:write", "profile:read:own"
 */

export interface PermissionDefinition {
	translationKey: string;
	category: string;
}

/**
 * Convert a permission name to its translation key
 * Example: "users:read" -> "permissions.users.read"
 * Example: "profile:read:own" -> "permissions.profile.read.own"
 */
export function getPermissionTranslationKey(
	permissionName: PermissionName,
): string {
	// Convert colons to dots and prepend "permissions."
	return `permissions.${permissionName.replace(/:/g, ".")}`;
}

/**
 * All available permissions in the system
 * Key format: "resource:action" or "resource:action:scope"
 */
export const PERMISSIONS = {
	// Users
	"users:read": {
		translationKey: "permissions.users.read",
		category: "Users",
	},
	"users:write": {
		translationKey: "permissions.users.write",
		category: "Users",
	},
	"users:delete": {
		translationKey: "permissions.users.delete",
		category: "Users",
	},
	"users:manage_roles": {
		translationKey: "permissions.users.manage_roles",
		category: "Users",
	},

	// Inventory
	"inventory:read": {
		translationKey: "permissions.inventory.read",
		category: "Inventory",
	},
	"inventory:write": {
		translationKey: "permissions.inventory.write",
		category: "Inventory",
	},
	"inventory:delete": {
		translationKey: "permissions.inventory.delete",
		category: "Inventory",
	},
	"inventory:export": {
		translationKey: "permissions.inventory.export",
		category: "Inventory",
	},
	"inventory:import": {
		translationKey: "permissions.inventory.import",
		category: "Inventory",
	},

	// Treasury
	"treasury:read": {
		translationKey: "permissions.treasury.read",
		category: "Treasury",
	},
	"treasury:breakdown:read": {
		translationKey: "permissions.treasury.breakdown.read",
		category: "Treasury",
	},
	"treasury:export": {
		translationKey: "permissions.treasury.export",
		category: "Treasury",
	},
	"treasury:import": {
		translationKey: "permissions.treasury.import",
		category: "Treasury",
	},
	"treasury:transactions:read": {
		translationKey: "permissions.treasury.transactions.read",
		category: "Treasury",
	},
	"treasury:transactions:write": {
		translationKey: "permissions.treasury.transactions.write",
		category: "Treasury",
	},
	"treasury:transactions:write-self": {
		translationKey: "permissions.treasury.transactions.write-self",
		category: "Treasury",
	},
	"treasury:transactions:update": {
		translationKey: "permissions.treasury.transactions.update",
		category: "Treasury",
	},
	"treasury:transactions:delete": {
		translationKey: "permissions.treasury.transactions.delete",
		category: "Treasury",
	},
	"treasury:transactions:update-self": {
		translationKey: "permissions.treasury.transactions.update-self",
		category: "Treasury",
	},
	"treasury:transactions:delete-self": {
		translationKey: "permissions.treasury.transactions.delete-self",
		category: "Treasury",
	},
	"treasury:transactions:read-self": {
		translationKey: "permissions.treasury.transactions.read-self",
		category: "Treasury",
	},
	"treasury:reimbursements:read": {
		translationKey: "permissions.treasury.reimbursements.read",
		category: "Treasury",
	},
	"treasury:reimbursements:write": {
		translationKey: "permissions.treasury.reimbursements.write",
		category: "Treasury",
	},
	"treasury:reimbursements:write-self": {
		translationKey: "permissions.treasury.reimbursements.write-self",
		category: "Treasury",
	},
	"treasury:reimbursements:update": {
		translationKey: "permissions.treasury.reimbursements.update",
		category: "Treasury",
	},
	"treasury:reimbursements:delete": {
		translationKey: "permissions.treasury.reimbursements.delete",
		category: "Treasury",
	},
	"treasury:reimbursements:update-self": {
		translationKey: "permissions.treasury.reimbursements.update-self",
		category: "Treasury",
	},
	"treasury:reimbursements:delete-self": {
		translationKey: "permissions.treasury.reimbursements.delete-self",
		category: "Treasury",
	},
	"treasury:reimbursements:read-self": {
		translationKey: "permissions.treasury.reimbursements.read-self",
		category: "Treasury",
	},
	"treasury:budgets:read": {
		translationKey: "permissions.treasury.budgets.read",
		category: "Treasury",
	},
	"treasury:budgets:read-self": {
		translationKey: "permissions.treasury.budgets.read-self",
		category: "Treasury",
	},
	"treasury:budgets:write": {
		translationKey: "permissions.treasury.budgets.write",
		category: "Treasury",
	},
	"treasury:budgets:write-self": {
		translationKey: "permissions.treasury.budgets.write-self",
		category: "Treasury",
	},
	"treasury:budgets:update": {
		translationKey: "permissions.treasury.budgets.update",
		category: "Treasury",
	},
	"treasury:budgets:delete": {
		translationKey: "permissions.treasury.budgets.delete",
		category: "Treasury",
	},
	"treasury:budgets:update-self": {
		translationKey: "permissions.treasury.budgets.update-self",
		category: "Treasury",
	},
	"treasury:budgets:delete-self": {
		translationKey: "permissions.treasury.budgets.delete-self",
		category: "Treasury",
	},
	"treasury:receipts:read": {
		translationKey: "permissions.treasury.receipts.read",
		category: "Treasury",
	},
	"treasury:receipts:read-self": {
		translationKey: "permissions.treasury.receipts.read-self",
		category: "Treasury",
	},
	"treasury:receipts:write": {
		translationKey: "permissions.treasury.receipts.write",
		category: "Treasury",
	},
	"treasury:receipts:write-self": {
		translationKey: "permissions.treasury.receipts.write-self",
		category: "Treasury",
	},
	"treasury:receipts:update": {
		translationKey: "permissions.treasury.receipts.update",
		category: "Treasury",
	},
	"treasury:receipts:delete": {
		translationKey: "permissions.treasury.receipts.delete",
		category: "Treasury",
	},
	"treasury:receipts:update-self": {
		translationKey: "permissions.treasury.receipts.update-self",
		category: "Treasury",
	},
	"treasury:receipts:delete-self": {
		translationKey: "permissions.treasury.receipts.delete-self",
		category: "Treasury",
	},

	// Purchases
	"purchases:read": {
		translationKey: "permissions.purchases.read",
		category: "Purchases",
	},
	"purchases:manage": {
		translationKey: "permissions.purchases.manage",
		category: "Purchases",
	},
	"purchases:delete": {
		translationKey: "permissions.purchases.delete",
		category: "Purchases",
	},

	// Submissions
	"submissions:read": {
		translationKey: "permissions.submissions.read",
		category: "Submissions",
	},
	"submissions:write": {
		translationKey: "permissions.submissions.write",
		category: "Submissions",
	},
	"submissions:delete": {
		translationKey: "permissions.submissions.delete",
		category: "Submissions",
	},

	// Social Links
	"social:read": {
		translationKey: "permissions.social.read",
		category: "Social",
	},
	"social:write": {
		translationKey: "permissions.social.write",
		category: "Social",
	},
	"social:delete": {
		translationKey: "permissions.social.delete",
		category: "Social",
	},

	// Minutes
	"minutes:read": {
		translationKey: "permissions.minutes.read",
		category: "Minutes",
	},
	"minutes:guide": {
		translationKey: "permissions.minutes.guide",
		category: "Minutes",
	},
	"minutes:write": {
		translationKey: "permissions.minutes.write",
		category: "Minutes",
	},
	"minutes:update": {
		translationKey: "permissions.minutes.update",
		category: "Minutes",
	},
	"minutes:delete": {
		translationKey: "permissions.minutes.delete",
		category: "Minutes",
	},

	// Events
	"events:read": {
		translationKey: "permissions.events.read",
		category: "Events",
	},
	"events:write": {
		translationKey: "permissions.events.write",
		category: "Events",
	},
	"events:update": {
		translationKey: "permissions.events.update",
		category: "Events",
	},
	"events:delete": {
		translationKey: "permissions.events.delete",
		category: "Events",
	},

	// News
	"news:read": {
		translationKey: "permissions.news.read",
		category: "News",
	},
	"news:write": {
		translationKey: "permissions.news.write",
		category: "News",
	},
	"news:update": {
		translationKey: "permissions.news.update",
		category: "News",
	},
	"news:delete": {
		translationKey: "permissions.news.delete",
		category: "News",
	},

	// FAQ
	"faq:read": {
		translationKey: "permissions.faq.read",
		category: "FAQ",
	},
	"faq:write": {
		translationKey: "permissions.faq.write",
		category: "FAQ",
	},
	"faq:update": {
		translationKey: "permissions.faq.update",
		category: "FAQ",
	},
	"faq:delete": {
		translationKey: "permissions.faq.delete",
		category: "FAQ",
	},

	// Forms
	"forms:read": {
		translationKey: "permissions.forms.read",
		category: "Forms",
	},
	"forms:export": {
		translationKey: "permissions.forms.export",
		category: "Forms",
	},

	// Polls
	"polls:read": {
		translationKey: "permissions.polls.read",
		category: "Polls",
	},
	"polls:write": {
		translationKey: "permissions.polls.write",
		category: "Polls",
	},
	"polls:update": {
		translationKey: "permissions.polls.update",
		category: "Polls",
	},
	"polls:delete": {
		translationKey: "permissions.polls.delete",
		category: "Polls",
	},

	// Profile
	"profile:read:own": {
		translationKey: "permissions.profile.read.own",
		category: "Profile",
	},
	"profile:write:own": {
		translationKey: "permissions.profile.write.own",
		category: "Profile",
	},

	// Admin - Storage Management
	"admin:storage:read": {
		translationKey: "permissions.admin.storage.read",
		category: "Admin",
	},
	"admin:storage:write": {
		translationKey: "permissions.admin.storage.write",
		category: "Admin",
	},

	// Avatars (blob storage admin)
	"avatars:read": {
		translationKey: "permissions.avatars.read",
		category: "Storage",
	},
	"avatars:delete": {
		translationKey: "permissions.avatars.delete",
		category: "Storage",
	},

	// Roles (meta-permission)
	"roles:read": {
		translationKey: "permissions.roles.read",
		category: "Roles",
	},
	"roles:write": {
		translationKey: "permissions.roles.write",
		category: "Roles",
	},
	"roles:delete": {
		translationKey: "permissions.roles.delete",
		category: "Roles",
	},

	// Settings (access to configuration pages)
	"settings:general": {
		translationKey: "permissions.settings.general",
		category: "Settings",
	},
	"settings:users": {
		translationKey: "permissions.settings.users",
		category: "Settings",
	},
	"settings:roles": {
		translationKey: "permissions.settings.roles",
		category: "Settings",
	},
	"settings:reimbursements": {
		translationKey: "permissions.settings.reimbursements",
		category: "Settings",
	},
	"settings:analytics": {
		translationKey: "permissions.settings.analytics",
		category: "Settings",
	},
	"settings:news": {
		translationKey: "permissions.settings.news",
		category: "Settings",
	},
	"settings:faqs": {
		translationKey: "permissions.settings.faqs",
		category: "Settings",
	},
	"settings:receipts": {
		translationKey: "permissions.settings.receipts",
		category: "Settings",
	},
	"settings:relationship-context": {
		translationKey: "permissions.settings.source.context",
		category: "Settings",
	},

	// Committee email (direct communication)
	"committee:email": {
		translationKey: "permissions.committee.email",
		category: "Committee",
	},
	"committee:read": {
		translationKey: "permissions.committee.read",
		category: "Committee",
	},
} as const;

/**
 * Permission name type (union of all permission keys)
 */
export type PermissionName = keyof typeof PERMISSIONS;

/**
 * Get all permission names as an array
 */
export const PERMISSION_NAMES = Object.keys(PERMISSIONS) as PermissionName[];

/**
 * Get permissions grouped by category
 */
export function getPermissionsByCategory(): Record<
	string,
	{ name: PermissionName; definition: PermissionDefinition }[]
> {
	const grouped: Record<
		string,
		{ name: PermissionName; definition: PermissionDefinition }[]
	> = {};

	for (const [name, definition] of Object.entries(PERMISSIONS)) {
		const category = definition.category;
		if (!grouped[category]) {
			grouped[category] = [];
		}
		grouped[category].push({ name: name as PermissionName, definition });
	}

	return grouped;
}

/**
 * Get all unique categories
 */
export const PERMISSION_CATEGORIES = [
	...new Set(Object.values(PERMISSIONS).map((p) => p.category)),
];

/**
 * Check if a string is a valid permission name
 */
export function isValidPermission(name: string): name is PermissionName {
	return name in PERMISSIONS;
}

/**
 * Get permission definition by name
 */
export function getPermissionDefinition(
	name: string,
): PermissionDefinition | undefined {
	return PERMISSIONS[name as PermissionName];
}
