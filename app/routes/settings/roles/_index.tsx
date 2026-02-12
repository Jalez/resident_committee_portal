import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useActionData } from "react-router";
import { toast } from "sonner";
import { PageHeader } from "~/components/layout/page-header";
import { PageWrapper } from "~/components/layout/page-layout";
import { PermissionsTable } from "~/components/settings/permissions-table";
import { RoleList } from "~/components/settings/role-list";
import { getDatabase } from "~/db/server";
import { requirePermission } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import { getSystemLanguageDefaults } from "~/lib/settings.server";
import type { Route } from "./+types/_index";

export function meta({ data }: Route.MetaArgs) {
	return [
		{
			title: `${data?.siteConfig?.name || "Portal"} - Roolihallinta / Roles`,
		},
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request }: Route.LoaderArgs) {
	try {
		await requirePermission(request, "settings:roles", getDatabase);
	} catch (_error) {
		throw new Response("Not Found", { status: 404 });
	}

	const db = getDatabase();
	const roles = await db.getAllRoles();

	const rolesWithPermissions = roles.map((role) => ({
		...role,
		permissionCount: role.permissions.length,
	}));

	const systemLanguages = await getSystemLanguageDefaults();
	return {
		siteConfig: SITE_CONFIG,
		roles: rolesWithPermissions,
		systemLanguages,
	};
}

export async function action({ request }: Route.ActionArgs) {
	const db = getDatabase();
	const formData = await request.formData();
	const actionType = formData.get("_action") as string;

	try {
		if (actionType === "delete") {
			await requirePermission(request, "roles:delete", getDatabase);
		} else {
			await requirePermission(request, "roles:write", getDatabase);
		}
	} catch (_error) {
		throw new Response("Not Found", { status: 404 });
	}

	if (actionType === "create") {
		const name = formData.get("name") as string;
		const description = formData.get("description") as string;
		const color = (formData.get("color") as string) || "bg-gray-500";

		if (name) {
			await db.createRole({
				name,
				description,
				color,
				isSystem: false,
				sortOrder: 99,
				permissions: [],
			});
		}
	}

	if (actionType === "update") {
		const roleId = formData.get("roleId") as string;
		const name = formData.get("name") as string;
		const description = formData.get("description") as string;
		const color = formData.get("color") as string;

		if (roleId) {
			await db.updateRole(roleId, { name, description, color });
		}
	}

	if (actionType === "delete") {
		const roleId = formData.get("roleId") as string;
		if (roleId) {
			try {
				await db.deleteRole(roleId);
			} catch (_error) {
				return { error: "Cannot delete system role" };
			}
		}
	}

	if (actionType === "updatePermissions") {
		const roleId = formData.get("roleId") as string;
		const permissions = formData.getAll("permissions") as string[];

		if (roleId) {
			await db.updateRole(roleId, { permissions });
		}
	}

	return { success: true, action: actionType };
}

export default function AdminRoles({ loaderData }: Route.ComponentProps) {
	const { roles, systemLanguages } = loaderData;
	const { t } = useTranslation();

	const [selectedRole, setSelectedRole] = useState<string | null>(null);
	const [checkedPermissions, setCheckedPermissions] = useState<Set<string>>(
		new Set(),
	);
	const actionData = useActionData<{
		success?: boolean;
		action?: string;
		error?: string;
	}>();

	useEffect(() => {
		if (actionData?.success && actionData.action === "updatePermissions") {
			toast.success("Oikeudet päivitetty / Permissions updated");
			if (selectedRole) {
				const updatedRole = roles.find((r) => r.id === selectedRole);
				if (updatedRole) {
					setCheckedPermissions(new Set(updatedRole.permissions));
				}
			}
		} else if (actionData?.error) {
			toast.error(actionData.error);
		}
	}, [actionData, selectedRole, roles]);

	const selectedRoleData = roles.find((r) => r.id === selectedRole);

	useEffect(() => {
		if (selectedRoleData) {
			setCheckedPermissions(new Set(selectedRoleData.permissions));
		} else {
			setCheckedPermissions(new Set());
		}
	}, [selectedRoleData]);

	const handleRoleChange = (roleId: string) => {
		setSelectedRole(roleId);
	};

	const handlePermissionToggle = useCallback(
		(permissionId: string, checked: boolean) => {
			setCheckedPermissions((prev) => {
				const newSet = new Set(prev);
				if (checked) {
					newSet.add(permissionId);
				} else {
					newSet.delete(permissionId);
				}
				return newSet;
			});
		},
		[],
	);

	const handleSelectAllVisible = useCallback(
		(ids: string[], checked: boolean) => {
			setCheckedPermissions((prev) => {
				const newSet = new Set(prev);
				if (checked) {
					for (const id of ids) {
						newSet.add(id);
					}
				} else {
					for (const id of ids) {
						newSet.delete(id);
					}
				}
				return newSet;
			});
		},
		[],
	);

	return (
		<PageWrapper>
			<PageHeader title={t("settings.roles.title", "Role Management")} />
			<div className="space-y-6">
				<RoleList
					roles={roles}
					selectedRole={selectedRole}
					onRoleSelect={handleRoleChange}
				/>
				<PermissionsTable
					selectedRoleData={selectedRoleData}
					checkedPermissions={checkedPermissions}
					onTogglePermission={handlePermissionToggle}
					onSelectAllVisible={handleSelectAllVisible}
				/>
			</div>
		</PageWrapper>
	);
}
