import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { RolePicker } from "~/components/role-picker";
import type { Role } from "~/db";

export interface UserWithRole {
	id: string;
	email: string;
	name: string;
	roleName: string;
	roleColor: string;
	roleIds: string[];
	apartmentNumber: string | null;
	createdAt: Date;
	isSuperAdmin?: boolean;
}

interface UsersTableProps {
	users: UserWithRole[];
	roles: Role[];
}

export function UsersTable({ users, roles }: UsersTableProps) {
	const { t } = useTranslation();

	return (
		<div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
			<div className="overflow-x-auto">
				<table className="w-full">
					<thead className="bg-gray-50 dark:bg-gray-900">
						<tr>
							<th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-500">
								{t("settings.users.headers.name") || "Name"}
							</th>
							<th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-500">
								{t("settings.users.headers.email") || "Email"}
							</th>
							<th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-500">
								{t("settings.users.headers.roles") || "Roles"}
							</th>
							<th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-500">
								{t("settings.users.headers.joined") || "Joined"}
							</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-gray-100 dark:divide-gray-700">
						{users.length === 0 ? (
							<tr>
								<td colSpan={4} className="px-4 py-12 text-center text-gray-500">
									{t("settings.users.no_users") || "No users found"}
								</td>
							</tr>
						) : (
							users.map((user) => (
								<UserRow key={user.id} user={user} roles={roles} />
							))
						)}
					</tbody>
				</table>
			</div>
		</div>
	);
}

interface UserRowProps {
	user: UserWithRole;
	roles: Role[];
}

function UserRow({ user, roles }: UserRowProps) {
	const fetcher = useFetcher<{ success: boolean; error?: string }>();
	const { t, i18n } = useTranslation();
	const formattedDate = new Date(user.createdAt).toLocaleDateString(
		i18n.language,
		{
			day: "numeric",
			month: "short",
			year: "numeric",
		},
	);

	// Show toast when role update completes
	useEffect(() => {
		if (fetcher.state === "idle" && fetcher.data) {
			if (fetcher.data.success) {
				toast.success(t("settings.users.role_updated") || "Role updated");
			} else {
				if (fetcher.data.error === "super_admin_protected") {
					toast.error(
						t("settings.users.cannot_change_super_admin") ||
							"Cannot change super admin role",
					);
				} else {
					toast.error(t("settings.users.update_failed") || "Update failed");
				}
			}
		}
	}, [fetcher.state, fetcher.data, t]);

	return (
		<tr className="hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors">
			<td className="px-4 py-4">
				<p className="font-medium text-gray-900 dark:text-white px-2">
					{user.name}
					{user.isSuperAdmin && (
						<span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
							{t("settings.users.super_admin") || "Super Admin"}
						</span>
					)}
				</p>
			</td>
			<td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-400">
				{user.email}
			</td>
			<td className="px-4 py-4">
				{user.isSuperAdmin ? (
					<span className="text-sm text-gray-400">—</span>
				) : (
					<div className="min-w-[200px]">
						<RolePicker
							selectedRoleIds={user.roleIds}
							availableRoles={roles.filter((r) => r.name !== "Guest")}
							onChange={(roleIds) => {
								const formData = new FormData();
								formData.set("userId", user.id);
								for (const id of roleIds) {
									formData.append("roleIds", id);
								}
								fetcher.submit(formData, { method: "post" });
							}}
							disabled={fetcher.state !== "idle"}
							listId={`roles-${user.id}`}
							label=""
						/>
					</div>
				)}
			</td>
			<td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
				{formattedDate}
			</td>
		</tr>
	);
}
