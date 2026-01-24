import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { PageWrapper } from "~/components/layout/page-layout";
import { getDatabase, type Role } from "~/db";
import { isAdmin, requirePermission } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
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
	const [users, roles] = await Promise.all([
		db.getAllUsers(),
		db.getAllRoles(),
	]);

	// Enrich users with role info
	const usersWithRoles = users.map((user) => {
		const userRole = roles.find((r) => r.id === user.roleId);
		return {
			...user,
			roleName: userRole?.name || "Unknown",
			roleColor: userRole?.color || "bg-gray-500",
			isSuperAdmin: isAdmin(user.email),
		};
	});

	return {
		siteConfig: SITE_CONFIG,
		users: usersWithRoles,
		roles,
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

		return { success: true };
	} catch (error) {
		console.error("Failed to update user role:", error);
		return { success: false, error: "update_failed" };
	}
}

export default function AdminUsers({ loaderData }: Route.ComponentProps) {
	const { users, roles } = loaderData;
	const { t } = useTranslation();

	return (
		<PageWrapper>
			<div className="w-full max-w-6xl mx-auto px-4">
				{/* Header */}
				<div className="flex items-center justify-between mb-8">
					<div>
						<h1 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white">
							{t("settings.users.title")}
						</h1>
					</div>
				</div>

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
										{t("settings.users.headers.joined")}
									</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-gray-100 dark:divide-gray-700">
								{users.length === 0 ? (
									<tr>
										<td
											colSpan={5}
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
			</div>
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
			<td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
				{formattedDate}
			</td>
		</tr>
	);
}
