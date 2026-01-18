/**
 * RBAC Permissions Constants
 * 
 * This file defines all available permissions in the system.
 * Use these constants throughout the app for type safety and consistency.
 */

export interface PermissionDefinition {
	description: string;
	descriptionFi: string;
	category: string;
}

/**
 * All available permissions in the system
 * Key format: "resource:action" or "resource:action:scope"
 */
export const PERMISSIONS = {
	// Users
	"users:read": {
		description: "View user list",
		descriptionFi: "Näytä käyttäjälista",
		category: "Users",
	},
	"users:write": {
		description: "Create and update users",
		descriptionFi: "Luo ja muokkaa käyttäjiä",
		category: "Users",
	},
	"users:delete": {
		description: "Delete users",
		descriptionFi: "Poista käyttäjiä",
		category: "Users",
	},
	"users:manage_roles": {
		description: "Assign roles to users",
		descriptionFi: "Määritä rooleja käyttäjille",
		category: "Users",
	},

	// Inventory
	"inventory:read": {
		description: "View inventory items",
		descriptionFi: "Näytä inventaariotavarat",
		category: "Inventory",
	},
	"inventory:write": {
		description: "Create and edit inventory items",
		descriptionFi: "Luo ja muokkaa inventaariotavaroita",
		category: "Inventory",
	},
	"inventory:delete": {
		description: "Delete inventory items",
		descriptionFi: "Poista inventaariotavaroita",
		category: "Inventory",
	},
	"inventory:export": {
		description: "Export inventory to CSV",
		descriptionFi: "Vie inventaario CSV-tiedostoon",
		category: "Inventory",
	},
	"inventory:import": {
		description: "Import inventory from file",
		descriptionFi: "Tuo inventaario tiedostosta",
		category: "Inventory",
	},

	// Treasury
	"treasury:read": {
		description: "View treasury and transactions",
		descriptionFi: "Näytä kassa ja tapahtumat",
		category: "Treasury",
	},
	"treasury:write": {
		description: "Create transactions",
		descriptionFi: "Luo tapahtumia",
		category: "Treasury",
	},
	"treasury:edit": {
		description: "Edit transactions",
		descriptionFi: "Muokkaa tapahtumia",
		category: "Treasury",
	},
	"treasury:delete": {
		description: "Delete transactions",
		descriptionFi: "Poista tapahtumia",
		category: "Treasury",
	},

	// Reimbursements
	"reimbursements:read": {
		description: "View reimbursement requests",
		descriptionFi: "Näytä korvausvaatimukset",
		category: "Reimbursements",
	},
	"reimbursements:write": {
		description: "Create reimbursement requests",
		descriptionFi: "Luo korvausvaatimuksia",
		category: "Reimbursements",
	},
	"reimbursements:approve": {
		description: "Approve/reject reimbursements",
		descriptionFi: "Hyväksy/hylkää korvausvaatimuksia",
		category: "Reimbursements",
	},
	"reimbursements:delete": {
		description: "Delete reimbursement requests",
		descriptionFi: "Poista korvausvaatimuksia",
		category: "Reimbursements",
	},

	// Purchases
	"purchases:read": {
		description: "View all purchase requests",
		descriptionFi: "Näytä kaikki ostopyynnöt",
		category: "Purchases",
	},
	"purchases:manage": {
		description: "Update purchase status",
		descriptionFi: "Päivitä ostopyynnön tila",
		category: "Purchases",
	},
	"purchases:delete": {
		description: "Delete purchase requests",
		descriptionFi: "Poista ostopyyntöjä",
		category: "Purchases",
	},

	// Submissions
	"submissions:read": {
		description: "View contact form submissions",
		descriptionFi: "Näytä yhteydenottolomakkeet",
		category: "Submissions",
	},
	"submissions:write": {
		description: "Update submission status",
		descriptionFi: "Päivitä yhteydenoton tila",
		category: "Submissions",
	},
	"submissions:delete": {
		description: "Delete submissions",
		descriptionFi: "Poista yhteydenottoja",
		category: "Submissions",
	},

	// Social Links
	"social:read": {
		description: "View social links",
		descriptionFi: "Näytä some-linkit",
		category: "Social",
	},
	"social:write": {
		description: "Create and edit social links",
		descriptionFi: "Luo ja muokkaa some-linkkejä",
		category: "Social",
	},
	"social:delete": {
		description: "Delete social links",
		descriptionFi: "Poista some-linkkejä",
		category: "Social",
	},

	// Minutes
	"minutes:read": {
		description: "View and download minutes",
		descriptionFi: "Näytä ja lataa pöytäkirjat",
		category: "Minutes",
	},
	"minutes:guide": {
		description: "View naming convention guide",
		descriptionFi: "Näytä nimeämiskäytäntöohje",
		category: "Minutes",
	},

	// Events
	"events:read": {
		description: "View calendar events",
		descriptionFi: "Näytä kalenteritapahtumat",
		category: "Events",
	},

	// Profile
	"profile:read:own": {
		description: "View own profile",
		descriptionFi: "Näytä oma profiili",
		category: "Profile",
	},
	"profile:write:own": {
		description: "Edit own profile",
		descriptionFi: "Muokkaa omaa profiilia",
		category: "Profile",
	},

	// Roles (meta-permission)
	"roles:read": {
		description: "View roles and permissions",
		descriptionFi: "Näytä roolit ja oikeudet",
		category: "Roles",
	},
	"roles:write": {
		description: "Create and edit roles",
		descriptionFi: "Luo ja muokkaa rooleja",
		category: "Roles",
	},
	"roles:delete": {
		description: "Delete roles",
		descriptionFi: "Poista rooleja",
		category: "Roles",
	},

	// Settings (access to configuration pages)
	"settings:users": {
		description: "Access user management settings",
		descriptionFi: "Pääsy käyttäjähallinnan asetuksiin",
		category: "Settings",
	},
	"settings:roles": {
		description: "Access role management settings",
		descriptionFi: "Pääsy roolihallinnan asetuksiin",
		category: "Settings",
	},
	"settings:reimbursements": {
		description: "Access reimbursement settings (AI, keywords)",
		descriptionFi: "Pääsy korvausasetusten hallintaan (AI, avainsanat)",
		category: "Settings",
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
export function getPermissionsByCategory(): Record<string, { name: PermissionName; definition: PermissionDefinition }[]> {
	const grouped: Record<string, { name: PermissionName; definition: PermissionDefinition }[]> = {};

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
export const PERMISSION_CATEGORIES = [...new Set(Object.values(PERMISSIONS).map(p => p.category))];

/**
 * Check if a string is a valid permission name
 */
export function isValidPermission(name: string): name is PermissionName {
	return name in PERMISSIONS;
}

/**
 * Get permission definition by name
 */
export function getPermissionDefinition(name: string): PermissionDefinition | undefined {
	return PERMISSIONS[name as PermissionName];
}
