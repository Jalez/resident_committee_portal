import { useTranslation } from "react-i18next";
import { PageWrapper } from "~/components/layout/page-layout";
import { getDatabase } from "~/db";
import { requirePermission } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import { cn } from "~/lib/utils";
import type { Route } from "./+types/committee";

type CommitteeMember = {
	id: string;
	name: string;
	email: string;
	description: string | null;
	picture: string | null;
	primaryRole: { id: string; name: string; color: string };
	secondaryRoles: { id: string; name: string; color: string }[];
};

type CommitteeLoaderData = {
	siteConfig: typeof SITE_CONFIG;
	members: CommitteeMember[];
};

export function meta({ data }: Route.MetaArgs) {
	return [
		{
			title: `${data?.siteConfig?.name || "Portal"} - ${data?.siteConfig?.name || "Committee"}`,
		},
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request }: Route.LoaderArgs) {
	await requirePermission(request, "committee:read", getDatabase);

	const db = getDatabase();

	// Get "Board Member" role
	const boardMemberRole = await db.getRoleByName("Board Member");
	if (!boardMemberRole) {
		return {
			siteConfig: SITE_CONFIG,
			members: [],
		};
	}

	// Get all users with "Board Member" role (primary or secondary)
	const committeeUsers = await db.getUsersByRoleId(boardMemberRole.id);

	// Get all roles for color/name lookup
	const allRoles = await db.getAllRoles();
	const roleMap = new Map(allRoles.map((r) => [r.id, r]));

	// Get all secondary roles for committee members
	const allSecondaryRoles = await db.getAllUserSecondaryRoles();
	const secondaryRolesByUser = new Map<string, string[]>();
	for (const sr of allSecondaryRoles) {
		if (!secondaryRolesByUser.has(sr.userId)) {
			secondaryRolesByUser.set(sr.userId, []);
		}
		const userRoles = secondaryRolesByUser.get(sr.userId);
		if (userRoles) {
			userRoles.push(sr.roleId);
		}
	}

	// Build committee members list
	const members: CommitteeMember[] = [];
	for (const user of committeeUsers) {
		const primaryRole = roleMap.get(user.roleId);
		if (!primaryRole) continue;

		const secondaryRoleIds = secondaryRolesByUser.get(user.id) || [];
		const secondaryRoles = secondaryRoleIds
			.map((roleId) => {
				const role = roleMap.get(roleId);
				if (!role) return null;
				// Filter out "Board Member" if it's also the primary role to avoid duplication
				if (role.id === boardMemberRole.id && user.roleId === boardMemberRole.id) {
					return null;
				}
				return {
					id: role.id,
					name: role.name,
					color: role.color,
				};
			})
			.filter((r): r is { id: string; name: string; color: string } => r !== null);

		members.push({
			id: user.id,
			name: user.name,
			email: user.email,
			description: user.description || null,
			picture: user.picture || null,
			primaryRole: {
				id: primaryRole.id,
				name: primaryRole.name,
				color: primaryRole.color,
			},
			secondaryRoles,
		});
	}

	return {
		siteConfig: SITE_CONFIG,
		members,
	};
}

function getInitials(name: string): string {
	const parts = name.trim().split(/\s+/);
	if (parts.length === 0) return "?";
	if (parts.length === 1) return parts[0][0]?.toUpperCase() || "?";
	return (parts[0][0] || "") + (parts[parts.length - 1][0] || "");
}

export default function Committee({ loaderData }: Route.ComponentProps) {
	const { t } = useTranslation();
	const { members } = loaderData as CommitteeLoaderData;

	return (
		<PageWrapper>
			<div className="mx-auto w-full max-w-6xl px-4 py-8">
				{/* Header */}
				<div className="mb-8">
					<h1 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white">
						{t("committee.title")}
					</h1>
					<p className="mt-2 text-gray-600 dark:text-gray-400">
						{t("committee.members")}
					</p>
				</div>

				{/* Members Grid */}
				{members.length === 0 ? (
					<div className="text-center py-12">
						<p className="text-gray-500 dark:text-gray-400">
							{t("committee.no_members")}
						</p>
					</div>
				) : (
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
						{members.map((member) => (
							<div
								key={member.id}
								className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 flex flex-col"
							>
								{/* Profile Picture and Name */}
								<div className="flex items-center gap-4 mb-4">
									{member.picture ? (
										<img
											src={member.picture}
											alt={member.name}
											className="w-16 h-16 rounded-full object-cover border-2 border-gray-200 dark:border-gray-700"
										/>
									) : (
										<div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center border-2 border-gray-200 dark:border-gray-700">
											<span className="text-xl font-bold text-primary">
												{getInitials(member.name)}
											</span>
										</div>
									)}
									<div className="flex-1 min-w-0">
										<h3 className="text-lg font-bold text-gray-900 dark:text-white truncate">
											{member.name}
										</h3>
										{/* Primary Role */}
										<div className="mt-1">
											<span
												className={cn(
													"inline-flex items-center px-2 py-1 rounded-md text-xs font-medium",
													member.primaryRole.color,
													"text-white",
												)}
											>
												{member.primaryRole.name}
											</span>
										</div>
									</div>
								</div>

								{/* Secondary Roles */}
								{member.secondaryRoles.length > 0 && (
									<div className="mb-4">
										<p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
											{t("committee.secondary_roles")}:
										</p>
										<div className="flex flex-wrap gap-2">
											{member.secondaryRoles.map((role) => (
												<span
													key={role.id}
													className={cn(
														"inline-flex items-center px-2 py-1 rounded-md text-xs font-medium",
														role.color,
														"text-white",
													)}
												>
													{role.name}
												</span>
											))}
										</div>
									</div>
								)}

								{/* Description */}
								{member.description ? (
									<p className="text-sm text-gray-600 dark:text-gray-300 mt-auto pt-4 border-t border-gray-200 dark:border-gray-700">
										{member.description}
									</p>
								) : (
									<p className="text-xs text-gray-400 dark:text-gray-500 mt-auto pt-4 border-t border-gray-200 dark:border-gray-700 italic">
										{t("committee.no_description")}
									</p>
								)}
							</div>
						))}
					</div>
				)}
			</div>
		</PageWrapper>
	);
}
