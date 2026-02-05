import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { RolePicker } from "~/components/role-picker";
import { PageWrapper, SplitLayout } from "~/components/layout/page-layout";
import { SearchMenu, type SearchField } from "~/components/search-menu";
import { getDatabase, type Role } from "~/db";
import { isAdmin, requirePermission } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import { getSystemLanguageDefaults } from "~/lib/settings.server";
import { cn } from "~/lib/utils";
import type { Route } from "./+types/settings.users";

export function meta({ data }: Route.MetaArgs) {
	return [
		{
			title: `${data?.siteConfig?.name || "Portal"} - Käyttäjähallinta / Users`,
		},
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request }: Route.LoaderArgs) {
	// Throw 404 for unauthorized access to hide admin routes
	try {
		await requirePermission(request, "settings:users", getDatabase);
	} catch (_error) {
		throw new Response("Not Found", { status: 404 });
	}

	const db = getDatabase();
	const url = new URL(request.url);
	const nameParam = url.searchParams.get("name");

	const [users, roles, secondaryRows] = await Promise.all([
		db.getAllUsers(),
		db.getAllRoles(),
		db.getAllUserSecondaryRoles(),
	]);

	const secondaryByUser = new Map<string, string[]>();
	for (const row of secondaryRows) {
		const list = secondaryByUser.get(row.userId) ?? [];
		list.push(row.roleId);
		secondaryByUser.set(row.userId, list);
	}

	// Enrich users with role info and secondary role IDs
	let usersWithRoles = users.map((user) => {
		const userRole = roles.find((r) => r.id === user.roleId);
		return {
			...user,
			roleName: userRole?.name || "Unknown",
			roleColor: userRole?.color || "bg-gray-500",
			secondaryRoleIds: secondaryByUser.get(user.id) ?? [],
			isSuperAdmin: isAdmin(user.email),
		};
	});

	// Filter by name if specified
	if (nameParam) {
		const nameLower = nameParam.toLowerCase();
		usersWithRoles = usersWithRoles.filter((user) =>
			user.name.toLowerCase().includes(nameLower)
		);
	}

	const systemLanguages = await getSystemLanguageDefaults();
	return {
		siteConfig: SITE_CONFIG,
		users: usersWithRoles,
		roles,
		systemLanguages,
	};
}

export async function action({ request }: Route.ActionArgs) {
	// Check permission - return error JSON instead of throwing for fetcher compatibility
	try {
		await requirePermission(request, "users:manage_roles", getDatabase);
	} catch (_error) {
		return { success: false, error: "unauthorized" };
	}

	const formData = await request.formData();
	const userId = formData.get("userId") as string;
	const roleId = formData.get("roleId") as string;
	const secondaryRoleIds = (formData.getAll("secondaryRoleIds") as string[]).filter(
		Boolean,
	);

	if (!userId || !roleId) {
		return { success: false, error: "missing_fields" };
	}

	try {
		const db = getDatabase();

		// Check if target user is super admin - their role cannot be changed
		const targetUser = await db.getUserWithRole(userId);
		if (targetUser && isAdmin(targetUser.email)) {
			return { success: false, error: "super_admin_protected" };
		}

		await db.updateUser(userId, { roleId });
		await db.setUserSecondaryRoles(userId, secondaryRoleIds);

		return { success: true };
	} catch (error) {
		console.error("Failed to update user role:", error);
		return { success: false, error: "update_failed" };
	}
}

