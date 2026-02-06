import { getDatabase } from "~/db";
import { isAdmin, requirePermission } from "~/lib/auth.server";

export async function handleUsersSettingsAction(request: Request) {
	// Check permission
	try {
		await requirePermission(request, "users:manage_roles", getDatabase);
	} catch (_error) {
		return { success: false, error: "unauthorized" };
	}

	const formData = await request.formData();
	const userId = formData.get("userId") as string;
	const roleIds = (formData.getAll("roleIds") as string[]).filter(Boolean);

	if (!userId) {
		return { success: false, error: "missing_fields" };
	}

	try {
		const db = getDatabase();

		// Check if target user is super admin - their role cannot be changed
		const targetUser = await db.getUserWithRole(userId);
		if (targetUser && isAdmin(targetUser.email)) {
			return { success: false, error: "super_admin_protected" };
		}

		await db.setUserRoles(userId, roleIds);

		return { success: true };
	} catch (error) {
		console.error("Failed to update user roles:", error);
		return { success: false, error: "update_failed" };
	}
}
