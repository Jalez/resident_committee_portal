/**
 * Seed script for RBAC system
 * Creates default permissions and roles
 * 
 * Run with: bun run scripts/seed-rbac.ts
 */

import "dotenv/config";
import postgres from "postgres";
import { PERMISSIONS, type PermissionName } from "../app/lib/permissions";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
	console.error("DATABASE_URL environment variable is required");
	process.exit(1);
}

const sql = postgres(connectionString);

// Convert PERMISSIONS constant to array format for insertion
const DEFAULT_PERMISSIONS = Object.entries(PERMISSIONS).map(([name, def]) => ({
	name,
	description: def.description,
	category: def.category,
}));

// Default roles with their permissions
const DEFAULT_ROLES = [
	{
		name: "Guest",
		description: "Unauthenticated visitors (public access)",
		color: "bg-zinc-400",
		isSystem: true,
		sortOrder: -1,
		permissions: [
			// Default public pages - can be customized per tenant committee
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
			// Residents also get all public permissions
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
			"reimbursements:approve",
			"submissions:read",
			"submissions:write",
			"social:read",
			"social:write",
			"social:delete",
			"minutes:read",
			"minutes:guide",
		],
	},
	{
		name: "Admin",
		description: "Administrator with full access to all features",
		color: "bg-red-500",
		isSystem: true,
		sortOrder: 2,
		permissions: [
			// All permissions
			...DEFAULT_PERMISSIONS.map(p => p.name),
		],
	},
];

async function seed() {
	console.log("🌱 Starting RBAC seed...\n");

	try {
		// Insert permissions
		console.log("📋 Creating permissions...");
		const permissionMap = new Map<string, string>();

		for (const perm of DEFAULT_PERMISSIONS) {
			const result = await sql`
				INSERT INTO permissions (name, description, category)
				VALUES (${perm.name}, ${perm.description}, ${perm.category})
				ON CONFLICT (name) DO UPDATE SET
					description = EXCLUDED.description,
					category = EXCLUDED.category
				RETURNING id, name
			`;
			permissionMap.set(result[0].name, result[0].id);
			console.log(`  ✓ ${perm.name}`);
		}

		console.log(`\n✅ Created ${DEFAULT_PERMISSIONS.length} permissions\n`);

		// Insert roles
		console.log("👥 Creating roles...");
		for (const role of DEFAULT_ROLES) {
			// Create or update role
			const roleResult = await sql`
				INSERT INTO roles (name, description, color, is_system, sort_order)
				VALUES (${role.name}, ${role.description}, ${role.color}, ${role.isSystem}, ${role.sortOrder})
				ON CONFLICT (name) DO UPDATE SET
					description = EXCLUDED.description,
					color = EXCLUDED.color,
					is_system = EXCLUDED.is_system,
					sort_order = EXCLUDED.sort_order,
					updated_at = NOW()
				RETURNING id
			`;
			const roleId = roleResult[0].id;

			// Clear existing role permissions
			await sql`DELETE FROM role_permissions WHERE role_id = ${roleId}`;

			// Add permissions to role
			for (const permName of role.permissions) {
				const permId = permissionMap.get(permName);
				if (permId) {
					await sql`
						INSERT INTO role_permissions (role_id, permission_id)
						VALUES (${roleId}, ${permId})
					`;
				}
			}

			console.log(`  ✓ ${role.name} (${role.permissions.length} permissions)`);
		}

		console.log(`\n✅ Created ${DEFAULT_ROLES.length} roles\n`);

		// Migrate existing users with legacy roles to new roleId
		console.log("🔄 Migrating existing users...");

		// Get role IDs
		const residentRole = await sql`SELECT id FROM roles WHERE name = 'Resident'`;
		const boardMemberRole = await sql`SELECT id FROM roles WHERE name = 'Board Member'`;
		const adminRole = await sql`SELECT id FROM roles WHERE name = 'Admin'`;

		// Update users without roleId - cast UUIDs properly
		const residentId = residentRole[0]?.id;
		const boardMemberId = boardMemberRole[0]?.id;
		const adminId = adminRole[0]?.id;

		// Update each role type separately to avoid type casting issues
		let migratedCount = 0;

		if (adminId) {
			const adminUsers = await sql`
				UPDATE users SET role_id = ${adminId}::uuid, updated_at = NOW()
				WHERE role = 'admin' AND role_id IS NULL
				RETURNING id
			`;
			migratedCount += adminUsers.length;
		}

		if (boardMemberId) {
			const boardUsers = await sql`
				UPDATE users SET role_id = ${boardMemberId}::uuid, updated_at = NOW()
				WHERE role = 'board_member' AND role_id IS NULL
				RETURNING id
			`;
			migratedCount += boardUsers.length;
		}

		if (residentId) {
			const residentUsers = await sql`
				UPDATE users SET role_id = ${residentId}::uuid, updated_at = NOW()
				WHERE role = 'resident' AND role_id IS NULL
				RETURNING id
			`;
			migratedCount += residentUsers.length;
		}

		console.log(`  ✓ Migrated ${migratedCount} users to new role system\n`);

		console.log("🎉 RBAC seed complete!");

	} catch (error) {
		console.error("❌ Seed failed:", error);
		process.exit(1);
	} finally {
		await sql.end();
	}
}

seed();
