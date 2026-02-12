import { useTranslation } from "react-i18next";
import { PageWrapper, SplitLayout } from "~/components/layout/page-layout";
import { type SearchField, SearchMenu } from "~/components/search-menu";
import { handleUsersSettingsAction } from "~/components/settings/users-settings.server";
import {
	UsersTable,
	type UserWithRole,
} from "~/components/settings/users-table";
import { getDatabase } from "~/db/server";
import { isAdmin, requirePermission } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import { getSystemLanguageDefaults } from "~/lib/settings.server";
import type { Route } from "./+types/_index";

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

	const [users, roles, userRoleRows] = await Promise.all([
		db.getAllUsers(),
		db.getAllRoles(),
		db.getAllUserRoles(),
	]);

	const rolesByUser = new Map<string, string[]>();
	for (const row of userRoleRows) {
		const list = rolesByUser.get(row.userId) ?? [];
		list.push(row.roleId);
		rolesByUser.set(row.userId, list);
	}

	// Enrich users with role info
	const usersWithRoles: UserWithRole[] = users.map((user) => {
		const userRoleIds = rolesByUser.get(user.id) ?? [];
		const firstRole =
			userRoleIds.length > 0
				? roles.find((r) => r.id === userRoleIds[0])
				: null;
		return {
			...user,
			roleName: firstRole?.name || "Unknown",
			roleColor: firstRole?.color || "bg-gray-500",
			roleIds: userRoleIds,
			isSuperAdmin: isAdmin(user.email),
		};
	});

	// Filter by name if specified
	let filteredUsers = usersWithRoles;
	if (nameParam) {
		const nameLower = nameParam.toLowerCase();
		filteredUsers = usersWithRoles.filter((user) =>
			user.name.toLowerCase().includes(nameLower),
		);
	}

	const systemLanguages = await getSystemLanguageDefaults();
	return {
		siteConfig: SITE_CONFIG,
		users: filteredUsers,
		roles,
		systemLanguages,
	};
}

export async function action({ request }: Route.ActionArgs) {
	return handleUsersSettingsAction(request);
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
			placeholder: t("settings.users.search.name_placeholder", {
				defaultValue: "Search by name...",
			}),
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
					secondary: t("settings.users.title", {
						lng: systemLanguages.secondary ?? systemLanguages.primary,
					}),
				}}
				footer={footerContent}
			>
				<UsersTable users={users} roles={roles} />
			</SplitLayout>
		</PageWrapper>
	);
}
