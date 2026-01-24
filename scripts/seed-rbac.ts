/**
 * Seed script for RBAC system
 * Creates default roles with their permissions
 *
 * IMPORTANT: This script only creates roles. Permissions are defined in
 * app/lib/permissions.ts and stored as arrays on roles.
 *
 * Run with: bun run scripts/seed-rbac.ts
 */

import "dotenv/config";
import postgres from "postgres";
import { PERMISSIONS } from "../app/lib/permissions";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
	console.error("DATABASE_URL environment variable is required");
	process.exit(1);
}

const sql = postgres(connectionString);

// Get all permission names from permissions.ts
const ALL_PERMISSIONS = Object.keys(PERMISSIONS);

// Default roles with their permissions (stored as array on role)
const DEFAULT_ROLES = [
	{
		name: "Guest",
		description: "Unauthenticated visitors (public access)",
		color: "bg-zinc-400",
		isSystem: true,
		sortOrder: -1,
		permissions: [
			"inventory:read",
			"treasury:read",
			"minutes:read",
			"social:read",
			"events:read",
		],
	},
	{
		name: "Resident",
		description: "Regular resident with basic access",
		color: "bg-slate-500",
		isSystem: true,
		sortOrder: 0,
		permissions: [
			"profile:read:own",
			"profile:write:own",
			"inventory:read",
			"treasury:read",
			"minutes:read",
			"social:read",
			"events:read",
		],
	},
	{
		name: "Board Member",
		description: "Committee member with staff privileges",
		color: "bg-blue-500",
		isSystem: true,
		sortOrder: 1,
		permissions: [
			"profile:read:own",
			"profile:write:own",
			"inventory:read",
			"inventory:write",
			"inventory:delete",
			"treasury:read",
			"treasury:write",
			"treasury:edit",
			"reimbursements:read",
			"reimbursements:write",
			"reimbursements:delete",
			"submissions:read",
			"submissions:write",
			"social:read",
			"social:write",
			"social:delete",
			"minutes:read",
			"minutes:guide",
			"events:read",
		],
	},
	{
		name: "Admin",
		description: "Administrator with full access to all features",
		color: "bg-red-500",
		isSystem: true,
		sortOrder: 2,
		permissions: ALL_PERMISSIONS, // All permissions
	},
];

async function seed() {
	console.log("🌱 Starting RBAC seed...\n");

	try {
		// Create roles with permissions array
		console.log("👥 Creating roles with permissions...");
		for (const role of DEFAULT_ROLES) {
			await sql`
				INSERT INTO roles (name, description, color, is_system, sort_order, permissions)
				VALUES (${role.name}, ${role.description}, ${role.color}, ${role.isSystem}, ${role.sortOrder}, ${role.permissions})
				ON CONFLICT (name) DO UPDATE SET
					description = EXCLUDED.description,
					color = EXCLUDED.color,
					is_system = EXCLUDED.is_system,
					sort_order = EXCLUDED.sort_order,
					permissions = EXCLUDED.permissions,
					updated_at = NOW()
			`;

			console.log(`  ✓ ${role.name} (${role.permissions.length} permissions)`);
		}

		console.log(`\n✅ Created ${DEFAULT_ROLES.length} roles\n`);
		console.log("🎉 RBAC seed complete!");
	} catch (error) {
		console.error("❌ Seed failed:", error);
		process.exit(1);
	} finally {
		await sql.end();
	}
}

seed();