export default function AdminUsers({ loaderData }: Route.ComponentProps) {
	const { users, roles, systemLanguages } = loaderData;
	const { t } = useTranslation();

	// Configure search fields
	const searchFields: SearchField[] = [
		{
			name: "name",
			label: t("settings.users.headers.name"),
			type: "text",
			placeholder: t("settings.users.search.name_placeholder", { defaultValue: "Search by name..." }),
		},
	];

	const footerContent = (
		<div className="flex items-center gap-2">
			<SearchMenu fields={searchFields} />
		</div>
	);

	return (
		<PageWrapper>
			<SplitLayout
				header={{
					primary: t("settings.users.title", { lng: systemLanguages.primary }),
					secondary: t("settings.users.title", { lng: systemLanguages.secondary ?? systemLanguages.primary }),
				}}
				footer={footerContent}
			>
				{/* Users Table */}
				<div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
					<div className="overflow-x-auto">
						<table className="w-full">
							<thead className="bg-gray-50 dark:bg-gray-900">
								<tr>
									<th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-500">
										{t("settings.users.headers.name")}
									</th>
									<th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-500">
										{t("settings.users.headers.email")}
									</th>
									<th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-500">
										{t("settings.users.headers.apartment")}
									</th>
									<th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-500">
										{t("settings.users.headers.role")}
									</th>
									<th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-500">
										{t("settings.users.headers.secondary_roles")}
									</th>
									<th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-500">
										{t("settings.users.headers.joined")}
									</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-gray-100 dark:divide-gray-700">
								{users.length === 0 ? (
									<tr>
										<td
											colSpan={6}
											className="px-4 py-12 text-center text-gray-500"
										>
											{t("settings.users.no_users")}
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
			</SplitLayout>
		</PageWrapper>
	);
}

interface UserRowProps {
	user: {
		id: string;
		email: string;
		name: string;
		roleId: string;
		roleName: string;
		roleColor: string;
		secondaryRoleIds: string[];
		apartmentNumber: string | null;
		createdAt: Date;
		isSuperAdmin?: boolean;
	};
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
				toast.success(t("settings.users.role_updated"));
			} else {
				if (fetcher.data.error === "super_admin_protected") {
					toast.error(t("settings.users.cannot_change_super_admin"));
				} else {
					toast.error(t("settings.users.update_failed"));
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
							{t("settings.users.super_admin")}
						</span>
					)}
				</p>
			</td>
			<td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-400">
				{user.email}
			</td>
			<td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-400">
				{user.apartmentNumber || "-"}
			</td>
			<td className="px-4 py-4">
				{user.isSuperAdmin ? (
					<div
						className={cn(
							"px-3 py-1.5 rounded-lg text-sm font-medium border-0 inline-flex items-center gap-1.5 text-white opacity-90 cursor-not-allowed",
							user.roleColor,
						)}
					>
						<span className="material-symbols-outlined text-base">lock</span>
						{user.roleName}
					</div>
				) : (
					<fetcher.Form method="post">
						<input type="hidden" name="userId" value={user.id} />
						{user.secondaryRoleIds.map((id) => (
							<input
								key={id}
								type="hidden"
								name="secondaryRoleIds"
								value={id}
							/>
						))}
						<select
							name="roleId"
							defaultValue={user.roleId}
							onChange={(e) => e.target.form?.requestSubmit()}
							disabled={fetcher.state !== "idle"}
							className={cn(
								"px-3 py-1.5 rounded-lg text-sm font-medium border-0 cursor-pointer transition-colors text-white",
								user.roleColor,
								fetcher.state !== "idle" && "opacity-50 cursor-wait",
							)}
						>
							{roles.map((role) => (
								<option key={role.id} value={role.id}>
									{role.name}
								</option>
							))}
						</select>
					</fetcher.Form>
				)}
			</td>
			<td className="px-4 py-4">
				{user.isSuperAdmin ? (
					<span className="text-sm text-gray-400">—</span>
				) : (
					<div className="min-w-[200px]">
						<RolePicker
							selectedRoleIds={user.secondaryRoleIds}
							availableRoles={roles.filter(
								(r) => r.name !== "Guest" && r.id !== user.roleId,
							)}
							onChange={(secondaryRoleIds) => {
								const formData = new FormData();
								formData.set("userId", user.id);
								formData.set("roleId", user.roleId);
								for (const id of secondaryRoleIds) {
									formData.append("secondaryRoleIds", id);
								}
								fetcher.submit(formData, { method: "post" });
							}}
							disabled={fetcher.state !== "idle"}
							listId={`secondary-roles-${user.id}`}
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
