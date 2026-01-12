import type { Route } from "./+types/admin.users";
import { Form } from "react-router";
import { requireAdmin } from "~/lib/auth.server";
import { getDatabase, type UserRole } from "~/db";
import { PageWrapper } from "~/components/layout/page-layout";
import { cn } from "~/lib/utils";
import { SITE_CONFIG } from "~/lib/config.server";

const USER_ROLES: UserRole[] = ["resident", "board_member", "admin"];

const ROLE_LABELS: Record<UserRole, { fi: string; en: string }> = {
	resident: { fi: "Asukas", en: "Resident" },
	board_member: { fi: "Hallituksen jäsen", en: "Board Member" },
	admin: { fi: "Ylläpitäjä", en: "Admin" },
};

const ROLE_COLORS: Record<UserRole, string> = {
	resident: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
	board_member: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
	admin: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

export function meta({ data }: Route.MetaArgs) {
	return [
		{ title: `${data?.siteConfig?.name || "Portal"} - Käyttäjähallinta / Users` },
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request }: Route.LoaderArgs) {
	const session = await requireAdmin(request);
	const db = getDatabase();
	const users = await db.getAllUsers();

	return {
		siteConfig: SITE_CONFIG,
		session,
		users,
	};
}

export async function action({ request }: Route.ActionArgs) {
	await requireAdmin(request);

	const formData = await request.formData();
	const userId = formData.get("userId") as string;
	const newRole = formData.get("role") as UserRole;

	if (userId && newRole && USER_ROLES.includes(newRole)) {
		const db = getDatabase();
		await db.updateUser(userId, { role: newRole });
	}

	return { success: true };
}

export default function AdminUsers({ loaderData }: Route.ComponentProps) {
	const { session, users } = loaderData;

	const roleCounts = USER_ROLES.reduce(
		(acc, role) => {
			acc[role] = users.filter((u) => u.role === role).length;
			return acc;
		},
		{} as Record<UserRole, number>
	);

	return (
		<PageWrapper>
			<div className="w-full max-w-6xl mx-auto px-4">
				{/* Header */}
				<div className="flex items-center justify-between mb-8">
					<div>
						<h1 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white">
							Käyttäjähallinta
						</h1>
						<p className="text-lg text-gray-500">User Management</p>
					</div>
					<div className="flex items-center gap-4">
						<div className="text-right">
							<p className="text-sm font-medium text-gray-900 dark:text-white">
								{session.name || session.email}
							</p>
							<p className="text-xs text-gray-500">{session.email}</p>
						</div>
						<a
							href="/auth/logout"
							className="px-4 py-2 text-sm font-bold text-gray-600 dark:text-gray-400 hover:text-primary transition-colors"
						>
							Kirjaudu ulos / Logout
						</a>
					</div>
				</div>

				{/* Navigation */}
				<div className="flex gap-4 mb-8">
					<a
						href="/admin/board"
						className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
					>
						Yhteydenotot / Submissions
					</a>
					<a
						href="/admin/users"
						className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-white"
					>
						Käyttäjät / Users
					</a>
				</div>

				{/* Stats */}
				<div className="grid grid-cols-3 gap-4 mb-8">
					{USER_ROLES.map((role) => (
						<div
							key={role}
							className={cn("p-4 rounded-xl text-center", ROLE_COLORS[role])}
						>
							<p className="text-3xl font-black">{roleCounts[role]}</p>
							<p className="text-xs font-bold uppercase tracking-wide opacity-75">
								{ROLE_LABELS[role].fi}
							</p>
						</div>
					))}
				</div>

				{/* Users Table */}
				<div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
					<div className="overflow-x-auto">
						<table className="w-full">
							<thead className="bg-gray-50 dark:bg-gray-900">
								<tr>
									<th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-500">
										Nimi / Name
									</th>
									<th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-500">
										Sähköposti / Email
									</th>
									<th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-500">
										Asunto / Apartment
									</th>
									<th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-500">
										Rooli / Role
									</th>
									<th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-500">
										Liittynyt / Joined
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
											Ei käyttäjiä / No users yet
										</td>
									</tr>
								) : (
									users.map((user) => (
										<UserRow key={user.id} user={user} />
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
		role: UserRole;
		apartmentNumber: string | null;
		createdAt: Date;
	};
}

function UserRow({ user }: UserRowProps) {
	const formattedDate = new Date(user.createdAt).toLocaleDateString("fi-FI", {
		day: "numeric",
		month: "short",
		year: "numeric",
	});

	return (
		<tr className="hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors">
			<td className="px-4 py-4">
				<p className="font-medium text-gray-900 dark:text-white">{user.name}</p>
			</td>
			<td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-400">
				{user.email}
			</td>
			<td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-400">
				{user.apartmentNumber || "-"}
			</td>
			<td className="px-4 py-4">
				<Form method="post" className="flex items-center gap-2">
					<input type="hidden" name="userId" value={user.id} />
					<select
						name="role"
						defaultValue={user.role}
						onChange={(e) => e.target.form?.requestSubmit()}
						className={cn(
							"px-3 py-1.5 rounded-lg text-sm font-medium border-0 cursor-pointer transition-colors",
							ROLE_COLORS[user.role]
						)}
					>
						{USER_ROLES.map((role) => (
							<option key={role} value={role}>
								{ROLE_LABELS[role].fi} / {ROLE_LABELS[role].en}
							</option>
						))}
					</select>
				</Form>
			</td>
			<td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
				{formattedDate}
			</td>
		</tr>
	);
}
