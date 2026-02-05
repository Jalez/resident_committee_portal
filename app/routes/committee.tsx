import { useTranslation } from "react-i18next";
import { CommitteeMemberCard } from "~/components/committee/committee-member-card";
import { PageWrapper, SplitLayout } from "~/components/layout/page-layout";
import { getDatabase } from "~/db";
import { requirePermission } from "~/lib/auth.server";
import { getSystemLanguageDefaults } from "~/lib/settings.server";
import { SITE_CONFIG } from "~/lib/config.server";
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
	systemLanguages: { primary: string; secondary: string | null };
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
		const systemLanguages = await getSystemLanguageDefaults();
		return {
			siteConfig: SITE_CONFIG,
			members: [],
			systemLanguages,
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

	const systemLanguages = await getSystemLanguageDefaults();
	return {
		siteConfig: SITE_CONFIG,
		members,
		systemLanguages,
	};
}

export default function Committee({ loaderData }: Route.ComponentProps) {
	const { t } = useTranslation();
	const { members, systemLanguages } = loaderData as CommitteeLoaderData;

	return (
		<PageWrapper>
			<SplitLayout
				header={{
					primary: t("committee.title", { lng: systemLanguages.primary }),
					secondary: t("committee.title", { lng: systemLanguages.secondary ?? systemLanguages.primary }),
				}}
			>
				<p className="mt-2 mb-8 text-gray-600 dark:text-gray-400">
					{t("committee.members")}
				</p>

				{members.length === 0 ? (
					<div className="text-center py-12">
						<p className="text-gray-500 dark:text-gray-400">
							{t("committee.no_members")}
						</p>
					</div>
				) : (
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
						{members.map((member) => (
							<CommitteeMemberCard
								key={member.id}
								member={member}
								noDescriptionLabel={t("committee.no_description")}
							/>
						))}
					</div>
				)}
			</SplitLayout>
		</PageWrapper>
	);
}
